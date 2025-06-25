import { type PageProps } from "$fresh/server.ts";
import ThemeProvider from "../islands/ThemeProvider.tsx";
import NotificationManager from "../islands/NotificationManager.tsx";
import ExportNotification from "../islands/ExportNotification.tsx";

export default function App({ Component }: PageProps) {
  return (
    <html lang="zh-CN" class="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>closeai-image-galary</title>
        <link rel="stylesheet" href="/styles.css" />{" "}
        <script>
          {`
            // Prevent FOUC with Tailwind's dark mode
            (function() {
              const theme = localStorage.getItem('theme');
              
              // Apply dark mode if:
              // 1. User explicitly chose dark mode, or
              // 2. User has no preference saved but system prefers dark
              if (
                theme === 'dark' || 
                (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)
              ) {
                document.documentElement.classList.add('dark');
              } else {
                document.documentElement.classList.remove('dark');
              }
              
  
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
