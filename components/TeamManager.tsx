import { useEffect, useState } from "preact/hooks";
import { imageDB } from "../utils/idb.ts";

interface TeamManagerProps {
  onTeamIdsChange: (teamIds: string[]) => void;
}

export default function TeamManager({ onTeamIdsChange }: TeamManagerProps) {
  const [teamIds, setTeamIds] = useState<string[]>(["personal"]);
  const [newTeamId, setNewTeamId] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadTeamIds = async () => {
      try {
        const savedTeamIds = await imageDB.getUserTeamIds();
        setTeamIds(savedTeamIds);
        onTeamIdsChange(savedTeamIds);
      } catch (error) {
        console.warn("Failed to load team IDs:", error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadTeamIds();
  }, []);

  const addTeamId = async () => {
    if (!newTeamId.trim() || teamIds.includes(newTeamId.trim())) return;

    const updatedTeamIds = [...teamIds, newTeamId.trim()];
    setTeamIds(updatedTeamIds);
    setNewTeamId("");

    try {
      await imageDB.saveUserTeamIds(updatedTeamIds);
      onTeamIdsChange(updatedTeamIds);
    } catch (error) {
      console.error("Failed to save team IDs:", error);
    }
  };

  const removeTeamId = async (teamIdToRemove: string) => {
    const updatedTeamIds = teamIds.filter((id) => id !== teamIdToRemove);
    setTeamIds(updatedTeamIds);

    try {
      await imageDB.saveUserTeamIds(updatedTeamIds);
      onTeamIdsChange(updatedTeamIds);
    } catch (error) {
      console.error("Failed to save team IDs:", error);
    }
  };

  if (!isLoaded) return <div>Loading team settings...</div>;

  return (
    <div class="mb-4 p-4 border rounded-lg bg-gray-50">
      <h3 class="text-lg font-semibold mb-3">Team Management</h3>

      <div class="mb-3">
        <label class="block text-sm font-medium mb-2">Active Teams:</label>
        <div class="flex flex-wrap gap-2">
          {teamIds.map((teamId) => (
            <span
              key={teamId}
              class="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
            >
              {teamId}
              {teamId !== "personal" && (
                <button
                  onClick={() => removeTeamId(teamId)}
                  class="ml-2 text-blue-600 hover:text-blue-800"
                  type="button"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      <div class="flex gap-2">
        <input
          type="text"
          value={newTeamId}
          onInput={(e) => setNewTeamId((e.target as HTMLInputElement).value)}
          placeholder="Add team ID (e.g., team-abc123)"
          class="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          onKeyPress={(e) => e.key === "Enter" && addTeamId()}
        />
        <button
          onClick={addTeamId}
          disabled={!newTeamId.trim() || teamIds.includes(newTeamId.trim())}
          class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          type="button"
        >
          Add Team
        </button>
      </div>

      <p class="text-xs text-gray-600 mt-2">
        Add team IDs to fetch images from multiple ChatGPT teams. Use "personal"
        for your personal account.
      </p>
    </div>
  );
}
