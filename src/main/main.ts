import { app, BrowserWindow } from "electron";
import * as path from "path";

const DEV_URL = "http://localhost:5173";
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    frame: true,
    title: "PLC IDE — Agrupación v0.1",
    backgroundColor: "#1e1e1e",
    webPreferences: {
      // preload.js queda junto a main.js tras compilar (mismo __dirname).
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    loadDevServerConReintento(mainWindow);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // En producción el renderer se sirve desde el build de Vite:
    // dist/src/main/main.js  →  ../../renderer/index.html  =  dist/renderer/index.html
    mainWindow.loadFile(path.join(__dirname, "../../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * En `npm run dev`, Electron puede arrancar antes de que el dev server de Vite
 * esté escuchando. Reintentamos la carga hasta que responda.
 */
function loadDevServerConReintento(win: BrowserWindow, intentos = 20): void {
  win.loadURL(DEV_URL).catch(() => {
    if (intentos > 0) {
      setTimeout(() => loadDevServerConReintento(win, intentos - 1), 500);
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
