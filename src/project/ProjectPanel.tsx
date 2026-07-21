/**
 * Panel izquierdo: árbol del proyecto + tarjeta de hardware.
 * Contenido hardcodeado por ahora (sin funcionalidad real).
 */
export function ProjectPanel() {
  return (
    <aside className="panel panel--left">
      <div className="panel__header">Proyecto</div>

      <ul className="tree">
        <li className="tree__item">📁 Mi Proyecto</li>
        <li className="tree__item tree__item--child">📄 Main (programa principal)</li>
        <li className="tree__item tree__item--child">📋 Variables</li>
        <li className="tree__item tree__item--child">🔌 Mapa de I/O</li>
        <li className="tree__item tree__item--child">⚙️ Configuración</li>
      </ul>

      <div className="panel__header">Hardware</div>
      <div className="hardware-card">
        <div className="hardware-card__title">Arduino Uno</div>
        {/* SVG placeholder de la placa */}
        <svg width="120" height="80" viewBox="0 0 120 80" role="img" aria-label="Placa Arduino Uno">
          <rect x="4" y="4" width="112" height="72" rx="6" fill="#0b7a75" stroke="#3e3e42" />
          <rect x="12" y="10" width="20" height="10" rx="2" fill="#c0c0c0" />
          <circle cx="98" cy="16" r="5" fill="#d1a300" />
          {Array.from({ length: 12 }).map((_, i) => (
            <rect key={`t${i}`} x={14 + i * 8} y={64} width="4" height="8" fill="#1e1e1e" />
          ))}
          {Array.from({ length: 12 }).map((_, i) => (
            <rect key={`b${i}`} x={14 + i * 8} y={8} width="4" height="8" fill="#1e1e1e" />
          ))}
        </svg>
      </div>
    </aside>
  );
}
