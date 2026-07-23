import type { DesincronizacionInfo } from "../shared/syncUtils";

interface Props {
  sincro: DesincronizacionInfo;
  onCompilar: () => void;
  compilando: boolean;
}

export function SyncWarningBanner({ sincro, onCompilar, compilando }: Props) {
  if (!sincro.desincronizado) return null;

  const lenguajeActualLabel = sincro.lenguajeActual === "st" ? "ST" : "Ladder";
  const lenguajeCompiladoLabel = sincro.lenguajeCompilado === "st" ? "ST" : "Ladder";

  const mensaje =
    sincro.razon === "cambio_lenguaje"
      ? `⚠️ El código ${lenguajeCompiladoLabel} fue compilado, pero ahora está editando en ${lenguajeActualLabel}. El firmware actual corresponde a ${lenguajeCompiladoLabel}. Recompilar antes de flashear.`
      : `⚠️ El código ${lenguajeActualLabel} fue modificado después de la última compilación exitosa. El firmware actual ya no coincide. Recompilar antes de flashear.`;

  return (
    <div className="sync-warning-banner">
      <div className="sync-warning-banner__content">
        <span className="sync-warning-banner__text">{mensaje}</span>
        <button
          className="sync-warning-banner__btn"
          onClick={onCompilar}
          disabled={compilando}
          title="Recompila el firmware con el código actual"
        >
          {compilando ? "⏳ Compilando…" : "Compilar ahora"}
        </button>
      </div>
    </div>
  );
}
