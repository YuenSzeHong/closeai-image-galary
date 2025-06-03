import { useEffect } from "preact/hooks";

export default function ThemeProvider() {
  useEffect(() => {
    // Only listen for system theme changes if no manual preference is set
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

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
