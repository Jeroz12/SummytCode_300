/**
 * Controles de edición inline del canvas Ladder (sin modales bloqueantes):
 *  - InlineVarInput: input flotante sobre la celda para asignar la variable de un
 *    elemento (o cualquier campo de texto libre: PT/PV/ET/CV/Reset de TON/CTU
 *    reutilizan el mismo componente). Autofocus, confirma con Enter/blur, cancela
 *    con Escape.
 *
 * No hay popovers: todos los parámetros de TON/CTU se editan inline sobre el
 * propio bloque (ver `camposBloque` en elements/LadderElements.tsx para la
 * geometría de cada pin).
 */
import { useEffect, useRef, useState } from "react";

interface InlineVarInputProps {
  valor: string;
  onCommit: (valor: string) => void;
  onCancel: () => void;
}

/** Input inline para la variable de un elemento (se monta con foco automático). */
export function InlineVarInput({ valor, onCommit, onCancel }: InlineVarInputProps) {
  const [texto, setTexto] = useState(valor);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      className="ladder-inline-input"
      list="ladder-vars"
      value={texto}
      placeholder="?"
      spellCheck={false}
      autoComplete="off"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => onCommit(texto.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(texto.trim());
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    />
  );
}
