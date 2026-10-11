import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: {
          50: "#eef5f1",
          100: "#d9e8df",
          200: "#b4d1c1",
          300: "#86b39e",
          400: "#5a9179",
          500: "#39735d",
          600: "#2b5b49",
          700: "#23493c",
          800: "#1b3b31",
          900: "#142f27",
          950: "#0a1b16"
        },
        gold: {
          50: "#faf7ef",
          100: "#f2ead5",
          200: "#e6d4ad",
          300: "#d7b97d",
          400: "#c7a05a",
          500: "#b68c43",
          600: "#9a7135",
          700: "#7b562e",
          800: "#67472c",
          900: "#573c29"
        },
        ivory: "#f7f3e8",
        charcoal: "#202725"
      },
      boxShadow: {
        institution: "0 1px 2px rgba(20,47,39,.07), 0 12px 32px rgba(20,47,39,.07)",
        lift: "0 16px 45px rgba(10,27,22,.14)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["Georgia", "Cambria", "Times New Roman", "serif"]
      },
      backgroundImage: {
        "institutional-grid": "linear-gradient(rgba(23,62,50,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(23,62,50,.035) 1px, transparent 1px)"
      },
      backgroundSize: {
        "institutional-grid": "28px 28px"
      }
    }
  },
  plugins: []
};
export default config;
