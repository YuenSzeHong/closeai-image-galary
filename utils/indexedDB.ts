import { DBSchema, IDBPDatabase, openDB } from "idb";

interface ImageMetadata {
  id: string;
  title: string;
  url: string;
  urlExpiry?: Date;
  width: number;
  height: number;
  created_at: number;
  conversation_id?: string;
  message_id?: string;
  tags: string[];
  isUrlValid: boolean;
}

interface TeamInfo {
  id: string;
  name: string;
  lastSync: number;
  imageCount: number;
  // Add metadata sync tracking
  lastMetadataSync: number;
  metadataFetched: boolean;
}

interface ChatGPTGalleryDB extends DBSchema {
  // Remove settings store - use localStorage instead
  teams: {
    key: string;
    value: TeamInfo;
    indexes: {
      "by-lastSync": number;
    };
  };
  // Dynamic team tables will be created as needed
  // Format: "team_${teamId}" -> ImageMetadata[]
}

class ImageMetadataDB {
  private db: IDBPDatabase<ChatGPTGalleryDB> | null = null;
  private readonly dbName = "ChatGPTGallery";
  private readonly version = 6; // Incremented to remove settings store

  async init(): Promise<void> {
    if (this.db) return;

    this.db = await openDB<ChatGPTGalleryDB>(this.dbName, this.version, {
      upgrade(db, oldVersion, newVersion, transaction) {
        // Remove settings store creation

        // Handle teams store
        if (!db.objectStoreNames.contains("teams")) {
          const teamsStore = db.createObjectStore("teams", { keyPath: "id" });
          teamsStore.createIndex("by-lastSync", "lastSync");
        }

        // Migration from v3 to v4: Move from single images table to team-specific tables
        if (oldVersion < 4 && newVersion >= 4) {
          // Migrate old images table if it exists
          if (db.objectStoreNames.contains("images")) {
            // Note: Migration will be handled after upgrade completes
            // Can't perform async operations during upgrade callback
            console.log("Old images table detected - will clean up on next access");
          }
        }

        // Migration from v4 to v5: Add metadata tracking fields
        if (oldVersion < 5 && newVersion >= 5) {
          // Update existing team records to include metadata tracking
          if (db.objectStoreNames.contains("teams")) {
            // This will be handled by updateTeamInfo method calls
            console.log("Upgrading teams table for metadata tracking");
          }
        }

        // Migration from v5 to v6: Remove settings store
        if (oldVersion < 6 && newVersion >= 6) {
          if (db.objectStoreNames.contains("settings")) {
            db.deleteObjectStore("settings");
            console.log("Removed settings store - using localStorage instead");
          }
        }
      },
    });
  }

  private sanitizeTeamId(teamId: string): string {
    // Sanitize team ID for use as table name
    return teamId.replace(/[^a-zA-Z0-9_]/g, "_");
  }

  private getTeamTableName(teamId: string): string {
    return `team_${this.sanitizeTeamId(teamId)}`;
  }

  private async ensureTeamTable(teamId: string): Promise<void> {
    const tableName = this.getTeamTableName(teamId);

    if (!this.db!.objectStoreNames.contains(tableName)) {
      // Need to increment version and recreate database to add new object store
      this.db!.close();
      this.db = null;

      const newVersion = await this.getCurrentVersion() + 1;
      this.db = await openDB<ChatGPTGalleryDB>(this.dbName, newVersion, {
        upgrade(db, oldVersion, newVersion, transaction) {
          // Recreate existing stores if needed
          if (!db.objectStoreNames.contains("teams")) {
            const teamsStore = db.createObjectStore("teams", { keyPath: "id" });
            teamsStore.createIndex("by-lastSync", "lastSync");
          }

          // Create the new team table
          if (!db.objectStoreNames.contains(tableName)) {
            const teamStore = db.createObjectStore(tableName, {
              keyPath: "id",
            });
            teamStore.createIndex("by-created", "created_at");
          }
        },
      });
    }
  }

  private async getCurrentVersion(): Promise<number> {
    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName);
      request.onsuccess = () => {
        const version = request.result.version;
        request.result.close();
        resolve(version);
      };
      request.onerror = () => resolve(this.version);
    });
  }

  async saveImages(
    images: Omit<ImageMetadata, "lastUpdated">[],
    teamId: string,
  ): Promise<void> {
    await this.init();
    await this.ensureTeamTable(teamId);

    const tableName = this.getTeamTableName(teamId);
    const tx = this.db!.transaction(tableName, "readwrite");

    await Promise.all(
      images.map((image) => {
        const normalizedImage = {
          ...image,
          lastUpdated: Date.now(),
        };
        return tx.store.put(normalizedImage);
      }),
    );

    await tx.done;

    // Update team info
    await this.updateTeamInfo(teamId, images.length);
  }

  async getImagesByTeam(teamId: string): Promise<ImageMetadata[]> {
    await this.init();
    const tableName = this.getTeamTableName(teamId);

    if (!this.db!.objectStoreNames.contains(tableName)) {
      return [];
    }

    const images = await this.db!.getAllFromIndex(tableName, "by-created");
    return images.sort((a, b) => b.created_at - a.created_at);
  }

  async getImagesByTeams(teamIds: string[]): Promise<ImageMetadata[]> {
    await this.init();
    const results: ImageMetadata[] = [];

    for (const teamId of teamIds) {
      const teamImages = await this.getImagesByTeam(teamId);
      results.push(...teamImages);
    }

    return results.sort((a, b) => b.created_at - a.created_at);
  }

  async getImageById(
    id: string,
    teamId: string,
  ): Promise<ImageMetadata | undefined> {
    await this.init();
    const tableName = this.getTeamTableName(teamId);

    if (!this.db!.objectStoreNames.contains(tableName)) {
      return undefined;
    }

    return this.db!.get(tableName, id);
  }

  async deleteImagesByTeam(teamId: string): Promise<void> {
    await this.init();
    const tableName = this.getTeamTableName(teamId);

    if (!this.db!.objectStoreNames.contains(tableName)) {
      return;
    }

    await this.db!.clear(tableName);
    await this.updateTeamInfo(teamId, 0);
  }

  async deleteImagesByTeams(teamIds: string[]): Promise<void> {
    for (const teamId of teamIds) {
      await this.deleteImagesByTeam(teamId);
    }
  }

  async clearCurrentTeamImages(teamIds: string[]): Promise<void> {
    return this.deleteImagesByTeams(teamIds);
  }

  async clearAllImages(): Promise<void> {
    await this.init();
    const teams = await this.getAllTeams();

    for (const teamId of teams) {
      await this.deleteImagesByTeam(teamId);
    }
  }

  async getAllTeams(): Promise<string[]> {
    await this.init();
    const teams = await this.db!.getAll("teams");
    return teams.map((team) => team.id).sort();
  }

  async updateTeamInfo(teamId: string, imageCount?: number, options?: {
    metadataFetched?: boolean;
    lastMetadataSync?: number;
  }): Promise<void> {
    await this.init();

    const existing = await this.db!.get("teams", teamId);
    const teamInfo: TeamInfo = {
      id: teamId,
      name: teamId === "personal" ? "个人工作区" : `团队：${teamId}`,
      lastSync: Date.now(),
      imageCount: imageCount ?? (existing?.imageCount || 0),
      lastMetadataSync: options?.lastMetadataSync ??
        (existing?.lastMetadataSync || 0),
      metadataFetched: options?.metadataFetched ??
        (existing?.metadataFetched || false),
    };

    await this.db!.put("teams", teamInfo);
  }

  async getTeamInfo(teamId: string): Promise<TeamInfo | undefined> {
    await this.init();
    return this.db!.get("teams", teamId);
  }

  async getImageCount(teamIds?: string[]): Promise<number> {
    await this.init();

    if (!teamIds || teamIds.length === 0) {
      const teams = await this.getAllTeams();
      teamIds = teams;
    }

    let totalCount = 0;
    for (const teamId of teamIds) {
      const teamInfo = await this.getTeamInfo(teamId);
      if (teamInfo) {
        totalCount += teamInfo.imageCount;
      } else {
        // Fallback: count images directly
        const teamImages = await this.getImagesByTeam(teamId);
        totalCount += teamImages.length;
      }
    }
    return totalCount;
  }

  async getTeamImageCounts(): Promise<Record<string, number>> {
    await this.init();
    const teams = await this.getAllTeams();
    const counts: Record<string, number> = {};

    for (const teamId of teams) {
      counts[teamId] = await this.getImageCount([teamId]);
    }

    return counts;
  }

  async isMetadataFetched(teamId: string): Promise<boolean> {
    await this.init();
    const teamInfo = await this.getTeamInfo(teamId);
    return teamInfo?.metadataFetched || false;
  }

  async getLastMetadataSync(teamId: string): Promise<number> {
    await this.init();
    const teamInfo = await this.getTeamInfo(teamId);
    return teamInfo?.lastMetadataSync || 0;
  }

  async markMetadataFetched(teamId: string): Promise<void> {
    await this.updateTeamInfo(teamId, undefined, {
      metadataFetched: true,
      lastMetadataSync: Date.now(),
    });
  }

  async needsMetadataRefresh(
    teamId: string,
    maxAge = 3600000,
  ): Promise<boolean> {
    const lastSync = await this.getLastMetadataSync(teamId);
    return Date.now() - lastSync > maxAge;
  }
}

export const imageMetadataDB = new ImageMetadataDB();
export type { ImageMetadata, TeamInfo };
