import { type PageProps } from "$fresh/server.ts";
import ThemeProvider from "../islands/ThemeProvider.tsx";
import KeyboardShortcuts from "../islands/KeyboardShortcuts.tsx";
import NotificationManager from "../islands/NotificationManager.tsx";
import ExportStatus from "../islands/ExportStatus.tsx";

export default function App({ Component }: PageProps) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>closeai-image-galary</title>
        <link rel="stylesheet" href="/styles.css" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
            // Prevent FOUC with Tailwind's dark mode
            (function() {
              const theme = localStorage.getItem('theme');
              if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
              }
            })();
          `,
          }}
        />      </head>      <body>
        <ThemeProvider />
        <KeyboardShortcuts />
        <NotificationManager />
        <ExportStatus />
        <Component />
      </body>
    </html>
  );
}
