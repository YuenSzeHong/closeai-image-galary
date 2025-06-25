import { useEffect, useState } from "preact/hooks";

type ThemeMode = "light" | "dark" | "system";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [_isDark, setIsDark] = useState(false); // Prefixed with underscore as it's only used for setting

  // Apply theme based on selected mode and system preference
  const applyTheme = (mode: ThemeMode) => {
    const isSystemDark =
      globalThis.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldBeDark = mode === "dark" || (mode === "system" && isSystemDark);

    setIsDark(shouldBeDark);

    if (shouldBeDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    if (mode === "system") {
      localStorage.removeItem("theme");
    } else {
      localStorage.setItem("theme", mode);
    }
  };

  useEffect(() => {
    // Initialize theme based on stored preference or system default
    const storedTheme = localStorage.getItem("theme") as ThemeMode | null;
    const initialTheme = storedTheme || "system";
    setTheme(initialTheme);
    applyTheme(initialTheme);

    // Listen for system theme changes
    const mediaQuery = globalThis.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      if (theme === "system") {
        applyTheme("system");
      }
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () =>
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, [theme]);

  const cycleTheme = () => {
    const nextTheme: Record<ThemeMode, ThemeMode> = {
      "light": "dark",
      "dark": "system",
      "system": "light",
    };

    const newTheme = nextTheme[theme];
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  return (
    <button
      type="button"
      onClick={cycleTheme}
      title="切换主题"
      class="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
    >
      {/* Sun icon for light mode */}
      <svg
        class={`w-6 h-6 transition-all duration-200 ${
          theme === "light" ? "block" : "hidden"
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
          theme === "dark" ? "block" : "hidden"
        }`}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12.001.035a11.962 11.962 0 00-8.486 3.515A11.962 11.962 0 00.035 12a11.962 11.962 0 003.48 8.485A11.962 11.962 0 0012 23.965a11.962 11.962 0 008.485-3.48A11.962 11.962 0 0023.965 12a11.962 11.962 0 00-3.48-8.485A11.962 11.962 0 0012.001.035zm0 1.001a10.962 10.962 0 017.753 3.208 10.962 10.962 0 013.208 7.752a10.962 10.962 0 01-3.208 7.753a10.962 10.962 0 01-7.753 3.208a10.962 10.962 0 01-7.752-3.208A10.962 10.962 0 011.036 12a10.962 10.962 0 013.208-7.752A10.962 10.962 0 0112.001 1.036zM11.5 5.5A6.5 6.5 0 005 12a6.502 6.502 0 009.283 5.84A6.466 6.466 0 0112.5 12a6.466 6.466 0 011.84-4.283A6.502 6.502 0 0011.5 5.5z" />
      </svg>

      {/* Computer icon for system preference */}
      <svg
        class={`w-6 h-6 transition-all duration-200 ${
          theme === "system" ? "block" : "hidden"
        }`}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M4 6h16v10H4V6zm16 12H4a2 2 0 01-2-2V6c0-1.1.9-2 2-2h16a2 2 0 012 2v10a2 2 0 01-2 2zm2 0a2 2 0 01-2 2H4a2 2 0 01-2-2" />
        <path d="M10 21h4a1 1 0 010 2h-4a1 1 0 010-2z" />
      </svg>
    </button>
  );
}
