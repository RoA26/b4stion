'use client';

import { useEffect, useRef } from 'react';

/* Comunicación entre el asistente Blaster y las pantallas.
   El asistente deja la orden guardada (por si hay que cambiar de pantalla primero)
   y avisa; la pantalla la toma cuando está lista. */

export type TipoOrdenPagina = 'movimiento' | 'confirmar' | 'cancelar' | 'conteo' | 'informe' | 'etiquetas' | 'canon' | 'transito';
interface OrdenPagina {
  tipo: TipoOrdenPagina;
  datos: unknown;
  hora: number;
}

const CLAVE = 'poliway.blaster.orden';
const EVENTO = 'blaster:orden';
const EVENTO_DECIR = 'blaster:decir';

export function publicarOrden(tipo: TipoOrdenPagina, datos: unknown = null) {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify({ tipo, datos, hora: Date.now() } satisfies OrdenPagina));
  } catch {
    /* sin almacenamiento: se intenta igual con el evento */
    (window as unknown as { __blaster?: OrdenPagina }).__blaster = { tipo, datos, hora: Date.now() };
  }
  window.dispatchEvent(new Event(EVENTO));
}

function tomar(tipos: TipoOrdenPagina[]): OrdenPagina | null {
  let o: OrdenPagina | null = null;
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    o = crudo ? (JSON.parse(crudo) as OrdenPagina) : null;
  } catch {
    o = (window as unknown as { __blaster?: OrdenPagina }).__blaster ?? null;
  }
  if (!o || !tipos.includes(o.tipo)) return null;
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    delete (window as unknown as { __blaster?: OrdenPagina }).__blaster;
  }
  // Una orden de hace más de 1 minuto ya no aplica
  return Date.now() - o.hora < 60_000 ? o : null;
}

/* La pantalla recibe las órdenes de los tipos que maneja, cuando ya está lista */
export function useOrdenVoz(tipos: TipoOrdenPagina[], listo: boolean, manejar: (tipo: TipoOrdenPagina, datos: unknown) => void) {
  const ref = useRef(manejar);
  ref.current = manejar;
  const clave = tipos.join(',');
  useEffect(() => {
    if (!listo) return;
    const lista = clave.split(',') as TipoOrdenPagina[];
    const revisar = () => {
      const o = tomar(lista);
      if (o) ref.current(o.tipo, o.datos);
    };
    revisar();
    window.addEventListener(EVENTO, revisar);
    return () => window.removeEventListener(EVENTO, revisar);
  }, [listo, clave]);
}

/* Las pantallas le cuentan al asistente cómo terminó una orden (para decirlo en voz alta) */
export function decirAlAsistente(texto: string, ok = true) {
  window.dispatchEvent(new CustomEvent(EVENTO_DECIR, { detail: { texto, ok } }));
}
export function useEscucharPantallas(manejar: (texto: string, ok: boolean) => void) {
  const ref = useRef(manejar);
  ref.current = manejar;
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ texto: string; ok: boolean }>).detail;
      ref.current(d.texto, d.ok);
    };
    window.addEventListener(EVENTO_DECIR, f);
    return () => window.removeEventListener(EVENTO_DECIR, f);
  }, []);
}
