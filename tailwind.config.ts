import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        roxo: { DEFAULT: "#421268", escuro: "#2a0a44" },
        lima: { DEFAULT: "#9ACD1F", tinta: "#3c5a00" },
        creme: "#F8F4EE",
        whats: "#25D366",
      },
      fontFamily: {
        sans: ["var(--font-montserrat)", "system-ui", "sans-serif"],
        script: ["var(--font-pacifico)", "cursive"],
      },
    },
  },
  plugins: [],
};
export default config;
