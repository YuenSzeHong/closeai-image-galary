import { useEffect } from "preact/hooks";

export default function ThemeProvider() {
  useEffect(() => {
    // Initialize theme based on stored preference or system default
    const storedTheme = localStorage.getItem("theme");

    if (storedTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (storedTheme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      // No preference set, use system default
      if (globalThis.matchMedia("(prefers-color-scheme: dark)").matches) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }

    // Listen for system theme changes
    const mediaQuery = globalThis.matchMedia("(prefers-color-scheme: dark)");

    const handleSystemThemeChange = () => {
      // Only apply system preference if user hasn't set a manual preference
      if (!localStorage.getItem("theme")) {
        if (mediaQuery.matches) {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      }
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () =>
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, []);

  return null; // This component doesn't render anything
}
