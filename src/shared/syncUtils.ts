/** Hash simple usando djb2 (5 líneas, sin dependencias externas). */
export function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash).toString(16);
}

export interface DesincronizacionInfo {
  desincronizado: boolean;
  razon?: "cambio_lenguaje" | "codigo_modificado";
  lenguajeActual: "st" | "ladder";
  lenguajeCompilado?: "st" | "ladder";
}

/**
 * Detecta si hay desincronización entre el código compilado y el estado actual.
 * @param lenguajeActual - lenguaje en el que estamos editando ahora
 * @param contenidoActual - contenido del editor actual (ST o Ladder serializado)
 * @param hashCompilado - hash guardado al último compilar exitoso
 */
export function detectarDesincronizacion(
  lenguajeActual: "st" | "ladder",
  contenidoActual: string,
  hashCompilado?: { lenguaje: "st" | "ladder"; hash: string }
): DesincronizacionInfo {
  if (!hashCompilado) {
    // Nunca se compiló: no hay desincronización (es el estado inicial).
    return { desincronizado: false, lenguajeActual };
  }

  // Si cambió de lenguaje → desincronizado.
  if (hashCompilado.lenguaje !== lenguajeActual) {
    return {
      desincronizado: true,
      razon: "cambio_lenguaje",
      lenguajeActual,
      lenguajeCompilado: hashCompilado.lenguaje,
    };
  }

  // Mismo lenguaje: chequear si el contenido cambió.
  const hashActual = simpleHash(contenidoActual);
  if (hashActual !== hashCompilado.hash) {
    return {
      desincronizado: true,
      razon: "codigo_modificado",
      lenguajeActual,
      lenguajeCompilado: hashCompilado.lenguaje,
    };
  }

  // No hay desincronización.
  return { desincronizado: false, lenguajeActual, lenguajeCompilado: hashCompilado.lenguaje };
}
