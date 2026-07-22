import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import monacoEditorPlugin from "vite-plugin-monaco-editor";
import { resolve } from "path";

const outDir = resolve(__dirname, "../dist/renderer");

// El root del renderer es src/renderer/ (donde vive index.html). Se usan rutas
// absolutas para evitar ambigüedad al invocar con `--config src/vite.config.ts`.
export default defineConfig({
  root: resolve(__dirname, "renderer"),
  // base relativa: Tauri sirve el frontend desde su propio protocolo; con base
  // "./" los assets se referencian de forma relativa y cargan correctamente.
  base: "./",
  // Tauri espera un puerto fijo; no limpiar la consola para no ocultar sus logs.
  clearScreen: false,
  plugins: [
    react(),
    // Bundlea los workers de Monaco localmente (sin CDN) — el aula puede no
    // tener internet (§2.2: la app debe funcionar 100% offline). Solo el
    // worker base: ST es "plaintext" por ahora, sin lenguajes específicos.
    monacoEditorPlugin({
      languageWorkers: ["editorWorkerService"],
      // El plugin calcula su carpeta de salida con `path.join(root, outDir, ...)`,
      // que rompe cuando `build.outDir` es absoluto (nuestro caso): produce una
      // ruta anidada inválida (root + outDir concatenados). Se fuerza la ruta
      // correcta reutilizando el mismo `outDir` absoluto de abajo.
      customDistPath: () => resolve(outDir, "monacoeditorwork"),
    }),
  ],
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
    outDir,
    emptyOutDir: true,
  },
});
