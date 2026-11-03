'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Encabezado, { BOTON_PRINCIPAL, BOTON_SECUNDARIO, CONTROL } from '@/components/Encabezado';
import { supabase } from '@/lib/supabase';
import { exportarExcel, exportarPdf, textoCelda, type Columna } from '@/lib/exportar';
import { numero, pesos, UNIDADES } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';

/* Equipos (cañones) instalados en clientes y su hoja de vida:
   todos los repuestos que se le han despachado a cada uno. */

interface Equipo {
  id: number;
  cliente_id: number;
  modelo: string;
  serial: string | null;
  planta: string | null;
  fecha_instalacion: string | null;
  notas: string | null;
  activo: boolean;
}
interface Cliente {
  id: number;
  nombre: string;
}
interface Repuesto {
  id: string;
  fecha: string;
  sku: string;
  producto: string;
  unidad_medida: string;
  cantidad: number;
  valor: number;
  documento_ref: string | null;
  registrado_por: string | null;
  tiene_firma: boolean;
}

const MODELOS = ['Destroyer', 'XHV', 'Capol', 'Otro'];
const fechaCorta = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export default function Equipos() {
  const sesion = useSesion();
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [totales, setTotales] = useState<Record<number, { n: number; valor: number }>>({});
  const [filtroCliente, setFiltroCliente] = useState('');
  const [elegido, setElegido] = useState<Equipo | null>(null);
  const [historia, setHistoria] = useState<Repuesto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ cliente_id: '', modelo: 'XHV', serial: '', planta: '', fecha_instalacion: '' });
  const [verForm, setVerForm] = useState(false);

  const cargar = useCallback(async () => {
    const [e, c, m] = await Promise.all([
      supabase.from('equipos').select('*').order('creado', { ascending: false }),
      supabase.from('clientes').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('v_movimientos').select('equipo_id, valor').not('equipo_id', 'is', null),
    ]);
    if (e.error) setError(`No se pudieron leer los equipos: ${e.error.message}`);
    setEquipos((e.data ?? []) as Equipo[]);
    setClientes((c.data ?? []) as Cliente[]);
    const t: Record<number, { n: number; valor: number }> = {};
    (m.data ?? []).forEach((x) => {
      const k = Number(x.equipo_id);
      t[k] = { n: (t[k]?.n ?? 0) + 1, valor: (t[k]?.valor ?? 0) + Number(x.valor ?? 0) };
    });
    setTotales(t);
  }, []);

  useEffect(() => {
    if (sesion.listo) cargar();
  }, [sesion.listo, cargar]);

  useEffect(() => {
    if (!elegido) return;
    supabase
      .from('v_movimientos')
      .select('id, fecha, sku, producto, unidad_medida, cantidad, valor, documento_ref, registrado_por, tiene_firma')
      .eq('equipo_id', elegido.id)
      .order('fecha', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        setHistoria((data ?? []).map((r) => ({ ...r, cantidad: Number(r.cantidad), valor: Number(r.valor ?? 0) })) as Repuesto[]);
      });
  }, [elegido]);

  const nombreCliente = (id: number) => clientes.find((c) => c.id === id)?.nombre ?? `Cliente ${id}`;
  const visibles = useMemo(() => equipos.filter((e) => !filtroCliente || String(e.cliente_id) === filtroCliente), [equipos, filtroCliente]);

  async function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.cliente_id) return setError('Escoja el cliente.');
    const { error } = await supabase.from('equipos').insert({
      cliente_id: Number(form.cliente_id),
      modelo: form.modelo,
      serial: form.serial.trim() || null,
      planta: form.planta.trim() || null,
      fecha_instalacion: form.fecha_instalacion || null,
    });
    if (error) return setError(error.code === '23505' ? 'Ya existe un equipo con ese serial.' : error.message);
    setError(null);
    setVerForm(false);
    setForm({ cliente_id: '', modelo: 'XHV', serial: '', planta: '', fecha_instalacion: '' });
    cargar();
  }

  async function exportar(formato: 'excel' | 'pdf') {
    if (!elegido) return;
    const columnas: Columna<Repuesto>[] = [
      { titulo: 'Fecha', ancho: 16, tipo: 'fecha', valor: (r) => r.fecha },
      { titulo: 'SKU', ancho: 20, tipo: 'texto', valor: (r) => r.sku },
      { titulo: 'Repuesto', ancho: 38, tipo: 'texto', valor: (r) => r.producto },
      { titulo: 'Cantidad', ancho: 10, tipo: 'numero', valor: (r) => r.cantidad },
      { titulo: 'Unidad', ancho: 8, tipo: 'texto', valor: (r) => UNIDADES[r.unidad_medida] ?? r.unidad_medida },
      { titulo: 'Valor', ancho: 14, tipo: 'moneda', valor: (r) => r.valor },
      { titulo: 'Documento', ancho: 12, tipo: 'texto', valor: (r) => r.documento_ref ?? '' },
      { titulo: 'Entregó', ancho: 20, tipo: 'texto', valor: (r) => `${r.registrado_por ?? ''}${r.tiene_firma ? ' (firmado)' : ''}` },
    ];
    const inf = {
      titulo: `Hoja de vida: ${elegido.modelo} ${elegido.serial ?? ''}`.trim(),
      archivo: `hoja_de_vida_${elegido.modelo}_${elegido.serial ?? elegido.id}`,
      detalle: [
        `Cliente: ${nombreCliente(elegido.cliente_id)}${elegido.planta ? `. Ubicación: ${elegido.planta}` : ''}`,
        `Instalado: ${fechaCorta(elegido.fecha_instalacion) || 'sin fecha'}. Generado por ${sesion.nombre}`,
      ],
      // Los valores en pesos solo los ve el administrador
      columnas: (sesion.esAdmin ? columnas : columnas.filter((c) => c.tipo !== 'moneda')) as Columna<unknown>[],
      filas: historia as unknown[],
      totales: [
        { etiqueta: 'Repuestos despachados', valor: String(historia.length) },
        ...(sesion.esAdmin ? [{ etiqueta: 'Valor total', valor: pesos.format(historia.reduce((s, r) => s + r.valor, 0)) }] : []),
      ],
    };
    if (formato === 'excel') await exportarExcel(inf);
    else await exportarPdf(inf);
  }

  // Informe de todos los equipos que se ven (todos los clientes o el escogido)
  async function exportarTodos(formato: 'excel' | 'pdf') {
    const ids = visibles.map((e) => e.id);
    if (!ids.length) return;
    // Última inspección de cada cañón
    const { data: ie } = await supabase.from('inspeccion_equipos').select('equipo_id, resultados, hallazgos, inspeccion_id').in('equipo_id', ids);
    const inspIds = [...new Set((ie ?? []).map((x) => x.inspeccion_id))];
    const { data: ins } = inspIds.length ? await supabase.from('inspecciones').select('id, fecha').in('id', inspIds) : { data: [] as { id: number; fecha: string }[] };
    const fechaDe = new Map((ins ?? []).map((i) => [i.id, i.fecha as string]));
    const ultima = new Map<number, { fecha: string; falla: boolean }>();
    (ie ?? []).forEach((x) => {
      const f = fechaDe.get(x.inspeccion_id) ?? '';
      const falla = Object.values((x.resultados ?? {}) as Record<string, string>).includes('FALLA') || ((x.hallazgos ?? []) as string[]).length > 0;
      const u = ultima.get(x.equipo_id);
      if (!u || f > u.fecha) ultima.set(x.equipo_id, { fecha: f, falla });
    });
    type F = Equipo & { n: number; valor: number; ultima: string; estado: string };
    const filas: F[] = visibles.map((e) => {
      const u = ultima.get(e.id);
      return { ...e, n: totales[e.id]?.n ?? 0, valor: totales[e.id]?.valor ?? 0, ultima: u?.fecha ?? '', estado: !u ? 'Sin inspección' : u.falla ? 'Con falla' : 'Sin fallas' };
    });
    const columnas: Columna<F>[] = [
      { titulo: 'Cliente', ancho: 26, tipo: 'texto', valor: (r) => nombreCliente(r.cliente_id) },
      { titulo: 'Modelo', ancho: 11, tipo: 'texto', valor: (r) => r.modelo },
      { titulo: 'Código / serial', ancho: 16, tipo: 'texto', valor: (r) => r.serial ?? '' },
      { titulo: 'Ubicación', ancho: 24, tipo: 'texto', valor: (r) => r.planta ?? '' },
      { titulo: 'Instalado', ancho: 12, tipo: 'texto', valor: (r) => fechaCorta(r.fecha_instalacion) },
      { titulo: 'Repuestos', ancho: 10, tipo: 'numero', valor: (r) => r.n },
      { titulo: 'Valor repuestos', ancho: 14, tipo: 'moneda', valor: (r) => r.valor },
      { titulo: 'Última inspección', ancho: 14, tipo: 'texto', valor: (r) => fechaCorta(r.ultima) },
      { titulo: 'Estado', ancho: 13, tipo: 'texto', valor: (r) => r.estado },
    ];
    const cliente = filtroCliente ? nombreCliente(Number(filtroCliente)) : 'Todos los clientes';
    const inf = {
      titulo: 'Equipos instalados',
      archivo: `equipos_instalados_${cliente.replace(/[^\w]+/g, '_').toLowerCase().slice(0, 30)}`,
      detalle: [`${cliente}: ${filas.length} cañones`, `Generado por ${sesion.nombre}`],
      columnas: (sesion.esAdmin ? columnas : columnas.filter((c) => c.tipo !== 'moneda')) as Columna<unknown>[],
      filas: filas as unknown[],
      totales: [
        { etiqueta: 'Cañones', valor: String(filas.length) },
        { etiqueta: 'Con falla en la última inspección', valor: String(filas.filter((f) => f.estado === 'Con falla').length) },
        { etiqueta: 'Sin inspección', valor: String(filas.filter((f) => f.estado === 'Sin inspección').length) },
        ...(sesion.esAdmin ? [{ etiqueta: 'Valor de repuestos', valor: pesos.format(filas.reduce((s, f) => s + f.valor, 0)) }] : []),
      ],
    };
    if (formato === 'excel') await exportarExcel(inf);
    else await exportarPdf(inf);
  }

  if (!sesion.listo) return <p className="py-24 text-center text-acero">Cargando…</p>;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <Encabezado titulo="Equipos instalados" />
      <p className="mt-4 max-w-3xl text-acero">
        Cada cañón instalado en un cliente tiene su hoja de vida: los repuestos que se le han cambiado, cuándo y quién los entregó. En la pestaña Inventario,
        al despachar a un cliente, se escoge el cañón.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} className={`${CONTROL} max-w-xs`} aria-label="Filtrar por cliente">
          <option value="">Todos los clientes</option>
          {clientes.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.nombre}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => exportarTodos('excel')} disabled={!visibles.length} className={BOTON_SECUNDARIO} title="Informe de todos los equipos que se ven">
            Informe Excel
          </button>
          <button onClick={() => exportarTodos('pdf')} disabled={!visibles.length} className={BOTON_SECUNDARIO} title="Informe de todos los equipos que se ven">
            Informe PDF
          </button>
          {sesion.puedeEditar && (
            <button onClick={() => setVerForm((v) => !v)} className={BOTON_PRINCIPAL}>
              {verForm ? 'Cerrar' : 'Registrar equipo'}
            </button>
          )}
        </div>
      </div>

      {verForm && (
        <form onSubmit={crear} className="mt-4 grid gap-3 rounded-lg border border-linea bg-white p-4 sm:grid-cols-2" noValidate>
          <label>
            <span className="mb-1 block text-sm font-medium">Cliente</span>
            <select value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })} className={CONTROL}>
              <option value="">Escoja el cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Modelo</span>
            <select value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} className={CONTROL}>
              {MODELOS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Serial (opcional)</span>
            <input value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} className={CONTROL} placeholder="Ej: XHV-2026-0145" />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Dónde está instalado (opcional)</span>
            <input value={form.planta} onChange={(e) => setForm({ ...form, planta: e.target.value })} className={CONTROL} placeholder="Ej: Silo de clinker 2" />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Fecha de instalación (opcional)</span>
            <input type="date" value={form.fecha_instalacion} onChange={(e) => setForm({ ...form, fecha_instalacion: e.target.value })} className={CONTROL} />
          </label>
          <div className="flex items-end">
            <button type="submit" className={BOTON_PRINCIPAL}>
              Guardar equipo
            </button>
          </div>
        </form>
      )}

      {error && <p className="mt-4 rounded border border-alerta bg-alerta-suave px-4 py-3 text-sm font-medium text-alerta">{error}</p>}

      <div className={`mt-5 grid gap-5 ${elegido ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]' : ''}`}>
        <ul className="h-fit divide-y divide-linea rounded-lg border border-linea bg-white">
          {visibles.length === 0 && <li className="px-4 py-8 text-center text-acero">No hay equipos registrados.</li>}
          {visibles.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => setElegido(elegido?.id === e.id ? null : e)}
                className={`w-full px-4 py-3 text-left hover:bg-concreto ${elegido?.id === e.id ? 'border-l-4 border-poli bg-concreto' : ''}`}
              >
                <span className="block font-bold">
                  {e.modelo} {e.serial}
                </span>
                <span className="block text-sm text-acero">
                  {nombreCliente(e.cliente_id)}
                  {e.planta ? `, ${e.planta}` : ''}
                </span>
                <span className="mt-1 block text-sm">
                  {totales[e.id]?.n ?? 0} repuestos despachados{totales[e.id]?.valor ? `, ${pesos.format(totales[e.id].valor)}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {elegido && (
          <section className="rounded-lg border border-linea bg-white p-4" aria-label="Hoja de vida">
            <h2 className="text-xl font-bold">
              Hoja de vida: {elegido.modelo} {elegido.serial}
            </h2>
            <p className="text-sm text-acero">
              {nombreCliente(elegido.cliente_id)}
              {elegido.planta ? `, ${elegido.planta}` : ''}. Instalado: {fechaCorta(elegido.fecha_instalacion) || 'sin fecha'}
            </p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => exportar('excel')} className={BOTON_SECUNDARIO}>
                Excel
              </button>
              <button onClick={() => exportar('pdf')} className={BOTON_SECUNDARIO}>
                PDF
              </button>
            </div>
            {historia.length === 0 ? (
              <p className="mt-4 text-acero">
                Aún no se le han despachado repuestos. En la pestaña Inventario, al registrar una salida a este cliente, escoja este cañón.
              </p>
            ) : (
              <ol className="mt-4 space-y-3 border-l-2 border-poli pl-4">
                {historia.map((r) => (
                  <li key={r.id}>
                    <p className="text-xs text-acero">{textoCelda('fecha', r.fecha)}</p>
                    <p className="font-semibold leading-snug">
                      {numero.format(r.cantidad)} {UNIDADES[r.unidad_medida] ?? r.unidad_medida} de {r.producto}
                    </p>
                    <p className="text-sm text-acero">
                      {r.sku}
                      {r.valor ? `, ${pesos.format(r.valor)}` : ''}
                      {r.documento_ref ? `, ${r.documento_ref}` : ''}. Entregó {r.registrado_por}
                      {r.tiene_firma ? ' (firmado)' : ''}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
