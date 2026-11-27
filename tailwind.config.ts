import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        roxo: { DEFAULT: "#421268", escuro: "#2a0a44" },
        lima: { DEFAULT: "#9ACD1F", tinta: "#3c5a00" },
        creme: "#F8F4EE",
        leite: "#FAF7FB",   // fundo da loja: branco com um fio de açaí
        polpa: "#6B2A8C",   // roxo médio das camadas
        whats: "#25D366",
      },
      transitionTimingFunction: {
        // curvas fortes (emilkowalski/skills): entrar/responder = out; mover na tela = in-out
        "out-forte": "cubic-bezier(0.23, 1, 0.32, 1)",
        "in-out-forte": "cubic-bezier(0.77, 0, 0.175, 1)",
        gaveta: "cubic-bezier(0.32, 0.72, 0, 1)",
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
