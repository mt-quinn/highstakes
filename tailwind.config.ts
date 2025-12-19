import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        typewriter: ["var(--font-typewriter)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        handwriting: ["var(--font-handwriting)", "cursive"],
      },
      colors: {
        "pg-bg": "#090B16",
        "pg-bg-soft": "#10162A",
        "pg-surface": "#141B33",
        "pg-text": "#F6F2FF",
        "pg-muted": "#B9B4C9",
        "pg-gold": "#FFD88A",
        "pg-cyan": "#79F0FF",
        "pg-red": "#FF4D6D",
        "pg-green": "#59FFA6",
      },
      boxShadow: {
        "pg-card": "0 18px 40px rgba(0,0,0,0.65)",
        "pg-glow": "0 0 35px rgba(255,216,138,0.35)",
      },
      backgroundImage: {
        "pg-radial":
          "radial-gradient(circle at top, rgba(255,216,138,0.20), transparent 55%), radial-gradient(circle at bottom, rgba(121,240,255,0.16), transparent 55%)",
      },
    },
  },
  plugins: [],
};

export default config;


