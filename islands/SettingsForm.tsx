import { useEffect, useState } from "preact/hooks";
import { useLocalStorage } from "../hooks/useLocalStorage.ts";

export default function SettingsForm() {
  const [token, setToken] = useLocalStorage<string>("chatgpt_api_token", "");
  const [teamId, setTeamId] = useLocalStorage<string>("chatgpt_team_id", "");
  const [batchSize, setBatchSize] = useLocalStorage<number>("chatgpt_batch_size", 50);
  const [includeMetadata, setIncludeMetadata] = useLocalStorage<boolean>("chatgpt_include_metadata", true);

  const handleSaveSettings = () => {
    if (!token.trim()) {
      alert("Please enter a valid API token");
      return;
    }

    setToken(token.trim());
    if (teamId.trim()) {
      setTeamId(teamId.trim());
    } else {
      setTeamId("");
    }
    setBatchSize(batchSize);
    setIncludeMetadata(includeMetadata);

    // Trigger custom event for gallery reload
    window.dispatchEvent(new CustomEvent("settingsSaved"));

    // Show notification
    const notification = document.getElementById("notification");
    if (notification) {
      notification.classList.remove("translate-x-full");
      notification.classList.add("translate-x-0");
      setTimeout(() => {
        notification.classList.add("translate-x-full");
        notification.classList.remove("translate-x-0");
      }, 3000);
    }
  };

  return (
    <>
      <div class="mb-4">
        <label
          for="tokenInput"
          class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          ChatGPT API Token:
        </label>
        <input
          type="password"
          id="tokenInput"
          placeholder="Enter your ChatGPT API token"
          value={token}
          onInput={(e) => setToken((e.target as HTMLInputElement).value)}
          class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
        />
      </div>
      <div class="mb-4">
        <label
          for="teamIdInput"
          class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Team ID (Optional):
        </label>
        <input
          type="text"
          id="teamIdInput"
          placeholder="Enter Team ID for team workspace"
          value={teamId}
          onInput={(e) => setTeamId((e.target as HTMLInputElement).value)}
          class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
        />
      </div>
      <div class="mb-4 sm:flex sm:items-center sm:gap-4">
        <button
          onClick={handleSaveSettings}
          class="w-full sm:w-auto bg-primary text-white px-6 py-3 rounded hover:bg-primaryDark transition-colors mb-3 sm:mb-0"
        >
          Save Settings & Load Images
        </button>
        <div class="flex items-center gap-2">
          <label
            for="batchSizeInput"
            class="text-sm text-gray-700 dark:text-gray-300"
          >
            API Batch size:
          </label>
          <input
            type="number"
            id="batchSizeInput"
            min="1"
            max="1000"
            step="1"
            value={batchSize}
            onInput={(e) =>
              setBatchSize(
                parseInt((e.target as HTMLInputElement).value) || 50,
              )}
            class="w-24 p-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <span class="text-xs text-gray-400 dark:text-gray-500">
            (1-1000, for API metadata)
          </span>
        </div>
      </div>
      <div class="mb-4">
        <label
          for="includeMetadataCheckbox"
          class="flex items-center text-sm text-gray-700 dark:text-gray-300"
        >
          <input
            type="checkbox"
            id="includeMetadataCheckbox"
            checked={includeMetadata}
            onChange={(e) =>
              setIncludeMetadata((e.target as HTMLInputElement).checked)}
            class="mr-2 h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
          />
          Include metadata.json in ZIP
        </label>
      </div>
    </>
  );
}
