import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// El root del renderer es src/renderer/ (donde vive index.html). Se usan rutas
// absolutas para evitar ambigüedad al invocar con `--config src/vite.config.ts`.
export default defineConfig({
  root: resolve(__dirname, "renderer"),
  // base relativa: necesario para que en producción Electron cargue los assets
  // vía file:// (rutas relativas, no absolutas desde "/").
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      // Permite importar módulos fuera de renderer/ (editors/, project/, shared/…).
      allow: [resolve(__dirname, "..")],
    },
  },
  build: {
    outDir: resolve(__dirname, "../dist/renderer"),
    emptyOutDir: true,
  },
});
