import { useEffect, useRef, useState } from "react";

interface Props {
  onNuevo: () => void;
  onAbrir: () => void;
  onGuardar: () => void;
  onGuardarComo: () => void;
  onSalir: () => void;
}

interface ItemMenu {
  label: string;
  atajo?: string;
  accion: () => void;
}

/**
 * Menú "Archivo" con dropdown funcional. Se abre al hacer clic; se cierra al
 * elegir una opción, hacer clic afuera, o presionar Escape. Los atajos de teclado
 * reales (Ctrl+N/O/S/…) se manejan en App.tsx; aquí solo se muestran como pista.
 */
export function FileMenu({ onNuevo, onAbrir, onGuardar, onGuardarComo, onSalir }: Props) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  // Cierra al hacer clic fuera del menú.
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

  const ejecutar = (accion: () => void) => {
    setAbierto(false);
    accion();
  };

  // `null` = separador.
  const items: (ItemMenu | null)[] = [
    { label: "Nuevo proyecto", atajo: "Ctrl+N", accion: onNuevo },
    null,
    { label: "Abrir proyecto…", atajo: "Ctrl+O", accion: onAbrir },
    null,
    { label: "Guardar", atajo: "Ctrl+S", accion: onGuardar },
    { label: "Guardar como…", atajo: "Ctrl+Shift+S", accion: onGuardarComo },
    null,
    { label: "Salir", accion: onSalir },
  ];

  return (
    <div className="menubar__menu" ref={contenedorRef}>
      <div
        className={`menubar__item ${abierto ? "menubar__item--active" : ""}`}
        onClick={() => setAbierto((v) => !v)}
      >
        Archivo
      </div>

      {abierto && (
        <div className="menu-dropdown" role="menu">
          {items.map((item, i) =>
            item === null ? (
              <div key={`sep-${i}`} className="menu-dropdown__sep" />
            ) : (
              <button
                key={item.label}
                className="menu-dropdown__item"
                role="menuitem"
                onClick={() => ejecutar(item.accion)}
              >
                <span>{item.label}</span>
                {item.atajo && <span className="menu-dropdown__atajo">{item.atajo}</span>}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
