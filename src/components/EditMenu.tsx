import { useEffect, useRef, useState } from "react";

interface Props {
  onDeshacer: () => void;
  onRehacer: () => void;
  /** False = ítem "Deshacer" deshabilitado (historial vacío o pestaña no-Ladder). */
  puedeDeshacer: boolean;
  /** False = ítem "Rehacer" deshabilitado (futuro vacío o pestaña no-Ladder). */
  puedeRehacer: boolean;
}

interface ItemMenu {
  label: string;
  atajo?: string;
  accion: () => void;
  habilitado: boolean;
}

/**
 * Menú "Editar" con dropdown. Hoy expone Deshacer/Rehacer, que operan SOLO sobre
 * el editor Ladder (el editor ST usa el undo nativo de Monaco). Los atajos reales
 * (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z) se manejan en App.tsx; aquí solo se muestran
 * como pista y se refleja el estado disabled según los stacks de historial.
 */
export function EditMenu({ onDeshacer, onRehacer, puedeDeshacer, puedeRehacer }: Props) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  // Cierra al hacer clic fuera del menú o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const alClickAfuera = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    const alEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", alClickAfuera);
    document.addEventListener("keydown", alEscape);
    return () => {
      document.removeEventListener("mousedown", alClickAfuera);
      document.removeEventListener("keydown", alEscape);
    };
  }, [abierto]);

  const ejecutar = (item: ItemMenu) => {
    if (!item.habilitado) return;
    setAbierto(false);
    item.accion();
  };

  const items: ItemMenu[] = [
    { label: "Deshacer", atajo: "Ctrl+Z", accion: onDeshacer, habilitado: puedeDeshacer },
    { label: "Rehacer", atajo: "Ctrl+Y", accion: onRehacer, habilitado: puedeRehacer },
  ];

  return (
    <div className="menubar__menu" ref={contenedorRef}>
      <div
        className={`menubar__item ${abierto ? "menubar__item--active" : ""}`}
        onClick={() => setAbierto((v) => !v)}
      >
        Editar
      </div>

      {abierto && (
        <div className="menu-dropdown" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              className="menu-dropdown__item"
              role="menuitem"
              disabled={!item.habilitado}
              title={`${item.label} (${item.atajo}) — solo editor Ladder`}
              onClick={() => ejecutar(item)}
            >
              <span>{item.label}</span>
              {item.atajo && <span className="menu-dropdown__atajo">{item.atajo}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
