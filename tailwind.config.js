/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        neuBg: "#e0e5ec",
        neuDark: "#a3b1c6",
        neuLight: "#ffffff",
      },
    },
  },
  plugins: [],
}
