import { useEffect, useState } from "preact/hooks";
import { TeamAccount } from "../lib/types.ts";
import { createChatGPTClient } from "../lib/chatgpt-client.ts";

interface TeamSelectorProps {
  accessToken: string;
  selectedTeamId: string;
  onTeamChange: (teamId: string) => void;
  className?: string;
}

export default function TeamSelector({
  accessToken,
  selectedTeamId,
  onTeamChange,
  className = "",
}: TeamSelectorProps) {
  const [teams, setTeams] = useState<TeamAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  // localStorage cache keys
  const getCacheKey = (token: string) =>
    `teams_cache_${token.substring(0, 10)}`;
  const getTimestampKey = (token: string) =>
    `teams_timestamp_${token.substring(0, 10)}`;
  const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

  // Load teams from localStorage cache
  const loadFromCache = (token: string): TeamAccount[] | null => {
    try {
      const cacheKey = getCacheKey(token);
      const timestampKey = getTimestampKey(token);

      const cachedData = localStorage.getItem(cacheKey);
      const cachedTimestamp = localStorage.getItem(timestampKey);

      if (cachedData && cachedTimestamp) {
        const timestamp = parseInt(cachedTimestamp, 10);
        const now = Date.now();

        if (now - timestamp < CACHE_DURATION) {
          console.log("Loading teams from localStorage cache");
          return JSON.parse(cachedData);
        }
      }
    } catch (error) {
      console.warn("Error reading teams from cache:", error);
    }
    return null;
  };

  // Save teams to localStorage cache
  const saveToCache = (token: string, teamsData: TeamAccount[]) => {
    try {
      const cacheKey = getCacheKey(token);
      const timestampKey = getTimestampKey(token);

      localStorage.setItem(cacheKey, JSON.stringify(teamsData));
      localStorage.setItem(timestampKey, Date.now().toString());
      console.log(`Cached ${teamsData.length} teams`);
    } catch (error) {
      console.warn("Error saving teams to cache:", error);
    }
  };

  const fetchTeams = async (forceRefresh = false) => {
    if (!accessToken) {
      setTeams([]);
      return;
    }

    // Check localStorage cache first
    if (!forceRefresh) {
      const cachedTeams = loadFromCache(accessToken);
      if (cachedTeams) {
        setTeams(cachedTeams);
        return;
      }
    }

    // Avoid too frequent API calls unless forced
    const now = Date.now();
    if (!forceRefresh && now - lastFetchTime < 30000) { // 30 seconds rate limit
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Call the ChatGPT client directly instead of making round trip through API
      const client = createChatGPTClient({ accessToken });
      const fetchedTeams = await client.fetchTeamList();

      setTeams(fetchedTeams);
      setLastFetchTime(now);

      // Save to localStorage cache
      saveToCache(accessToken, fetchedTeams);

      // Auto-select personal account if no valid selection
      if (
        fetchedTeams.length > 0 &&
        !fetchedTeams.find((t: TeamAccount) => t.id === selectedTeamId)
      ) {
        const personalTeam = fetchedTeams.find((t: TeamAccount) =>
          t.id === "" || t.id === "personal"
        );
        if (personalTeam) {
          // Always use "personal" as the normalized team ID for personal accounts
          onTeamChange(personalTeam.id === "" ? "personal" : personalTeam.id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch teams:", err);
      setError((err as Error).message);
      setTeams([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchTeams();
  }, [accessToken]);

  if (!accessToken) {
    return null;
  }

  if (loading) {
    return (
      <div class={`${className}`}>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          团队选择：
        </label>
        <div class="flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700">
          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2">
          </div>
          <span class="text-sm text-gray-600 dark:text-gray-400">
            加载团队列表...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div class={`${className}`}>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          团队选择：
        </label>
        <div class="px-3 py-2 border border-red-300 dark:border-red-600 rounded-md bg-red-50 dark:bg-red-900/20">
          <div class="flex items-center justify-between">
            <span class="text-sm text-red-600 dark:text-red-400">{error}</span>
            <button
              onClick={() => fetchTeams(true)}
              class="ml-2 text-xs text-blue-600 dark:text-blue-400 hover:underline focus:outline-none"
              type="button"
            >
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div class={`${className}`}>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          团队选择：
        </label>
        <div class="flex items-center justify-between px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700">
          <span class="text-sm text-gray-600 dark:text-gray-400">
            未找到团队账户
          </span>
          <button
            onClick={() => fetchTeams(true)}
            class="text-xs text-blue-600 dark:text-blue-400 hover:underline focus:outline-none"
            type="button"
            title="刷新团队列表"
          >
            🔄
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class={`${className}`}>
      <div class="flex items-center justify-between mb-1">
        <label
          for="teamSelector"
          class="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          团队选择：
        </label>
        <button
          onClick={() => fetchTeams(true)}
          class="text-xs text-blue-600 dark:text-blue-400 hover:underline focus:outline-none"
          type="button"
          title="刷新团队列表"
        >
          🔄 刷新
        </button>
      </div>{" "}
      <select
        id="teamSelector"
        value={selectedTeamId}
        onChange={(e) => {
          const value = (e.target as HTMLSelectElement).value;
          // Normalize empty string to "personal" for consistency
          const finalValue = value === "" ? "personal" : value;
          console.log(
            "TeamSelector: Team changed from",
            selectedTeamId,
            "to",
            finalValue,
          );
          onTeamChange(finalValue);
        }}
        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
      >
        {teams.map((team: TeamAccount) => (
          <option
            key={team.id || "personal"}
            value={team.id || "personal"}
            disabled={team.is_deactivated}
          >
            {team.display_name}
            {team.is_deactivated ? " (已禁用)" : ""}
          </option>
        ))}
      </select>
      {teams.length > 1 && (
        <div class="flex items-center justify-between mt-1">
          <p class="text-xs text-gray-500 dark:text-gray-400">
            选择要查看图像的账户或团队工作区 ({teams.length} 个可用)
          </p>
          {teams.some((t: TeamAccount) => t.is_deactivated) && (
            <span class="text-xs text-orange-500 dark:text-orange-400">
              ⚠️ 部分团队已禁用
            </span>
          )}
        </div>
      )}
    </div>
  );
}
