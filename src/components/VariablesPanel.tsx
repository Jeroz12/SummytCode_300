import { useEffect, useState } from "react";
import type { VariableDeclaration } from "../shared/types";

interface Props {
  /** Variables del AST parseado más reciente (vacío si aún no hay programa válido). */
  variables: VariableDeclaration[];
  /** Direcciones IEC asignadas desde este panel (nombre de variable → dirección). */
  ioMappings: Record<string, string>;
  /** Se dispara al confirmar una dirección editada (onBlur o Enter). */
  onVariableUpdate: (nombre: string, direccion: string) => void;
}

/**
 * Panel derecho: tabla de variables del programa actual (Opción B — mapeo de I/O
 * desde la UI, sin tocar el código ST). Nombre/Tipo/Clase vienen del AST y son de
 * solo lectura; Dirección es editable y alimenta `generarCodigoC` vía ioMappings.
 */
export function VariablesPanel({ variables, ioMappings, onVariableUpdate }: Props) {
  return (
    <aside className="panel panel--right">
      <div className="panel__header">Variables</div>

      <table className="var-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Tipo</th>
            <th>Clase</th>
            <th>Dirección</th>
          </tr>
        </thead>
        <tbody>
          {variables.length === 0 ? (
            <tr>
              <td colSpan={4} className="var-table__vacio">
                Sin variables — escribe código ST válido para verlas aquí
              </td>
            </tr>
          ) : (
            variables.map((v) => (
              <tr key={v.nombre}>
                <td>{v.nombre}</td>
                <td>{v.tipo}</td>
                <td>{v.clase}</td>
                <td className="tag">
                  <DireccionInput
                    valor={ioMappings[v.nombre] ?? v.direccion_iec ?? ""}
                    onCommit={(direccion) => onVariableUpdate(v.nombre, direccion)}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <button className="btn-ghost" title="Disponible próximamente" onClick={() => undefined}>
        + Agregar variable
      </button>
    </aside>
  );
}

interface DireccionInputProps {
  valor: string;
  onCommit: (valor: string) => void;
}

/** Input de texto controlado para una celda de "Dirección"; confirma con blur o Enter. */
function DireccionInput({ valor, onCommit }: DireccionInputProps) {
  const [texto, setTexto] = useState(valor);

  // Si la dirección cambia por fuera (ej. nuevo parseo), sincroniza el input.
  useEffect(() => {
    setTexto(valor);
  }, [valor]);

  const confirmar = () => {
    if (texto !== valor) onCommit(texto);
  };

  return (
    <input
      className="var-table__input"
      value={texto}
      placeholder="%IX0.0"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          confirmar();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
