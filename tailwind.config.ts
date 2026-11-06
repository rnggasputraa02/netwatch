import type { Config } from "tailwindcss";
const config: Config = { content: ["./src/**/*.{ts,tsx}"], theme: { extend: { colors: { bg: "#0b1220", pn: "#111a2e", bd: "#1f2b45", neon: "#22e58b", sky: "#3b9cff" } } }, plugins: [] };
export default config;
