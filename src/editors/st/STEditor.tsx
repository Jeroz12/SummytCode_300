import { useCallback, useEffect, useRef } from "react";
import Editor, { loader, type OnChange } from "@monaco-editor/react";
// Import "core-only": `monaco-editor` (barril completo) arrastra ~80 lenguajes y
// workers de TS/CSS/HTML/JSON de varios MB cada uno. ST es "plaintext" — no
// necesitamos ninguno de esos. `editor.api` es el punto de entrada oficial sin
// contribuciones de lenguaje, documentado por Monaco para este caso de uso.
import * as monaco from "monaco-editor/editor/editor.api";
import type { ConsoleMessage, ParseResult } from "../../shared/types";
import { parseSTCode } from "../../renderer/api/tauriApi";

// Usa el Monaco bundleado localmente por Vite (vite-plugin-monaco-editor), no el
// CDN por defecto de @monaco-editor/react — el aula puede no tener internet.
loader.config({ monaco });

export const CODIGO_EJEMPLO = `(* Programa de ejemplo: Control de Motor *)
VAR
  Start   : BOOL;
  Stop    : BOOL;
  Motor   : BOOL;
  Timer1  : TON;
END_VAR

IF Start AND NOT Stop THEN
  Motor := TRUE;
END_IF;

TON(IN := Motor, PT := T#5s, Q => Timer1.Q);
`;

const DEBOUNCE_MS = 800;

interface Props {
  /** Envía mensajes a la consola inferior. */
  onLog: (tipo: ConsoleMessage["tipo"], texto: string) => void;
  /** Reporta el código y el resultado de cada parseo (para que App.tsx pueda compilar sin re-parsear). */
  onParsed: (code: string, result: ParseResult) => void;
  /**
   * Reporta CADA cambio de texto sin debounce (a diferencia de onParsed). Se usa
   * para guardar el proyecto con el contenido más fresco y para marcar "cambios
   * sin guardar" de inmediato, sin esperar los 800ms del parseo.
   */
  onChangeImmediate: (code: string) => void;
  /**
   * Código con el que se monta el editor (proyecto abierto, nuevo proyecto vacío,
   * o el ejemplo por defecto). Solo se usa al MONTAR: para reemplazarlo después
   * hay que remontar el componente (ej. cambiando su `key` en App.tsx).
   */
  initialCode?: string;
}

export function STEditor({ onLog, onParsed, onChangeImmediate, initialCode = CODIGO_EJEMPLO }: Props) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const parsear = useCallback(
    async (code: string) => {
      const resultado = await parseSTCode(code);
      onParsed(code, resultado);
      if (resultado.success) {
        onLog("success", "Sintaxis correcta");
      } else {
        const errores = resultado.errors ?? ["Error de parseo desconocido"];
        errores.forEach((e) => onLog("error", e));
      }
    },
    [onLog, onParsed]
  );

  const handleChange: OnChange = useCallback(
    (value) => {
      const code = value ?? "";
      onChangeImmediate(code);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void parsear(code), DEBOUNCE_MS);
    },
    [parsear, onChangeImmediate]
  );

  // Parseo inicial del código con el que se monta el editor (una sola vez).
  useEffect(() => {
    void parsear(initialCode);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Editor
      height="100%"
      defaultLanguage="plaintext"
      theme="vs-dark"
      defaultValue={initialCode}
      onChange={handleChange}
      options={{
        fontSize: 14,
        fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
        minimap: { enabled: false },
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
      }}
    />
  );
}
