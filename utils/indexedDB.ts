import { DBSchema, IDBPDatabase, openDB } from "idb";

interface ImageMetadata {
  id: string;
  url: string;
  originalUrl?: string;
  width: number;
  height: number;
  title: string;
  created_at: number;
  metadata?: any;
  encodings: {
    thumbnail: {
      path: string;
      originalPath?: string;
      blobUrl?: string;
    };
  };
  lastUpdated: number;
}

interface UserSettings {
  id: "userTeams";
  teamIds: string[];
  lastUpdated: number;
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
  // Settings and team management
  settings: {
    key: string;
    value: UserSettings;
  };
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
  private readonly version = 5; // Incremented for metadata tracking

  async init(): Promise<void> {
    if (this.db) return;

    this.db = await openDB<ChatGPTGalleryDB>(this.dbName, this.version, {
      upgrade(db, oldVersion, newVersion, transaction) {
        // Handle settings store
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "id" });
        }

        // Handle teams store
        if (!db.objectStoreNames.contains("teams")) {
          const teamsStore = db.createObjectStore("teams", { keyPath: "id" });
          teamsStore.createIndex("by-lastSync", "lastSync");
        }

        // Migration from v3 to v4: Move from single images table to team-specific tables
        if (oldVersion < 4 && newVersion >= 4) {
          // Migrate old images table if it exists
          if (db.objectStoreNames.contains("images")) {
            const oldImagesStore = transaction.objectStore("images");
            const teamDataMap = new Map<string, ImageMetadata[]>();

            oldImagesStore.openCursor().then(function migrateCursor(cursor) {
              if (!cursor) {
                // After processing all images, create team tables
                for (const [teamId, images] of teamDataMap) {
                  const teamTableName = `team_${this.sanitizeTeamId(teamId)}`;
                  if (!db.objectStoreNames.contains(teamTableName)) {
                    const teamStore = db.createObjectStore(teamTableName, {
                      keyPath: "id",
                    });
                    teamStore.createIndex("by-created", "created_at");
                  }
                }
                return;
              }

              const image = cursor.value as ImageMetadata;
              const teamId = image.teamId || "personal";

              if (!teamDataMap.has(teamId)) {
                teamDataMap.set(teamId, []);
              }
              teamDataMap.get(teamId)!.push(image);

              return cursor.continue().then(migrateCursor);
            });

            // Schedule deletion of old images table after migration
            setTimeout(() => {
              if (db.objectStoreNames.contains("images")) {
                // Note: Can't delete stores during upgrade, will clean up on next version bump
                console.log(
                  "Migration completed. Old images table will be cleaned up in next version.",
                );
              }
            }, 1000);
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
          if (!db.objectStoreNames.contains("settings")) {
            db.createObjectStore("settings", { keyPath: "id" });
          }
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
      name: teamId === "personal" ? "Personal Workspace" : `Team: ${teamId}`,
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

  async saveUserTeamIds(teamIds: string[]): Promise<void> {
    await this.init();
    await this.db!.put("settings", {
      id: "userTeams",
      teamIds,
      lastUpdated: Date.now(),
    });

    // Ensure team info exists for all teams
    for (const teamId of teamIds) {
      const existing = await this.getTeamInfo(teamId);
      if (!existing) {
        await this.updateTeamInfo(teamId);
      }
    }
  }

  async getUserTeamIds(): Promise<string[]> {
    await this.init();
    const settings = await this.db!.get("settings", "userTeams");
    return settings?.teamIds || ["personal"];
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
