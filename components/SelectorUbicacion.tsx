'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface Ubicacion {
  id: number | string;
  nombre: string;
}

/* Selector de bodega o dependencia con un botón "+" para crear una nueva
   ahí mismo, sin salir de la pantalla. */
export default function SelectorUbicacion({
  id,
  ubicaciones,
  valor,
  onCambio,
  onCreada,
  puedeCrear,
  etiqueta = (u) => u.nombre,
}: {
  id: string;
  ubicaciones: Ubicacion[];
  valor: string;
  onCambio: (id: string) => void;
  onCreada: (u: Ubicacion) => void;
  puedeCrear: boolean;
  etiqueta?: (u: Ubicacion) => string;
}) {
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const n = nombre.trim();
    if (!n) return setError('Escriba el nombre de la bodega o dependencia.');
    if (ubicaciones.some((u) => u.nombre.toLowerCase() === n.toLowerCase())) return setError('Ya existe una con ese nombre.');
    setGuardando(true);
    const { data, error } = await supabase.from('ubicaciones').insert({ nombre: n }).select('id, nombre').single();
    setGuardando(false);
    if (error) return setError(error.code === '42501' ? 'Su usuario no puede crear dependencias.' : error.message);
    onCreada(data as Ubicacion);
    onCambio(String(data.id));
    setNombre('');
    setCreando(false);
    setError(null);
  }

  return (
    <div>
      <div className="flex gap-2">
        <select
          id={id}
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-linea bg-white px-3 py-2.5 text-base focus:border-poli focus:outline-none focus:ring-2 focus:ring-poli/40"
        >
          {ubicaciones.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {etiqueta(u)}
            </option>
          ))}
        </select>
        {puedeCrear && (
          <button
            type="button"
            onClick={() => {
              setCreando((c) => !c);
              setError(null);
            }}
            aria-label="Crear otra bodega o dependencia"
            title="Crear otra bodega o dependencia"
            aria-expanded={creando}
            className={`w-12 shrink-0 rounded-lg border text-2xl font-bold leading-none ${
              creando ? 'border-tinta bg-tinta text-white' : 'border-linea bg-white hover:border-tinta'
            }`}
          >
            {creando ? '×' : '+'}
          </button>
        )}
      </div>
      {creando && (
        <div className="mt-2 rounded-lg border border-linea bg-white p-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Nueva bodega o dependencia</span>
            <div className="flex gap-2">
              <input
                id={`${id}-nueva`}
                autoFocus
                value={nombre}
                onChange={(e) => {
                  setNombre(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    guardar();
                  }
                }}
                placeholder="Ej: Bodega 2, Patio de rollos"
                className="min-w-0 flex-1 rounded-lg border border-linea px-3 py-2 text-base"
              />
              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="rounded-lg bg-tinta px-4 py-2 font-semibold text-white hover:bg-poli hover:text-tinta disabled:opacity-50"
              >
                {guardando ? 'Creando…' : 'Crear'}
              </button>
            </div>
          </label>
          {error && <p className="mt-1 text-sm font-medium text-alerta">{error}</p>}
        </div>
      )}
    </div>
  );
}
