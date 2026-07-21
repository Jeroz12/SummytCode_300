import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// El root del renderer es src/renderer/ (donde vive index.html). Se usan rutas
// absolutas para evitar ambigüedad al invocar con `--config src/vite.config.ts`.
export default defineConfig({
  root: resolve(__dirname, "renderer"),
  // base relativa: Tauri sirve el frontend desde su propio protocolo; con base
  // "./" los assets se referencian de forma relativa y cargan correctamente.
  base: "./",
  // Tauri espera un puerto fijo; no limpiar la consola para no ocultar sus logs.
  clearScreen: false,
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      // Permite importar módulos fuera de renderer/: editors/, components/,
      // shared/ y compiler-core/ (el parser ST se importa directo — Opción A).
      allow: [resolve(__dirname, ".."), resolve(__dirname, "../compiler-core")],
    },
  },
  build: {
    outDir: resolve(__dirname, "../dist/renderer"),
    emptyOutDir: true,
  },
});
