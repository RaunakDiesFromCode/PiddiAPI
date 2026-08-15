/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          darkest: '#090d13',
          base: '#0d1117',
          surface: '#161b22',
          card: '#1c2128',
          overlay: '#22272e',
        },
        border: {
          subtle: '#21262d',
          default: '#30363d',
          strong: '#444c56',
        },
        text: {
          primary: '#f0f6fc',
          secondary: '#adbac7',
          muted: '#768390',
          faint: '#545d68',
        },
        method: {
          get: '#10b981',
          post: '#3b82f6',
          put: '#f59e0b',
          patch: '#8b5cf6',
          delete: '#f43f5e',
          head: '#06b6d4',
          options: '#64748b',
        }
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
};
