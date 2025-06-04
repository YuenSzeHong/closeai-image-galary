import { useEffect } from "preact/hooks";

export default function KeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { // Settings shortcut: Ctrl+, or Cmd+,
      if ((event.ctrlKey || event.metaKey) && event.key === ",") {
        event.preventDefault();
        globalThis.location.href = "/settings";
      }
    };

    globalThis.addEventListener("keydown", handleKeyDown);

    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return null; // This component doesn't render anything
}
