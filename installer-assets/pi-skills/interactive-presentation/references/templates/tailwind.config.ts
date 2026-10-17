import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["var(--scene-font)"], mono: ["var(--scene-mono)"] },
      colors: {
        scene: {
          bg: "var(--scene-bg)", surface: "var(--scene-surface)", text: "var(--scene-text)",
          muted: "var(--scene-muted)", border: "var(--scene-border)", accent: "var(--scene-accent)",
          "accent-light": "var(--scene-accent-light)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
