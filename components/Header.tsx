import ThemeToggle from "../islands/ThemeToggle.tsx";

export default function Header() {
  return (
    <header class="flex justify-between items-center mb-8">
      <div>
        <h1 class="text-3xl font-bold text-center text-gray-900 dark:text-white">
          CloseAI Image Gallery
        </h1>
        <p class="text-center text-gray-600 dark:text-gray-400">
          View all your generated images
        </p>
      </div>
      <ThemeToggle />
    </header>
  );
}
