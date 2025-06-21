import { type PageProps } from "$fresh/server.ts";
import ThemeProvider from "../islands/ThemeProvider.tsx";
import NotificationManager from "../islands/NotificationManager.tsx";
import ExportNotification from "../islands/ExportNotification.tsx";
import { getStoredLocale } from "../lib/i18n.ts";

export default function App({ Component }: PageProps) {
  // Get initial locale for SSR
  const initialLocale =
    typeof globalThis !== "undefined" && typeof localStorage !== "undefined"
      ? getStoredLocale()
      : "zh-CN";

  return (
    <html lang={initialLocale}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>closeai-image-galary</title>
        <link rel="stylesheet" href="/styles.css" />
        <script>
          {`
            // Prevent FOUC with Tailwind's dark mode
            (function() {
              const theme = localStorage.getItem('theme');
              if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
              }
              
              // Set initial locale
              const locale = localStorage.getItem('locale') || 'zh-CN';
              document.documentElement.lang = locale;
            })();
          `}
        </script>
      </head>{" "}
      <body>
        <ThemeProvider />
        <NotificationManager />
        <ExportNotification />
        <Component />
      </body>
    </html>
  );
}
