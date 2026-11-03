'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Encabezado from '@/components/Encabezado';
import { exportarExcel, exportarPdf, type Columna } from '@/lib/exportar';

/* Áreas, funcionarios y clientes: las listas que se usan al registrar salidas */

type Tabla = 'funcionarios' | 'areas' | 'clientes';
type Campo = { clave: string; etiqueta: string; obligatorio?: boolean; ejemplo: string };
type Fila = Record<string, string | number | boolean | null> & { id: number; activo: boolean };

const CONFIG: Record<Tabla, { titulo: string; singular: string; campos: Campo[] }> = {
  funcionarios: {
    titulo: 'Funcionarios',
    singular: 'funcionario',
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre completo', obligatorio: true, ejemplo: 'Ej: Juan Pérez' },
      { clave: 'documento', etiqueta: 'Cédula', ejemplo: 'Ej: 1045678901' },
      { clave: 'cargo', etiqueta: 'Cargo', ejemplo: 'Ej: Técnico de mantenimiento' },
    ],
  },
  areas: {
    titulo: 'Áreas',
    singular: 'área',
    campos: [{ clave: 'nombre', etiqueta: 'Nombre del área', obligatorio: true, ejemplo: 'Ej: Mantenimiento' }],
  },
  clientes: {
    titulo: 'Clientes',
    singular: 'cliente',
    campos: [
      { clave: 'nombre', etiqueta: 'Razón social', obligatorio: true, ejemplo: 'Ej: Cementos del Caribe S.A.S.' },
      { clave: 'nit', etiqueta: 'NIT', ejemplo: 'Ej: 900123456-7' },
      { clave: 'ciudad', etiqueta: 'Ciudad', ejemplo: 'Ej: Barranquilla' },
    ],
  },
};

function traducir(e: { code?: string; message?: string }) {
  if (e.code === '23505') return 'Ya existe un registro con ese mismo nombre, cédula o NIT.';
  if (e.code === '42501') return 'Su rol no permite modificar las listas.';
  return e.message ?? 'No se pudo guardar.';
}

export default function Listas() {
  const router = useRouter();
  const [tabla, setTabla] = useState<Tabla>('funcionarios');
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cfg = CONFIG[tabla];

  const cargar = useCallback(async (t: Tabla) => {
    setCargando(true);
    const columnas = ['id', 'activo', ...CONFIG[t].campos.map((c) => c.clave)].join(', ');
    const { data, error } = await supabase.from(t).select(columnas).order('nombre');
    if (error) setError(`No se pudo leer la lista: ${error.message}`);
    setFilas((data ?? []) as unknown as Fila[]);
    setCargando(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login');
    });
  }, [router]);

  useEffect(() => {
    setForm({});
    setError(null);
    cargar(tabla);
  }, [tabla, cargar]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3000);
    return () => clearTimeout(t);
  }, [aviso]);

  async function agregar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos: Record<string, string | null> = {};
    for (const c of cfg.campos) {
      const v = (form[c.clave] ?? '').trim();
      if (c.obligatorio && !v) return setError(`Escriba ${c.etiqueta.toLowerCase()}.`);
      datos[c.clave] = v || null;
    }
    setGuardando(true);
    setError(null);
    const { error } = await supabase.from(tabla).insert(datos);
    setGuardando(false);
    if (error) return setError(traducir(error));
    setForm({});
    setAviso(`${datos.nombre} agregado a ${cfg.titulo.toLowerCase()}`);
    cargar(tabla);
  }

  async function alternar(f: Fila) {
    const { error } = await supabase.from(tabla).update({ activo: !f.activo }).eq('id', f.id);
    if (error) return setError(traducir(error));
    setFilas((lista) => lista.map((x) => (x.id === f.id ? { ...x, activo: !f.activo } : x)));
  }

  // Informe de la lista que se está viendo (funcionarios, áreas o clientes)
  async function informe(formato: 'excel' | 'pdf') {
    const columnas: Columna<Fila>[] = [
      ...cfg.campos.map((c) => ({ titulo: c.etiqueta, ancho: c.clave === 'nombre' ? 34 : 20, tipo: 'texto' as const, valor: (f: Fila) => String(f[c.clave] ?? '').replace(/\s*\(demo\)/i, '') })),
      { titulo: 'Estado', ancho: 10, tipo: 'texto', valor: (f) => (f.activo ? 'Activo' : 'Inactivo') },
    ];
    const inf = {
      titulo: `Lista de ${cfg.titulo.toLowerCase()}`,
      archivo: `lista_${tabla}`,
      detalle: [`${filas.length} registros, ${filas.filter((f) => f.activo).length} activos`],
      columnas: columnas as Columna<unknown>[],
      filas: filas as unknown[],
    };
    if (formato === 'excel') await exportarExcel(inf);
    else await exportarPdf(inf);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-6 sm:px-6">
      <Encabezado titulo="Listas">
        <button onClick={() => informe('excel')} disabled={!filas.length} className="rounded border border-tinta px-3 py-1.5 font-medium hover:bg-tinta hover:text-white disabled:opacity-40">
          Excel
        </button>
        <button onClick={() => informe('pdf')} disabled={!filas.length} className="rounded border border-tinta px-3 py-1.5 font-medium hover:bg-tinta hover:text-white disabled:opacity-40">
          PDF
        </button>
      </Encabezado>

      <p className="mt-4 text-acero">
        Estas listas aparecen al registrar una salida: a qué funcionario se entrega y en qué área se usa, o a qué cliente se despacha.
      </p>

      <div className="mt-5 flex gap-1 rounded-lg border border-linea bg-white p-1" role="tablist">
        {(Object.keys(CONFIG) as Tabla[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tabla === t}
            onClick={() => setTabla(t)}
            className={`flex-1 rounded-md px-3 py-2 font-bold ${tabla === t ? 'bg-tinta text-white' : 'text-acero hover:text-tinta'}`}
          >
            {CONFIG[t].titulo}
          </button>
        ))}
      </div>

      {/* Agregar */}
      <form onSubmit={agregar} className="mt-5 rounded-lg border border-linea bg-white p-4" noValidate>
        <h2 className="font-bold">Agregar {cfg.singular}</h2>
        <div className={`mt-3 grid gap-3 ${cfg.campos.length > 1 ? 'sm:grid-cols-3' : ''}`}>
          {cfg.campos.map((c) => (
            <label key={c.clave} className="block">
              <span className="mb-1 block text-sm font-medium">
                {c.etiqueta} {!c.obligatorio && <span className="font-normal text-acero">(opcional)</span>}
              </span>
              <input
                id={`nuevo-${c.clave}`}
                value={form[c.clave] ?? ''}
                onChange={(e) => {
                  setForm((f) => ({ ...f, [c.clave]: e.target.value }));
                  setError(null);
                }}
                placeholder={c.ejemplo}
                className="w-full rounded-lg border border-linea px-3 py-2.5 text-base focus:border-poli focus:outline-none focus:ring-2 focus:ring-poli/40"
              />
            </label>
          ))}
        </div>
        {error && <p role="alert" className="mt-3 rounded bg-alerta-suave px-3 py-2 text-sm font-medium text-alerta">{error}</p>}
        <button
          type="submit"
          disabled={guardando}
          className="mt-4 rounded-lg bg-tinta px-5 py-2.5 font-semibold text-white hover:bg-poli hover:text-tinta disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : `Agregar ${cfg.singular}`}
        </button>
      </form>

      {/* Lista */}
      <section className="mt-6">
        {cargando ? (
          <p className="py-8 text-center text-acero">Cargando…</p>
        ) : filas.length === 0 ? (
          <p className="py-8 text-center text-acero">Todavía no hay {cfg.titulo.toLowerCase()}. Agregue el primero arriba.</p>
        ) : (
          <ul className="divide-y divide-linea rounded-lg border border-linea bg-white">
            {filas.map((f) => (
              <li key={f.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${f.activo ? '' : 'opacity-50'}`}>
                <div className="min-w-0">
                  <p className="font-semibold">{String(f.nombre)}</p>
                  <p className="text-sm text-acero">
                    {cfg.campos
                      .slice(1)
                      .map((c) => f[c.clave])
                      .filter(Boolean)
                      .join(', ') || ' '}
                  </p>
                </div>
                <button
                  onClick={() => alternar(f)}
                  className="rounded border border-linea px-3 py-1.5 text-sm font-medium hover:border-tinta"
                >
                  {f.activo ? 'Desactivar' : 'Activar'}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-acero">
          Desactivar oculta el registro de las listas de salida, pero conserva su historial en los informes.
        </p>
      </section>

      {aviso && (
        <div
          role="status"
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[min(92vw,480px)] -translate-x-1/2 rounded-lg bg-poli px-4 py-3 text-center font-semibold text-tinta shadow-lg"
        >
          {aviso}
        </div>
      )}
    </main>
  );
}
