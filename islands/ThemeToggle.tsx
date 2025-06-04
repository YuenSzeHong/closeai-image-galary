import { useEffect, useState } from "preact/hooks";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Sync with current DOM state
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = () => {
    const willBeDark = !isDark;
    setIsDark(willBeDark);

    if (willBeDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title="切换主题"
      class="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
    >
      {/* Sun icon for light mode */}
      <svg
        class={`w-6 h-6 transition-all duration-200 ${
          isDark ? "hidden" : "block"
        }`}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12 9a3 3 0 100 6 3 3 0 000-6zm0-2a5 5 0 110 10 5 5 0 010-10zm0-3.5a.5.5 0 01.5.5v2a.5.5 0 01-1 0v-2a.5.5 0 01.5-.5zm0 17a.5.5 0 01.5.5v2a.5.5 0 01-1 0v-2a.5.5 0 01.5-.5zM4.222 5.636a.5.5 0 01.707-.707l1.414 1.414a.5.5 0 01-.707.707L4.222 5.636zm14.142 14.142a.5.5 0 01.707-.707l1.414 1.414a.5.5 0 01-.707.707l-1.414-1.414zM19.778 5.636L18.364 4.222a.5.5 0 01.707-.707l1.414 1.414a.5.5 0 01-.707.707zM5.636 19.778L4.222 18.364a.5.5 0 01.707-.707l1.414 1.414a.5.5 0 01-.707.707zM2.5 12a.5.5 0 01.5-.5h2a.5.5 0 010 1h-2a.5.5 0 01-.5-.5zm17 0a.5.5 0 01.5-.5h2a.5.5 0 010 1h-2a.5.5 0 01-.5-.5z" />
      </svg>
      {/* Moon icon for dark mode */}
      <svg
        class={`w-6 h-6 transition-all duration-200 ${
          isDark ? "block" : "hidden"
        }`}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12.001.035a11.962 11.962 0 00-8.486 3.515A11.962 11.962 0 00.035 12a11.962 11.962 0 003.48 8.485A11.962 11.962 0 0012 23.965a11.962 11.962 0 008.485-3.48A11.962 11.962 0 0023.965 12a11.962 11.962 0 00-3.48-8.485A11.962 11.962 0 0012.001.035zm0 1.001a10.962 10.962 0 017.753 3.208 10.962 10.962 0 013.208 7.752 10.962 10.962 0 01-3.208 7.753 10.962 10.962 0 01-7.753 3.208 10.962 10.962 0 01-7.752-3.208A10.962 10.962 0 011.036 12a10.962 10.962 0 013.208-7.752A10.962 10.962 0 0112.001 1.036zM11.5 5.5A6.5 6.5 0 005 12a6.502 6.502 0 009.283 5.84A6.466 6.466 0 0112.5 12a6.466 6.466 0 011.84-4.283A6.502 6.502 0 0011.5 5.5z" />
      </svg>
    </button>
  );
}
