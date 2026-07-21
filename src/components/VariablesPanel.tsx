/**
 * Panel derecho: tabla de variables. Solo UI por ahora (no editable, no conectada
 * al AST). Precargada con las variables del ejemplo ST.
 */

interface VariableFila {
  nombre: string;
  tipo: string;
  clase: string;
  direccion: string;
}

const VARIABLES_DEMO: VariableFila[] = [
  { nombre: "Start", tipo: "BOOL", clase: "VAR_INPUT", direccion: "%IX0.0" },
  { nombre: "Stop", tipo: "BOOL", clase: "BOOL", direccion: "%IX0.1" },
  { nombre: "Motor", tipo: "BOOL", clase: "VAR_OUTPUT", direccion: "%QX0.0" },
  { nombre: "Timer1", tipo: "TON", clase: "VAR", direccion: "—" },
];

export function VariablesPanel() {
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
          {VARIABLES_DEMO.map((v) => (
            <tr key={v.nombre}>
              <td>{v.nombre}</td>
              <td>{v.tipo}</td>
              <td>{v.clase}</td>
              <td className="tag">{v.direccion}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <button className="btn-ghost" title="Disponible próximamente" onClick={() => undefined}>
        + Agregar variable
      </button>
    </aside>
  );
}
