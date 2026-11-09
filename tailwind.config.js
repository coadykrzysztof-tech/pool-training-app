/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        felt: {
          blue: '#195b9d',
          green: '#1b633e',
          tournament: '#0e4d77',
          border: '#0c2e47'
        },
        wood: {
          rail: '#181b22',
          cushion: '#0d1017'
        }
      }
    },
  },
  plugins: [],
}
