import { type Config } from "tailwindcss";

export default {
  content: [
    "{routes,islands,components}/**/*.{ts,tsx,js,jsx}",
  ],
  darkMode: 'class', // Use class strategy for manual control
  theme: {
    extend: {
      colors: {
        primary: '#10a37f',
        primaryDark: '#0c8c6a',
        error: '#ef4444',
        gray: { 
          850: '#18212f', 
          900: '#111827' 
        }
      }
    }
  }
} satisfies Config;
