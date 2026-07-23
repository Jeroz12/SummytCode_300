import { useEffect, useState } from "react";
import type { ClaseVariable, TipoDato, VariableDeclaration } from "../shared/types";

interface Props {
  /** Variables del AST parseado más reciente (vacío si aún no hay programa válido). Solo lectura. */
  variables: VariableDeclaration[];
  /** Variables agregadas a mano desde este panel (no vienen del código ST). Eliminables. */
  variablesManuales: VariableDeclaration[];
  /** Direcciones IEC asignadas desde este panel (nombre de variable → dirección). */
  ioMappings: Record<string, string>;
  /** Se dispara al confirmar una dirección editada (onBlur o Enter). */
  onVariableUpdate: (nombre: string, direccion: string) => void;
  /** Se dispara al confirmar la fila de "+ Agregar variable" con datos válidos. */
  onAgregarVariable: (variable: VariableDeclaration) => void;
  /** Se dispara al eliminar una variable manual (por nombre). */
  onEliminarVariable: (nombre: string) => void;
}

const TIPOS: TipoDato[] = ["BOOL", "INT", "TON", "CTU"];
const CLASES: ClaseVariable[] = ["VAR", "VAR_INPUT", "VAR_OUTPUT"];

const RE_IDENTIFICADOR = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const RE_DIRECCION_CON_PUNTO = /^%[IQ][XW]\d+\.\d+$/;
const RE_DIRECCION_SIN_PUNTO = /^%[IQ]W\d+$/;

/**
 * Panel derecho: tabla de variables del programa actual (Opción B — mapeo de I/O
 * desde la UI, sin tocar el código ST). Nombre/Tipo/Clase de las variables del AST
 * son de solo lectura (vienen del parser); las manuales se pueden eliminar.
 * Dirección es editable en ambos casos y alimenta `generarCodigoC` vía ioMappings.
 */
export function VariablesPanel({
  variables,
  variablesManuales,
  ioMappings,
  onVariableUpdate,
  onAgregarVariable,
  onEliminarVariable,
}: Props) {
  const [agregando, setAgregando] = useState(false);

  const nombresExistentes = new Set([
    ...variables.map((v) => v.nombre),
    ...variablesManuales.map((v) => v.nombre),
  ]);

  const hayVariables = variables.length > 0 || variablesManuales.length > 0;

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
            <th />
          </tr>
        </thead>
        <tbody>
          {!hayVariables && !agregando ? (
            <tr>
              <td colSpan={5} className="var-table__vacio">
                Sin variables — escribe código ST válido o agrega una manualmente
              </td>
            </tr>
          ) : (
            <>
              {variables.map((v) => (
                <tr key={`ast-${v.nombre}`}>
                  <td>{v.nombre}</td>
                  <td>{v.tipo}</td>
                  <td>{v.clase}</td>
                  <td className="tag">
                    <DireccionInput
                      valor={ioMappings[v.nombre] ?? v.direccion_iec ?? ""}
                      onCommit={(direccion) => onVariableUpdate(v.nombre, direccion)}
                    />
                  </td>
                  <td />
                </tr>
              ))}
              {variablesManuales.map((v) => (
                <tr key={`manual-${v.nombre}`} className="var-table__fila-manual">
                  <td title="Variable agregada manualmente">{v.nombre}</td>
                  <td>{v.tipo}</td>
                  <td>{v.clase}</td>
                  <td className="tag">
                    <DireccionInput
                      valor={ioMappings[v.nombre] ?? v.direccion_iec ?? ""}
                      onCommit={(direccion) => onVariableUpdate(v.nombre, direccion)}
                    />
                  </td>
                  <td>
                    <button
                      className="icon-btn"
                      title="Eliminar variable"
                      onClick={() => onEliminarVariable(v.nombre)}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
              {agregando && (
                <FilaNuevaVariable
                  nombresExistentes={nombresExistentes}
                  onConfirmar={(variable) => {
                    onAgregarVariable(variable);
                    setAgregando(false);
                  }}
                  onCancelar={() => setAgregando(false)}
                />
              )}
            </>
          )}
        </tbody>
      </table>

      <button
        className="btn-ghost"
        title={agregando ? "Ya hay una variable nueva sin confirmar" : "Agregar una variable manualmente"}
        onClick={() => setAgregando((v) => v || true)}
      >
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

/** Valida una dirección IEC opcional: vacía = válida, o debe matchear uno de los dos formatos. */
function direccionValida(direccion: string): boolean {
  if (direccion === "") return true;
  return RE_DIRECCION_CON_PUNTO.test(direccion) || RE_DIRECCION_SIN_PUNTO.test(direccion);
}

interface FilaNuevaVariableProps {
  nombresExistentes: Set<string>;
  onConfirmar: (variable: VariableDeclaration) => void;
  onCancelar: () => void;
}

/** Fila inline editable para agregar una variable manualmente (Fix 2, TAREA 2B). */
function FilaNuevaVariable({ nombresExistentes, onConfirmar, onCancelar }: FilaNuevaVariableProps) {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoDato>("BOOL");
  const [clase, setClase] = useState<ClaseVariable>("VAR");
  const [direccion, setDireccion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const confirmar = () => {
    const nombreLimpio = nombre.trim();
    if (nombreLimpio === "") {
      setError("El nombre no puede estar vacío.");
      return;
    }
    if (!RE_IDENTIFICADOR.test(nombreLimpio)) {
      setError("Nombre inválido: debe empezar con letra o _ y solo contener letras, números o _.");
      return;
    }
    if (nombresExistentes.has(nombreLimpio)) {
      setError(`Ya existe una variable llamada "${nombreLimpio}".`);
      return;
    }
    const direccionLimpia = direccion.trim();
    if (!direccionValida(direccionLimpia)) {
      setError('Dirección IEC inválida. Formato esperado: "%IX0.0" o "%IW0".');
      return;
    }

    onConfirmar({
      nombre: nombreLimpio,
      tipo,
      clase,
      direccion_iec: direccionLimpia || undefined,
    });
  };

  return (
    <tr className="var-table__fila-nueva">
      <td>
        <input
          className="var-table__input"
          value={nombre}
          placeholder="NombreVariable"
          autoFocus
          onChange={(e) => {
            setNombre(e.target.value);
            setError(null);
          }}
        />
      </td>
      <td>
        <select
          className="select"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoDato)}
        >
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select
          className="select"
          value={clase}
          onChange={(e) => setClase(e.target.value as ClaseVariable)}
        >
          {CLASES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </td>
      <td className="tag">
        <input
          className="var-table__input"
          value={direccion}
          placeholder="%IX0.0 (opcional)"
          onChange={(e) => {
            setDireccion(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmar();
            if (e.key === "Escape") onCancelar();
          }}
        />
        {error && <div className="var-table__error">{error}</div>}
      </td>
      <td>
        <button className="icon-btn" title="Confirmar" onClick={confirmar}>
          ✔
        </button>
        <button className="icon-btn" title="Cancelar" onClick={onCancelar}>
          ✗
        </button>
      </td>
    </tr>
  );
}
