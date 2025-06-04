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
      console.error("保存团队 ID 失败:", error);
    }
  };
  const removeTeamId = async (teamIdToRemove: string) => {
    const updatedTeamIds = teamIds.filter((id) => id !== teamIdToRemove);
    setTeamIds(updatedTeamIds);

    try {
      await imageDB.saveUserTeamIds(updatedTeamIds);
      onTeamIdsChange(updatedTeamIds);
    } catch (error) {
      console.error("保存团队 ID 失败:", error);
    }
  };

  if (!isLoaded) return <div>加载团队设置中...</div>;

  return (
    <div class="mb-4 p-4 border rounded-lg bg-gray-50">
      <h3 class="text-lg font-semibold mb-3">团队管理</h3>

      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          活跃团队:
        </label>
        <div class="flex flex-wrap gap-2">
          {teamIds.map((teamId) => (
            <span
              key={teamId}
              class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-700"
            >
              {teamId}
              {teamId !== "personal" && (
                <button
                  onClick={() => removeTeamId(teamId)}
                  class="ml-1 w-5 h-5 flex items-center justify-center rounded-full cursor-pointer transition-colors hover:bg-black/10 dark:hover:bg-white/10 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                  type="button"
                  title="移除团队"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      <div class="flex gap-4 sm:flex-row flex-col sm:items-end">
        <input
          type="text"
          value={newTeamId}
          onInput={(e) => setNewTeamId((e.target as HTMLInputElement).value)}
          placeholder="添加团队 ID（例如：team-abc123）"
          class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          onKeyPress={(e) => e.key === "Enter" && addTeamId()}
        />
        <button
          onClick={addTeamId}
          disabled={!newTeamId.trim() || teamIds.includes(newTeamId.trim())}
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          type="button"
        >
          添加团队
        </button>
      </div>

      <p class="text-xs text-gray-600 dark:text-gray-400 mt-2">
        添加团队 ID 以从多个 ChatGPT 团队获取图像。对于个人账户请使用
        "personal"。
      </p>
    </div>
  );
}
