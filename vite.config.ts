import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const repoBase = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base: repoBase,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  worker: {
    format: "es",
  },
});
