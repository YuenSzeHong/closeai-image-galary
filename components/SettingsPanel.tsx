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
