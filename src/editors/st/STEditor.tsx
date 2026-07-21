import { useCallback, useEffect, useRef } from "react";
import Editor, { type OnChange } from "@monaco-editor/react";
import type { ConsoleMessage } from "../../shared/types";
import { parseSTCode } from "../../renderer/api/tauriApi";

const CODIGO_EJEMPLO = `(* Programa de ejemplo: Control de Motor *)
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
}

export function STEditor({ onLog }: Props) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const parsear = useCallback(
    async (code: string) => {
      const resultado = await parseSTCode(code);
      if (resultado.success) {
        onLog("success", "✔ Sintaxis correcta");
      } else {
        const errores = resultado.errors ?? ["Error de parseo desconocido"];
        errores.forEach((e) => onLog("error", e));
      }
    },
    [onLog]
  );

  const handleChange: OnChange = useCallback(
    (value) => {
      if (timer.current) clearTimeout(timer.current);
      const code = value ?? "";
      timer.current = setTimeout(() => void parsear(code), DEBOUNCE_MS);
    },
    [parsear]
  );

  // Parseo inicial del código de ejemplo al montar (una sola vez).
  useEffect(() => {
    void parsear(CODIGO_EJEMPLO);
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
      defaultValue={CODIGO_EJEMPLO}
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
