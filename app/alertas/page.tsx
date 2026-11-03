'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Encabezado, { BOTON_SECUNDARIO } from '@/components/Encabezado';
import { useSesion } from '@/lib/sesion';
import { cargarAlertas, NOMBRE_GRUPO, ORDEN_GRUPO, type Alerta } from '@/lib/alertas';

// Todas las alertas juntas, en una pantalla aparte (ya no salen en una ventana al abrir la app)
export default function Alertas() {
  const sesion = useSesion();
  const [alertas, setAlertas] = useState<Alerta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback((forzar = false) => {
    cargarAlertas(forzar)
      .then(setAlertas)
      .catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => {
    if (sesion.listo) cargar();
  }, [sesion.listo, cargar]);

  const grupos = ORDEN_GRUPO;
  const urgentes = alertas?.filter((a) => a.alta).length ?? 0;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-6 sm:px-6">
      <Encabezado titulo="Alertas" />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-acero">
          {alertas == null
            ? 'Revisando…'
            : alertas.length
              ? `${alertas.length} alertas${urgentes ? `, ${urgentes} urgentes` : ''}. Toque una para ir a la pantalla donde se resuelve.`
              : 'No hay alertas. Todo al día.'}
        </p>
        <button onClick={() => cargar(true)} className={BOTON_SECUNDARIO}>
          Actualizar
        </button>
      </div>
      {error && <p className="mt-3 rounded bg-alerta-suave px-3 py-2 text-sm text-alerta">{error}</p>}

      {alertas &&
        grupos.map((g) => {
          const lista = alertas.filter((a) => a.grupo === g);
          if (!lista.length) return null;
          return (
            <section key={g} className="mt-5 rounded-xl border border-linea bg-white">
              <h2 className="flex items-center justify-between border-b border-linea px-4 py-3 font-bold">
                {NOMBRE_GRUPO[g]}
                <span className={`rounded-full px-2.5 py-0.5 text-sm ${lista.some((a) => a.alta) ? 'bg-alerta text-white' : 'bg-poli text-tinta'}`}>{lista.length}</span>
              </h2>
              <ul className="divide-y divide-linea">
                {lista.map((a, i) => (
                  <li key={i}>
                    <Link href={a.enlace} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-concreto">
                      <span className={a.alta ? 'font-semibold text-alerta' : ''}>
                        {a.alta ? '⏰ ' : '• '}
                        {a.texto}
                      </span>
                      <span aria-hidden className="text-acero">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
    </main>
  );
}
