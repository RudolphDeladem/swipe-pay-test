import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import netlify from "@netlify/vite-plugin";

// VITE_STATIC=1 builds the GitHub Pages version, where the API runs in the browser (PGlite).
const isStatic = process.env.VITE_STATIC === "1";
const onNetlify = !isStatic && !process.env.VERCEL;

export default defineConfig({
  plugins: [react(), ...(onNetlify ? [netlify()] : [])],
  optimizeDeps: { exclude: ["@electric-sql/pglite"] },
  build: isStatic ? { outDir: "dist-pages", target: "es2022" } : undefined,
});
