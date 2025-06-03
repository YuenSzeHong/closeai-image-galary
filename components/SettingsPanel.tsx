import SettingsForm from "../islands/SettingsForm.tsx";

export default function SettingsPanel() {
  return (
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
      <div
        id="errorMessage"
        class="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 p-4 rounded mb-4 hidden"
      >
      </div>
      <SettingsForm />
      
      {/* Database Management Section */}
      <div class="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Local Storage Management
        </h3>
        <div class="flex gap-2 mb-4">
          <button
            id="clearCurrentTeamBtn"
            class="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 transition-colors text-sm"
          >
            Clear Current Workspace
          </button>
          <button
            id="clearAllDataBtn"
            class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors text-sm"
          >
            Clear All Data
          </button>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          Images are cached locally for faster loading. Use these buttons to clear cached data if needed.
        </p>
      </div>

      <div class="text-sm text-gray-600 dark:text-gray-400">
        <p class="mb-2">
          Provide your ChatGPT API token. For team workspaces, also provide the
          Team ID. Settings are stored locally.
        </p>
        <p class="font-semibold mb-1 text-gray-700 dark:text-gray-300">
          How to get API Token & Team ID:
        </p>
        <ol class="list-decimal pl-5 space-y-1 mb-3">
          <li>
            Login to{" "}
            <a
              href="https://chatgpt.com"
              target="_blank"
              class="text-primary hover:underline"
            >
              ChatGPT
            </a>. Open DevTools (F12) > Network.
          </li>
          <li>
            Refresh/make a request. Find API calls (e.g., to
            `.../conversation`).
          </li>
          <li>Token: "Authorization" header (copy value after "Bearer ").</li>
          <li>Team ID: `chatgpt-account-id` header (if in team workspace).</li>
        </ol>
      </div>
    </div>
  );
}
