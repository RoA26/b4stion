'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Encabezado, { BOTON_ACENTO, BOTON_PRINCIPAL, BOTON_SECUNDARIO, CONTROL } from '@/components/Encabezado';
import FirmaPad from '@/components/FirmaPad';
import { supabase } from '@/lib/supabase';
import { useSesion, type Sesion } from '@/lib/sesion';
import { cargarCatalogo, type ProductoBasico } from '@/lib/catalogo';
import { leerMonto, numero, UNIDADES } from '@/lib/formato';
import { dejarPedidoPendiente } from '@/lib/archivoPendiente';
import { excelChecklistDiario, excelHojaDeVida } from '@/lib/formatoPoliway';
import {
  ACCIONES_TOMADAS,
  ADVERTENCIA,
  DOC,
  OBS_PREDETERMINADAS,
  OBS_TAREAS,
  VALORES_MEDICION,
  alternarFrase,
  tieneFrase,
  GRUPOS_DETALLE,
  HALLAZGOS_DETALLE,
  HALLAZGOS_RONDA,
  LLENADO_REF,
  MEDICIONES,
  PUNTOS_RONDA,
  TANQUES,
  descargarInspeccionPdf,
  leerCanonesExcel,
  repuestosSugeridos,
  revisarMediciones,
  type CanonLeido,
  type DatosInspeccion,
  type Resultado,
} from '@/lib/inspeccion';

/* =====================================================================
   INSPECCIÓN DE CAÑONES (formato POL-CL-DIARIO-CAN)
   - Ronda diaria: todos los cañones de una planta, 12 puntos rápidos
   - Inspección a fondo: un cañón, 23 tareas con criterio y mediciones
   - Los hallazgos sugieren el repuesto, muestran existencia y lo sacan
     del inventario cargado a ese cliente y a ese cañón
   Registran: administrador y almacén (técnicos). Consulta solo ve.
   ===================================================================== */

type Pestana = 'ronda' | 'fondo' | 'historial' | 'cargar';
interface Cliente {
  id: number;
  nombre: string;
}
interface Equipo {
  id: number;
  cliente_id: number;
  modelo: string;
  serial: string | null;
  planta: string | null;
  tanque_litros: number | null;
  orden: number | null;
  activo: boolean;
}
interface Marca {
  r: Record<string, Resultado>;
  h: string[];
  obs: string;
}

const hoyISO = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const fechaCorta = (f: string) => new Date(`${f.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
const CLAVE_CLIENTE = 'poliway.inspeccion.cliente';
const leerLocal = <T,>(k: string): T | null => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
};
const guardarLocal = (k: string, v: unknown) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* sin almacenamiento: el borrador no se guarda, no pasa nada */
  }
};
const siguiente = (r: Resultado | undefined): Resultado | undefined => (r === undefined ? 'OK' : r === 'OK' ? 'FALLA' : r === 'FALLA' ? 'NA' : undefined);
const COLOR: Record<Resultado, string> = {
  OK: 'border-tinta bg-tinta text-white',
  FALLA: 'border-alerta bg-alerta text-white',
  NA: 'border-linea bg-linea text-acero',
};
const SIMBOLO: Record<Resultado, string> = { OK: '✓', FALLA: '✗', NA: 'N/A' };
const ubicacionDe = (e: Equipo) => e.planta?.trim() || 'Sin ubicación';
const ordenar = (a: Equipo, b: Equipo) => (a.orden ?? 1e9) - (b.orden ?? 1e9) || (a.serial ?? '').localeCompare(b.serial ?? '', 'es', { numeric: true });

export default function Inspecciones() {
  const sesion = useSesion();
  const [pestana, setPestana] = useState<Pestana>('ronda');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteIdEstado] = useState<number | null>(null);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [verId, setVerId] = useState<number | null>(null);
  const [corrigiendo, setCorrigiendo] = useState<Insp | null>(null);

  const setClienteId = (id: number | null) => {
    setClienteIdEstado(id);
    guardarLocal(CLAVE_CLIENTE, id);
  };

  const cargarClientes = useCallback(async () => {
    const { data } = await supabase.from('clientes').select('id, nombre').eq('activo', true).order('nombre');
    const lista = (data ?? []) as Cliente[];
    setClientes(lista);
    return lista;
  }, []);

  useEffect(() => {
    if (!sesion.listo) return;
    cargarClientes().then((lista) => {
      const guardado = leerLocal<number>(CLAVE_CLIENTE);
      if (guardado && lista.some((c) => c.id === guardado)) setClienteIdEstado(guardado);
      else if (lista.length === 1) setClienteIdEstado(lista[0].id);
    });
    if (!sesion.puedeEditar) setPestana('historial');
    // Desde el buscador: /inspecciones?pestana=fondo | historial | cargar
    const v = new URLSearchParams(window.location.search).get('pestana');
    if (v === 'fondo' || v === 'historial' || (v === 'cargar' && sesion.esAdmin) || (v === 'ronda' && sesion.puedeEditar)) setPestana(v as Pestana);
  }, [sesion.listo, sesion.puedeEditar, sesion.esAdmin, cargarClientes]);

  const cargarEquipos = useCallback(async () => {
    if (!clienteId) return setEquipos([]);
    const { data } = await supabase.from('equipos').select('*').eq('cliente_id', clienteId).eq('activo', true);
    setEquipos(((data ?? []) as Equipo[]).sort(ordenar));
  }, [clienteId]);
  useEffect(() => {
    cargarEquipos();
  }, [cargarEquipos]);

  if (!sesion.listo) return <p className="py-24 text-center text-acero">Cargando…</p>;
  const cliente = clientes.find((c) => c.id === clienteId) ?? null;

  const PESTANAS: [Pestana, string][] = [
    ...(sesion.puedeEditar
      ? ([
          ['ronda', 'Ronda diaria'],
          ['fondo', 'Inspección a fondo'],
        ] as [Pestana, string][])
      : []),
    ['historial', 'Historial'],
    ...(sesion.esAdmin ? ([['cargar', 'Cargar cañones']] as [Pestana, string][]) : []),
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <Encabezado titulo="Inspección de cañones" />
      <p className="mt-3 text-xs text-acero">ISO 9001 · {DOC}</p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block min-w-[16rem] flex-1">
          <span className="mb-1 block text-sm font-semibold">Planta / cliente</span>
          <select value={clienteId ?? ''} onChange={(e) => setClienteId(e.target.value ? Number(e.target.value) : null)} className={CONTROL}>
            <option value="">Escoja la planta…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        {cliente && <p className="pb-2 text-sm text-acero">{equipos.length} cañones registrados</p>}
      </div>

      <div className="mt-4 flex flex-wrap gap-1 rounded-lg border border-linea bg-white p-1" role="tablist">
        {PESTANAS.map(([k, t]) => (
          <button
            key={k}
            role="tab"
            aria-selected={pestana === k}
            onClick={() => {
              setPestana(k);
              setVerId(null);
            }}
            className={`flex-1 rounded-md px-3 py-2 font-bold ${pestana === k ? 'bg-tinta text-white' : 'text-acero hover:text-tinta'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {corrigiendo && cliente && cliente.id === corrigiendo.cliente_id ? (
        corrigiendo.tipo === 'RONDA' ? (
          <Ronda
            key={`c${corrigiendo.id}`}
            cliente={cliente}
            equipos={equipos}
            sesion={sesion}
            inicial={corrigiendo}
            onCancelar={() => {
              setVerId(corrigiendo.id);
              setCorrigiendo(null);
            }}
            onGuardada={(id) => {
              setCorrigiendo(null);
              setVerId(id);
            }}
          />
        ) : (
          <Fondo
            key={`c${corrigiendo.id}`}
            cliente={cliente}
            equipos={equipos}
            sesion={sesion}
            inicial={corrigiendo}
            onCancelar={() => {
              setVerId(corrigiendo.id);
              setCorrigiendo(null);
            }}
            onGuardada={(id) => {
              setCorrigiendo(null);
              setVerId(id);
            }}
            onEquipos={cargarEquipos}
          />
        )
      ) : verId != null ? (
        <VistaInspeccion
          id={verId}
          sesion={sesion}
          onVolver={() => setVerId(null)}
          onCorregir={(i) => {
            // Se abre la planta de esa inspección y su pantalla, con todo lo marcado
            if (clienteId !== i.cliente_id) setClienteId(i.cliente_id);
            setCorrigiendo(i);
            setVerId(null);
          }}
        />
      ) : pestana === 'cargar' ? (
        <Cargar
          clientes={clientes}
          clienteId={clienteId}
          onListo={async (id) => {
            await cargarClientes();
            setClienteId(id);
            await cargarEquipos();
            setPestana('ronda');
          }}
        />
      ) : !cliente ? (
        <p className="mt-6 rounded-lg border border-linea bg-white p-6 text-center text-acero">
          Escoja la planta arriba.{sesion.esAdmin && ' Si sus cañones todavía no están en la app, cárguelos desde el Excel en «Cargar cañones».'}
        </p>
      ) : pestana === 'ronda' ? (
        <Ronda cliente={cliente} equipos={equipos} sesion={sesion} onGuardada={setVerId} />
      ) : pestana === 'fondo' ? (
        <Fondo cliente={cliente} equipos={equipos} sesion={sesion} onGuardada={setVerId} onEquipos={cargarEquipos} />
      ) : (
        <Historial cliente={cliente} equipos={equipos} sesion={sesion} onVer={setVerId} />
      )}
    </main>
  );
}

/* ============================== RONDA DIARIA ============================== */

// Aviso arriba cuando se está corrigiendo una inspección guardada
function AvisoCorreccion({ insp, onCancelar }: { insp: Insp; onCancelar?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-poli bg-poli/20 px-4 py-2">
      <p className="font-semibold">
        ✏ Corrigiendo la {insp.tipo === 'RONDA' ? 'ronda' : 'inspección a fondo'} N.° {insp.id} del {fechaCorta(insp.fecha)}. Al guardar se actualiza esa misma inspección.
      </p>
      {onCancelar && (
        <button onClick={onCancelar} className="font-semibold underline">
          Cancelar corrección
        </button>
      )}
    </div>
  );
}

function Ronda({
  cliente,
  equipos,
  sesion,
  onGuardada,
  inicial,
  onCancelar,
}: {
  cliente: Cliente;
  equipos: Equipo[];
  sesion: Sesion;
  onGuardada: (id: number) => void;
  inicial?: Insp;
  onCancelar?: () => void;
}) {
  const clave = inicial ? `poliway.ronda.correccion.${inicial.id}` : `poliway.ronda.${cliente.id}`;
  const [marcas, setMarcas] = useState<Record<number, Marca>>({});
  const [datos, setDatos] = useState({ fecha: hoyISO(), turno: '', zona: '', inspector: sesion.nombre, observaciones: '' });
  const [abiertos, setAbiertos] = useState<Record<number, boolean>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [resaltado, setResaltado] = useState<number | null>(null);

  // Salta al cañón escrito en el buscador y lo resalta un momento
  function irA(codigo: string) {
    const q = codigo.trim().toUpperCase().replace(/\s+/g, '');
    if (!q) return;
    const e =
      equipos.find((x) => (x.serial ?? '').toUpperCase().replace(/\s+/g, '') === q) ??
      equipos.find((x) => (x.serial ?? '').toUpperCase().replace(/\s+/g, '').includes(q));
    if (!e) return setError(`No hay un cañón con el código ${codigo.trim()}.`);
    setError(null);
    setResaltado(e.id);
    document.getElementById(`canon-${e.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setResaltado((r) => (r === e.id ? null : r)), 2500);
  }

  // Borrador: si el técnico cierra la app en plena ronda, no pierde lo marcado.
  // Al corregir se parte de lo que se guardó en la inspección.
  useEffect(() => {
    if (inicial) {
      setMarcas(Object.fromEntries(inicial.inspeccion_equipos.map((f) => [f.equipo_id, { r: { ...f.resultados }, h: [...(f.hallazgos ?? [])], obs: f.observacion ?? '' }])));
      setDatos((d) => ({ ...d, fecha: inicial.fecha, turno: inicial.turno ?? '', zona: inicial.zona ?? '', inspector: inicial.inspector ?? d.inspector, observaciones: inicial.observaciones ?? '' }));
      setCargado(false);
      return;
    }
    const b = leerLocal<{ marcas: Record<number, Marca>; datos: typeof datos }>(clave);
    if (b) {
      setMarcas(b.marcas ?? {});
      setDatos((d) => ({ ...d, ...b.datos }));
    }
    setCargado(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  useEffect(() => {
    if (cargado) guardarLocal(clave, { marcas, datos });
  }, [cargado, clave, marcas, datos]);

  const grupos = useMemo(() => {
    const m = new Map<string, Equipo[]>();
    equipos.forEach((e) => m.set(ubicacionDe(e), [...(m.get(ubicacionDe(e)) ?? []), e]));
    return [...m.entries()];
  }, [equipos]);

  const marca = (id: number): Marca => marcas[id] ?? { r: {}, h: [], obs: '' };
  const cambiar = (id: number, f: (m: Marca) => Marca) => setMarcas((x) => ({ ...x, [id]: f(x[id] ?? { r: {}, h: [], obs: '' }) }));
  const todoBien = (ids: number[]) =>
    setMarcas((x) => {
      const n = { ...x };
      ids.forEach((id) => {
        const m = n[id] ?? { r: {}, h: [], obs: '' };
        const r = { ...m.r };
        PUNTOS_RONDA.forEach((p) => {
          if (!r[p.id]) r[p.id] = 'OK';
        });
        n[id] = { ...m, r };
      });
      return n;
    });

  // Deshacer: deja los cañones sin marcas (los puntos, hallazgos y observaciones)
  const quitarMarcas = (ids: number[]) =>
    setMarcas((x) => {
      const n = { ...x };
      ids.forEach((id) => delete n[id]);
      return n;
    });
  const estaCompleto = (id: number) => Object.keys(marca(id).r).length === PUNTOS_RONDA.length;

  const revisados = equipos.filter((e) => Object.keys(marca(e.id).r).length || marca(e.id).h.length);
  const conFalla = revisados.filter((e) => Object.values(marca(e.id).r).includes('FALLA') || marca(e.id).h.length);
  const incompletos = revisados.filter((e) => Object.keys(marca(e.id).r).length < PUNTOS_RONDA.length);

  async function guardar() {
    if (!revisados.length) return setError('Marque al menos un cañón.');
    setGuardando(true);
    setError(null);
    const comun = {
      p_equipos: revisados.map((e) => ({ equipo_id: e.id, resultados: marca(e.id).r, hallazgos: marca(e.id).h, observacion: marca(e.id).obs })),
      p_fecha: datos.fecha,
      p_turno: datos.turno,
      p_zona: datos.zona,
      p_inspector: datos.inspector,
      p_observaciones: datos.observaciones,
    };
    const { data, error } = inicial
      ? await supabase.rpc('corregir_inspeccion', { p_id: inicial.id, ...comun })
      : await supabase.rpc('guardar_inspeccion', { p_tipo: 'RONDA', p_cliente_id: cliente.id, ...comun });
    setGuardando(false);
    if (error) return setError(error.message);
    guardarLocal(clave, null);
    setMarcas({});
    onGuardada(Number(data));
  }

  if (!equipos.length) return <p className="mt-6 rounded-lg border border-linea bg-white p-6 text-center text-acero">Esta planta no tiene cañones registrados.</p>;

  return (
    <div className="mt-4 space-y-4">
      {inicial && <AvisoCorreccion insp={inicial} onCancelar={onCancelar} />}
      <Advertencia />
      <section className="grid gap-3 rounded-lg border border-linea bg-white p-4 sm:grid-cols-2">
        <Campo etiqueta="Zona">
          <input value={datos.zona} onChange={(e) => setDatos({ ...datos, zona: e.target.value })} placeholder="Opcional" className={CONTROL} />
        </Campo>
        <Campo etiqueta="Inspector">
          <input value={datos.inspector} onChange={(e) => setDatos({ ...datos, inspector: e.target.value })} className={CONTROL} />
        </Campo>
      </section>

      {/* Barra fija: la información de la ronda y el botón de guardar siempre a la mano */}
      <div className="sticky top-0 z-20 -mx-1 space-y-2 rounded-lg border-2 border-tinta bg-white/95 px-3 py-2 text-sm shadow-md backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-bold">{cliente.nombre}</span>
          <input
            type="date"
            value={datos.fecha}
            onChange={(e) => setDatos({ ...datos, fecha: e.target.value })}
            aria-label="Fecha"
            className="rounded border border-linea px-2 py-1"
          />
          <select value={datos.turno} onChange={(e) => setDatos({ ...datos, turno: e.target.value })} aria-label="Turno" className="rounded border border-linea bg-white px-2 py-1">
            <option value="">Turno…</option>
            <option>Mañana</option>
            <option>Tarde</option>
            <option>Noche</option>
          </select>
          <span>
            <b>{revisados.length}</b> de {equipos.length} revisados
            {conFalla.length > 0 && <b className="text-alerta"> · {conFalla.length} con falla</b>}
          </span>
          <button onClick={guardar} disabled={guardando} className="ml-auto rounded-lg bg-tinta px-4 py-2 font-bold text-white hover:bg-poli hover:text-tinta disabled:opacity-50">
            {guardando ? 'Guardando…' : inicial ? 'Guardar corrección' : `Guardar ronda (${revisados.length})`}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={buscar}
            list="lista-canones-ronda"
            onChange={(e) => {
              const v = e.target.value;
              setBuscar(v);
              // Al escoger de la lista se salta de una vez al cañón
              if (equipos.some((x) => `${x.serial} · ${ubicacionDe(x)}` === v)) irA(v.split(' · ')[0]);
            }}
            onKeyDown={(e) => e.key === 'Enter' && irA(buscar.split(' · ')[0])}
            placeholder="Ir al cañón: toque y escoja de la lista, o escriba el código"
            aria-label="Buscar cañón por código"
            className="min-w-0 flex-1 rounded border border-linea px-2 py-1"
          />
          <datalist id="lista-canones-ronda">
            {equipos.map((x) => (
              <option key={x.id} value={`${x.serial} · ${ubicacionDe(x)}`} />
            ))}
          </datalist>
          <span className="hidden text-xs text-acero sm:inline">Toque cada punto: ✓ bien → ✗ falla → N/A → vacío</span>
        </div>
        {error && <p className="rounded bg-alerta-suave px-3 py-1.5 font-medium text-alerta">{error}</p>}
      </div>

      {grupos.map(([ub, lista]) => (
        <section key={ub} className="rounded-xl border border-linea bg-white">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-linea bg-poli/15 px-4 py-2">
            <h2 className="font-bold">Ubicación: {ub}</h2>
            {lista.every((e) => estaCompleto(e.id)) ? (
              <button onClick={() => quitarMarcas(lista.map((e) => e.id))} className="rounded border border-alerta bg-white px-3 py-1 text-sm font-semibold text-alerta">
                ↺ Quitar marcas en {ub}
              </button>
            ) : (
              <button onClick={() => todoBien(lista.map((e) => e.id))} className="rounded border border-tinta bg-white px-3 py-1 text-sm font-semibold">
                ✓ Todo bien en {ub}
              </button>
            )}
          </header>
          <ul className="divide-y divide-linea">
            {lista.map((e) => {
              const m = marca(e.id);
              const falla = Object.values(m.r).includes('FALLA') || m.h.length > 0;
              const completo = Object.keys(m.r).length === PUNTOS_RONDA.length;
              const abierto = abiertos[e.id] || falla;
              return (
                <li
                  key={e.id}
                  id={`canon-${e.id}`}
                  className={`scroll-mt-40 px-4 py-3 transition ${resaltado === e.id ? 'bg-poli/40 ring-2 ring-poli' : falla ? 'bg-alerta-suave/40' : ''}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold">
                      {e.serial ?? `#${e.id}`} <span className="text-sm font-normal text-acero">· {e.modelo}</span>
                      {completo && !falla && <span className="ml-2 text-sm text-oro-oscuro">✓ revisado</span>}
                    </span>
                    <span className="flex gap-2">
                      {Object.keys(m.r).length || m.h.length ? (
                        <button onClick={() => quitarMarcas([e.id])} className="rounded border border-linea px-2 py-1 text-xs font-semibold text-alerta hover:border-alerta">
                          ↺ Quitar marcas
                        </button>
                      ) : null}
                      {!estaCompleto(e.id) && (
                        <button onClick={() => todoBien([e.id])} className="rounded border border-linea px-2 py-1 text-xs font-semibold hover:border-tinta">
                          ✓ Todo bien
                        </button>
                      )}
                      <button onClick={() => setAbiertos((a) => ({ ...a, [e.id]: !a[e.id] }))} className="rounded border border-linea px-2 py-1 text-xs font-semibold hover:border-tinta">
                        Hallazgos
                      </button>
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6 lg:grid-cols-12">
                    {PUNTOS_RONDA.map((p) => {
                      const r = m.r[p.id];
                      return (
                        <button
                          key={p.id}
                          onClick={() =>
                            cambiar(e.id, (x) => {
                              const n = { ...x.r };
                              const s = siguiente(r);
                              if (s) n[p.id] = s;
                              else delete n[p.id];
                              return { ...x, r: n };
                            })
                          }
                          title={p.texto}
                          aria-label={`${p.texto}: ${r ?? 'sin revisar'}`}
                          className={`rounded border px-1 py-1.5 text-[11px] font-semibold leading-tight ${r ? COLOR[r] : 'border-linea bg-white text-tinta'}`}
                        >
                          <span className="block">{p.corto}</span>
                          <span className="block text-sm">{r ? SIMBOLO[r] : '·'}</span>
                        </button>
                      );
                    })}
                  </div>
                  {abierto && (
                    <div className="mt-2 space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {HALLAZGOS_RONDA.map((h) => {
                          const on = m.h.includes(h.id);
                          return (
                            <button
                              key={h.id}
                              onClick={() => cambiar(e.id, (x) => ({ ...x, h: on ? x.h.filter((y) => y !== h.id) : [...x.h, h.id] }))}
                              className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? 'border-alerta bg-alerta text-white' : 'border-linea bg-white'}`}
                            >
                              {on ? '☑' : '☐'} {h.texto}
                            </button>
                          );
                        })}
                      </div>
                      {PUNTOS_RONDA.filter((p) => m.r[p.id] === 'FALLA' && OBS_PREDETERMINADAS[p.id]).map((p) => (
                        <div key={p.id} className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-bold text-alerta">✗ {p.texto}:</span>
                          <Frases opciones={OBS_PREDETERMINADAS[p.id]} texto={m.obs} onCambio={(t) => cambiar(e.id, (x) => ({ ...x, obs: t }))} />
                        </div>
                      ))}
                      <input
                        value={m.obs}
                        onChange={(ev) => cambiar(e.id, (x) => ({ ...x, obs: ev.target.value }))}
                        placeholder="Observación de este cañón (escoja arriba o escriba a mano)"
                        className={`${CONTROL} text-sm`}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="space-y-3 rounded-xl border-2 border-tinta bg-white p-4">
        <Campo etiqueta="Observaciones / acción tomada">
          <textarea value={datos.observaciones} onChange={(e) => setDatos({ ...datos, observaciones: e.target.value })} rows={2} className={CONTROL} />
        </Campo>
        <Frases opciones={ACCIONES_TOMADAS} texto={datos.observaciones} onCambio={(t) => setDatos({ ...datos, observaciones: t })} />
        {incompletos.length > 0 && (
          <p className="text-sm text-acero">
            {incompletos.length} cañones quedaron con puntos sin marcar ({incompletos.slice(0, 5).map((e) => e.serial).join(', ')}
            {incompletos.length > 5 ? '…' : ''}). Se guardan así.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={guardar} disabled={guardando} className={BOTON_PRINCIPAL}>
            {guardando ? 'Guardando…' : inicial ? 'Guardar corrección' : `Guardar ronda (${revisados.length} cañones)`}
          </button>
          {Object.keys(marcas).length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('¿Borrar todo lo marcado en esta ronda?')) setMarcas({});
              }}
              className="font-semibold text-alerta underline"
            >
              Empezar de nuevo
            </button>
          )}
          {error && <p className="flex-1 rounded bg-alerta-suave px-3 py-2 text-sm font-medium text-alerta">{error}</p>}
        </div>
        <p className="text-xs text-acero">Lo marcado se guarda solo en este equipo mientras termina la ronda.</p>
      </section>
    </div>
  );
}

/* =========================== INSPECCIÓN A FONDO =========================== */

function Fondo({
  cliente,
  equipos,
  sesion,
  onGuardada,
  onEquipos,
  inicial,
  onCancelar,
}: {
  cliente: Cliente;
  equipos: Equipo[];
  sesion: Sesion;
  onGuardada: (id: number) => void;
  onEquipos: () => Promise<void>;
  inicial?: Insp;
  onCancelar?: () => void;
}) {
  const [equipoId, setEquipoId] = useState<number | null>(null);
  const [tanque, setTanque] = useState<number | null>(null);
  const [med, setMed] = useState<Record<string, string>>({});
  const [res, setRes] = useState<Record<string, Resultado>>({});
  const [obsTarea, setObsTarea] = useState<Record<string, string>>({});
  const [hall, setHall] = useState<string[]>([]);
  const [datos, setDatos] = useState({ fecha: hoyISO(), turno: '', inspector: sesion.nombre, observaciones: '' });
  const [firma, setFirma] = useState<string | null>(null);
  const primeraCarga = useRef(!!inicial);

  // Al corregir: se carga todo lo que tenía la inspección guardada
  useEffect(() => {
    if (!inicial) return;
    const f = inicial.inspeccion_equipos[0];
    if (!f) return;
    setEquipoId(f.equipo_id);
    setRes({ ...f.resultados });
    setHall([...(f.hallazgos ?? [])]);
    const m = (f.mediciones ?? {}) as Record<string, number | null>;
    setMed(Object.fromEntries(Object.entries(m).filter(([k, v]) => k !== 'tanque' && v != null).map(([k, v]) => [k, String(v)])));
    if (m.tanque) setTanque(Number(m.tanque));
    const obs: Record<string, string> = {};
    (f.observacion ?? '').split(/\s*·\s*/).forEach((p) => {
      const x = p.match(/^([A-D]\d)\s*:\s*(.+)$/);
      if (x) obs[x[1]] = x[2];
    });
    setObsTarea(obs);
    setDatos((d) => ({ ...d, fecha: inicial.fecha, turno: inicial.turno ?? '', inspector: inicial.inspector ?? d.inspector, observaciones: inicial.observaciones ?? '' }));
  }, [inicial]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ultima, setUltima] = useState<{ fecha: string; med: Record<string, number | null> } | null>(null);

  const equipo = equipos.find((e) => e.id === equipoId) ?? null;
  // Al escoger el cañón: su tanque y, de la última inspección a fondo, la presión set (casi nunca cambia)
  useEffect(() => {
    setUltima(null);
    if (!equipo) return;
    // Al corregir, la primera vez se respetan los valores guardados
    if (primeraCarga.current) {
      primeraCarga.current = false;
      return;
    }
    setTanque(equipo.tanque_litros ?? null);
    let vivo = true;
    supabase
      .from('inspeccion_equipos')
      .select('mediciones, inspeccion_id')
      .eq('equipo_id', equipo.id)
      .order('inspeccion_id', { ascending: false })
      .limit(10)
      .then(async ({ data }) => {
        const f = (data ?? []).find((x) => x.mediciones && Object.values(x.mediciones as Record<string, unknown>).some((v) => v != null));
        if (!vivo || !f) return;
        const { data: i } = await supabase.from('inspecciones').select('fecha').eq('id', f.inspeccion_id).maybeSingle();
        const m = f.mediciones as Record<string, number | null>;
        if (!vivo) return;
        setUltima({ fecha: i?.fecha ?? '', med: m });
        setMed((x) => (x.presion_set || m.presion_set == null ? x : { ...x, presion_set: String(m.presion_set) }));
        if (!equipo.tanque_litros && m.tanque) setTanque(Number(m.tanque));
      });
    return () => {
      vivo = false;
    };
  }, [equipo]);

  const numeros = useMemo(() => Object.fromEntries(Object.entries(med).map(([k, v]) => [k, v.trim() && v !== 'N/A' ? leerMonto(v) : null])), [med]);
  const totalTareas = GRUPOS_DETALLE.reduce((s, g) => s + g.tareas.length, 0);
  const todoOk = () => setRes((r) => ({ ...Object.fromEntries(GRUPOS_DETALLE.flatMap((g) => g.tareas.map((t) => [t.id, 'OK' as Resultado]))), ...r }));
  const revision = revisarMediciones(numeros, tanque);
  // Lo que las mediciones muestran se marca solo como hallazgo
  const hallTotal = [...new Set([...hall, ...revision.hallazgos])];

  async function guardar() {
    if (!equipo) return setError('Escoja el cañón.');
    if (!Object.keys(res).length) return setError('Marque al menos una tarea.');
    setGuardando(true);
    setError(null);
    if (tanque && tanque !== equipo.tanque_litros) await supabase.from('equipos').update({ tanque_litros: tanque }).eq('id', equipo.id);
    const notas = Object.entries(obsTarea)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `${k}: ${v.trim()}`);
    const comun = {
      p_equipos: [{ equipo_id: equipo.id, resultados: res, hallazgos: hallTotal, mediciones: { ...numeros, tanque }, observacion: notas.join(' · ') }],
      p_fecha: datos.fecha,
      p_turno: datos.turno,
      p_zona: equipo.planta,
      p_inspector: datos.inspector,
      p_observaciones: datos.observaciones,
      p_firma: firma,
    };
    // Al corregir, si no se firma de nuevo se conserva la firma anterior
    const { data, error } = inicial
      ? await supabase.rpc('corregir_inspeccion', { p_id: inicial.id, ...comun })
      : await supabase.rpc('guardar_inspeccion', { p_tipo: 'DETALLE', p_cliente_id: cliente.id, ...comun });
    setGuardando(false);
    if (error) return setError(error.message);
    await onEquipos();
    onGuardada(Number(data));
  }

  const ref = tanque ? LLENADO_REF[tanque] : null;

  return (
    <div className="mt-4 space-y-4">
      {inicial && <AvisoCorreccion insp={inicial} onCancelar={onCancelar} />}
      <Advertencia />
      {/* Barra fija: cañón, tanque, fecha, turno, avance y guardar siempre a la mano */}
      <section className="sticky top-0 z-20 -mx-1 space-y-2 rounded-lg border-2 border-tinta bg-white/95 p-3 shadow-md backdrop-blur">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Campo etiqueta="Cañón *">
          <select value={equipoId ?? ''} onChange={(e) => setEquipoId(e.target.value ? Number(e.target.value) : null)} className={CONTROL}>
            <option value="">Escoja…</option>
            {equipos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.serial} · {e.modelo} · {ubicacionDe(e)}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Tamaño del tanque">
          <select value={tanque ?? ''} onChange={(e) => setTanque(e.target.value ? Number(e.target.value) : null)} className={CONTROL}>
            <option value="">—</option>
            {TANQUES.map((t) => (
              <option key={t} value={t}>
                {t} litros (llena en {LLENADO_REF[t]} s)
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Fecha">
          <input type="date" value={datos.fecha} onChange={(e) => setDatos({ ...datos, fecha: e.target.value })} className={CONTROL} />
        </Campo>
        <Campo etiqueta="Turno">
          <select value={datos.turno} onChange={(e) => setDatos({ ...datos, turno: e.target.value })} className={CONTROL}>
            <option value="">—</option>
            <option>Mañana</option>
            <option>Tarde</option>
            <option>Noche</option>
          </select>
        </Campo>
        </div>
        {equipo && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>
              <b>{Object.keys(res).length}</b> de {totalTareas} tareas
              {Object.values(res).filter((v) => v === 'FALLA').length > 0 && (
                <b className="text-alerta"> · {Object.values(res).filter((v) => v === 'FALLA').length} con falla</b>
              )}
            </span>
            <button onClick={todoOk} className="rounded border border-tinta bg-white px-3 py-1.5 font-semibold">
              ✓ Todo OK (lo que falta)
            </button>
            <button onClick={guardar} disabled={guardando} className="ml-auto rounded-lg bg-tinta px-4 py-2 font-bold text-white hover:bg-poli hover:text-tinta disabled:opacity-50">
              {guardando ? 'Guardando…' : inicial ? 'Guardar corrección' : 'Guardar inspección'}
            </button>
          </div>
        )}
        {error && <p className="rounded bg-alerta-suave px-3 py-1.5 text-sm font-medium text-alerta">{error}</p>}
      </section>

      {equipo && (
        <>
          <section className="rounded-lg border border-linea bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">Mediciones</h2>
              {ultima && (
                <button
                  onClick={() => {
                    setMed((x) => ({ ...x, ...Object.fromEntries(Object.entries(ultima.med).filter(([k, v]) => v != null && k !== 'tanque').map(([k, v]) => [k, String(v)])) }));
                    if (ultima.med.tanque) setTanque(Number(ultima.med.tanque));
                  }}
                  className="rounded border border-linea px-3 py-1.5 text-sm font-semibold hover:border-tinta"
                >
                  ↺ Usar los valores de la última inspección{ultima.fecha ? ` (${fechaCorta(ultima.fecha)})` : ''}
                </button>
              )}
            </div>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {MEDICIONES.map((x) => (
                <div key={x.id}>
                  <span className="mb-1 block text-xs font-semibold text-acero">
                    {x.texto} ({x.unidad})
                    {x.id === 'presion_set' && ' · regulador del cañón'}
                    {x.id === 'presion_real' && ' · lo que marca el manómetro'}
                    {x.id === 'llenado' && ' · use el cronómetro'}
                    {x.id === 'horas' && ' · si la planta lleva horómetro'}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(VALORES_MEDICION[x.id] ?? []).map((v) => (
                      <button
                        key={v}
                        onClick={() => setMed({ ...med, [x.id]: String(v) })}
                        className={`min-w-12 rounded border px-2.5 py-1.5 text-sm font-bold ${med[x.id] === String(v) ? 'border-tinta bg-tinta text-white' : 'border-linea bg-white hover:border-tinta'}`}
                      >
                        {v}
                      </button>
                    ))}
                    {x.id === 'horas' && (
                      <button
                        onClick={() => setMed({ ...med, horas: med.horas === 'N/A' ? '' : 'N/A' })}
                        className={`rounded border px-2.5 py-1.5 text-sm font-bold ${med.horas === 'N/A' ? 'border-tinta bg-tinta text-white' : 'border-linea bg-white hover:border-tinta'}`}
                      >
                        No aplica
                      </button>
                    )}
                    {x.id === 'llenado' && <Cronometro onListo={(seg) => setMed((m) => ({ ...m, llenado: String(seg) }))} />}
                    <input
                      value={med[x.id] === 'N/A' ? '' : med[x.id] ?? ''}
                      disabled={med[x.id] === 'N/A'}
                      inputMode="decimal"
                      placeholder={VALORES_MEDICION[x.id] ? 'Otro' : 'Escriba'}
                      aria-label={x.texto}
                      onChange={(e) => setMed({ ...med, [x.id]: e.target.value })}
                      className="w-24 rounded border border-linea px-2 py-1.5 text-right tabular-nums"
                    />
                  </div>
                </div>
              ))}
            </div>
            {ref && <p className="mt-2 text-xs text-acero">Referencia: tanque de {tanque} L llena en {ref} s a 100 PSI. Presión de trabajo 60–100 PSI.</p>}
            {revision.avisos.map((a) => (
              <p key={a} className="mt-2 rounded bg-alerta-suave px-3 py-1.5 text-sm font-semibold text-alerta">
                ⚠ {a}
              </p>
            ))}
          </section>

          {GRUPOS_DETALLE.map((g) => (
            <section key={g.titulo} className="rounded-xl border border-linea bg-white">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-linea bg-poli/15 px-4 py-2">
                <h2 className="font-bold">{g.titulo}</h2>
                <button
                  onClick={() => setRes((r) => ({ ...Object.fromEntries(g.tareas.map((t) => [t.id, 'OK'])), ...r }))}
                  className="rounded border border-tinta bg-white px-3 py-1 text-sm font-semibold"
                >
                  ✓ Todo OK
                </button>
              </header>
              <ul className="divide-y divide-linea">
                {g.tareas.map((t) => (
                  <li key={t.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto]">
                    <div>
                      <p className="font-semibold">
                        <span className="mr-1 font-mono text-xs text-acero">{t.id}</span> {t.tarea}
                      </p>
                      <p className="text-sm text-acero">
                        {t.criterio} <span className="whitespace-nowrap">· 🔧 {t.herramienta}</span>
                      </p>
                      {res[t.id] === 'FALLA' && (
                        <div className="mt-2 space-y-1.5">
                          {OBS_TAREAS[t.id] && <Frases opciones={OBS_TAREAS[t.id]} texto={obsTarea[t.id] ?? ''} onCambio={(v) => setObsTarea({ ...obsTarea, [t.id]: v })} />}
                          <input
                            value={obsTarea[t.id] ?? ''}
                            onChange={(e) => setObsTarea({ ...obsTarea, [t.id]: e.target.value })}
                            placeholder="¿Qué se encontró? (escoja arriba o escriba: valor medido, daño…)"
                            className={`${CONTROL} text-sm`}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1.5 self-start">
                      {(['OK', 'FALLA', 'NA'] as Resultado[]).map((v) => (
                        <button
                          key={v}
                          onClick={() => setRes((r) => ({ ...r, [t.id]: v }))}
                          className={`min-w-14 rounded border px-2 py-1.5 text-sm font-bold ${res[t.id] === v ? COLOR[v] : 'border-linea bg-white'}`}
                        >
                          {v === 'OK' ? '✓ OK' : v === 'FALLA' ? '✗ Falla' : 'N/A'}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section className="space-y-3 rounded-xl border-2 border-tinta bg-white p-4">
            <h2 className="font-bold">Resumen de hallazgos</h2>
            <div className="flex flex-wrap gap-1.5">
              {HALLAZGOS_DETALLE.map((h) => {
                const auto = revision.hallazgos.includes(h.id);
                const on = hallTotal.includes(h.id);
                return (
                  <button
                    key={h.id}
                    disabled={auto}
                    onClick={() => setHall((x) => (x.includes(h.id) ? x.filter((y) => y !== h.id) : [...x, h.id]))}
                    className={`rounded-full border px-3 py-1 text-sm font-semibold ${on ? 'border-alerta bg-alerta text-white' : 'border-linea bg-white'}`}
                    title={auto ? 'Marcado por las mediciones' : undefined}
                  >
                    {on ? '☑' : '☐'} {h.texto}
                    {auto ? ' (auto)' : ''}
                  </button>
                );
              })}
            </div>
            <Campo etiqueta="Observaciones / acción tomada">
              <textarea value={datos.observaciones} onChange={(e) => setDatos({ ...datos, observaciones: e.target.value })} rows={2} className={CONTROL} />
            </Campo>
            <Frases opciones={ACCIONES_TOMADAS} texto={datos.observaciones} onCambio={(t) => setDatos({ ...datos, observaciones: t })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-xs font-semibold text-acero">
                  Firma del técnico{inicial?.firma ? ' (ya está firmada; firme de nuevo solo si quiere cambiarla)' : ''}
                </span>
                <FirmaPad onCambio={setFirma} />
              </div>
              <Campo etiqueta="Técnico">
                <input value={datos.inspector} onChange={(e) => setDatos({ ...datos, inspector: e.target.value })} className={CONTROL} />
              </Campo>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={guardar} disabled={guardando} className={BOTON_PRINCIPAL}>
                {guardando ? 'Guardando…' : inicial ? 'Guardar corrección' : 'Guardar inspección'}
              </button>
              <span className="text-sm text-acero">
                {Object.keys(res).length} de {GRUPOS_DETALLE.reduce((s, g) => s + g.tareas.length, 0)} tareas marcadas
              </span>
              {error && <p className="flex-1 rounded bg-alerta-suave px-3 py-2 text-sm font-medium text-alerta">{error}</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ============================ RESULTADO / DETALLE ============================ */

interface Fila {
  equipo_id: number;
  resultados: Record<string, Resultado>;
  hallazgos: string[];
  mediciones: Record<string, number | null>;
  observacion: string | null;
}
interface Insp {
  id: number;
  tipo: 'RONDA' | 'DETALLE';
  cliente_id: number;
  fecha: string;
  turno: string | null;
  zona: string | null;
  inspector: string | null;
  observaciones: string | null;
  firma: string | null;
  creado?: string;
  corregida?: string | null;
  corregida_por?: string | null;
  correcciones?: number;
  inspeccion_equipos: Fila[];
}

function VistaInspeccion({ id, sesion, onVolver, onCorregir }: { id: number; sesion: Sesion; onVolver: () => void; onCorregir: (i: Insp) => void }) {
  const [insp, setInsp] = useState<Insp | null>(null);
  const [equipos, setEquipos] = useState<Record<number, Equipo>>({});
  const [cliente, setCliente] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('inspecciones').select('*, inspeccion_equipos(*)').eq('id', id).maybeSingle();
      if (error || !data) return setError(error?.message ?? 'No se encontró la inspección.');
      const i = data as Insp;
      setInsp(i);
      const [e, c] = await Promise.all([
        supabase.from('equipos').select('*').in('id', i.inspeccion_equipos.map((x) => x.equipo_id)),
        supabase.from('clientes').select('nombre').eq('id', i.cliente_id).maybeSingle(),
      ]);
      setEquipos(Object.fromEntries(((e.data ?? []) as Equipo[]).map((x) => [x.id, x])));
      setCliente(c.data?.nombre ?? '');
    })();
  }, [id]);

  if (error) return <p className="mt-6 rounded bg-alerta-suave px-4 py-3 text-alerta">{error}</p>;
  if (!insp) return <p className="py-12 text-center text-acero">Cargando…</p>;

  const filas = [...insp.inspeccion_equipos].sort((a, b) => ordenar(equipos[a.equipo_id] ?? ({} as Equipo), equipos[b.equipo_id] ?? ({} as Equipo)));
  const conFalla = filas.filter((f) => Object.values(f.resultados).includes('FALLA') || f.hallazgos.length);
  const datosPdf: DatosInspeccion = {
    id: insp.id,
    tipo: insp.tipo,
    cliente,
    fecha: insp.fecha,
    turno: insp.turno,
    zona: insp.zona,
    inspector: insp.inspector,
    observaciones: insp.observaciones,
    firma: insp.firma,
    equipos: filas.map((f) => {
      const e = equipos[f.equipo_id];
      return {
        serial: e?.serial ?? `#${f.equipo_id}`,
        modelo: e?.modelo ?? '',
        ubicacion: e ? ubicacionDe(e) : null,
        tanque: (f.mediciones?.tanque as number | null) ?? e?.tanque_litros ?? null,
        resultados: f.resultados,
        hallazgos: f.hallazgos,
        mediciones: f.mediciones ?? {},
        observacion: f.observacion,
      };
    }),
  };
  const nombreH = (h: string) => [...HALLAZGOS_RONDA, ...HALLAZGOS_DETALLE].find((x) => x.id === h)?.texto ?? h;
  const nombreP = (p: string) => PUNTOS_RONDA.find((x) => x.id === p)?.texto ?? GRUPOS_DETALLE.flatMap((g) => g.tareas).find((t) => t.id === p)?.tarea ?? p;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-tinta bg-white p-4">
        <div>
          <p className="text-lg font-bold">
            {insp.tipo === 'RONDA' ? 'Ronda diaria' : 'Inspección a fondo'} N.° {insp.id} · {cliente}
          </p>
          <p className="text-sm text-acero">
            {fechaCorta(insp.fecha)}
            {insp.turno ? ` · turno ${insp.turno.toLowerCase()}` : ''}
            {insp.inspector ? ` · ${insp.inspector}` : ''} · {filas.length} cañones · <b className={conFalla.length ? 'text-alerta' : ''}>{conFalla.length} con falla</b>
            {insp.corregida && (
              <span className="block text-xs">
                ✏ Corregida por {insp.corregida_por} el {new Date(insp.corregida).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {(insp.correcciones ?? 0) > 1 ? ` (${insp.correcciones} correcciones)` : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => (insp.tipo === 'RONDA' ? excelChecklistDiario(datosPdf) : excelHojaDeVida(datosPdf, insp.creado ? new Date(insp.creado).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : undefined))}
            className={BOTON_SECUNDARIO}
            title="El formato oficial de Poliway (POL-CL-DIARIO-CAN) lleno con esta inspección"
          >
            📊 Formato Poliway (Excel)
          </button>
          <button onClick={() => descargarInspeccionPdf(datosPdf)} className={BOTON_ACENTO}>
            📄 PDF para el cliente
          </button>
          {sesion.puedeEditar && (
            <button onClick={() => onCorregir(insp)} className={BOTON_SECUNDARIO}>
              ✏ Corregir
            </button>
          )}
          <button onClick={onVolver} className={BOTON_SECUNDARIO}>
            ← Volver
          </button>
        </div>
      </div>

      {conFalla.length > 0 ? (
        <section className="rounded-lg border border-linea bg-white">
          <h2 className="border-b border-linea px-4 py-2 font-bold">Cañones con falla</h2>
          <ul className="divide-y divide-linea text-sm">
            {conFalla.map((f) => {
              const e = equipos[f.equipo_id];
              const fallas = Object.entries(f.resultados)
                .filter(([, v]) => v === 'FALLA')
                .map(([k]) => nombreP(k));
              return (
                <li key={f.equipo_id} className="px-4 py-2">
                  <b>{e?.serial}</b> <span className="text-acero">· {e?.modelo} · {e ? ubicacionDe(e) : ''}</span>
                  <p>
                    {[...fallas.map((x) => `✗ ${x}`), ...f.hallazgos.map((h) => `☑ ${nombreH(h)}`)].join(' · ')}
                    {f.observacion ? <span className="text-acero"> — {f.observacion}</span> : null}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="rounded-lg border border-linea bg-white p-4 text-center font-semibold text-oro-oscuro">✓ Todos los cañones revisados sin fallas.</p>
      )}

      {sesion.puedeEditar && conFalla.length > 0 && <Repuestos insp={insp} filas={conFalla} equipos={equipos} sesion={sesion} />}
    </div>
  );
}

/* ---------------- Repuestos: de la falla al inventario ---------------- */

function Repuestos({ insp, filas, equipos, sesion }: { insp: Insp; filas: Fila[]; equipos: Record<number, Equipo>; sesion: Sesion }) {
  const router = useRouter();
  const [catalogo, setCatalogo] = useState<ProductoBasico[]>([]);
  const [stock, setStock] = useState<Record<string, { total: number; bodegas: { id: number; nombre: string; cantidad: number }[] }>>({});
  const [hechos, setHechos] = useState<Set<string>>(new Set());
  const [cant, setCant] = useState<Record<string, string>>({});
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const doc = `Inspección #${insp.id}`;

  const cargar = useCallback(async () => {
    const [cat, inv, mov] = await Promise.all([
      cargarCatalogo(true),
      supabase.from('v_inventario').select('producto_id, ubicacion_id, ubicacion, cantidad'),
      supabase.from('v_movimientos').select('sku, equipo_id').eq('documento_ref', doc),
    ]);
    setCatalogo(cat);
    const s: typeof stock = {};
    (inv.data ?? []).forEach((f) => {
      if (!f.ubicacion_id) return;
      const x = (s[f.producto_id] ??= { total: 0, bodegas: [] });
      x.total += Number(f.cantidad ?? 0);
      x.bodegas.push({ id: f.ubicacion_id, nombre: f.ubicacion, cantidad: Number(f.cantidad ?? 0) });
    });
    Object.values(s).forEach((x) => x.bodegas.sort((a, b) => b.cantidad - a.cantidad));
    setStock(s);
    setHechos(new Set((mov.data ?? []).map((m) => `${m.equipo_id}|${m.sku}`)));
  }, [doc]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const porSku = useMemo(() => new Map(catalogo.map((p) => [p.sku.toUpperCase(), p])), [catalogo]);
  const lineas = filas.flatMap((f) => {
    const e = equipos[f.equipo_id];
    if (!e) return [];
    return repuestosSugeridos(e.modelo, f.hallazgos, f.resultados)
      .map((s) => ({ ...s, equipo: e, producto: porSku.get(s.sku.toUpperCase()) }))
      .filter((x) => x.producto);
  });
  const clave = (l: (typeof lineas)[number]) => `${l.equipo.id}|${l.sku}`;
  const faltantes = lineas.filter((l) => !hechos.has(clave(l)) && (stock[l.producto!.id]?.total ?? 0) < (leerMonto(cant[clave(l)] ?? '1') || 1));

  async function sacar(l: (typeof lineas)[number]) {
    const k = clave(l);
    const c = leerMonto(cant[k] ?? '1');
    const bodega = stock[l.producto!.id]?.bodegas.find((b) => b.cantidad >= c);
    if (!Number.isFinite(c) || c <= 0) return setMensaje({ ok: false, texto: 'Revise la cantidad.' });
    if (!bodega) return setMensaje({ ok: false, texto: `No hay ${numero.format(c)} de ${l.producto!.nombre} en una sola bodega.` });
    setTrabajando(k);
    setMensaje(null);
    const { error } = await supabase.rpc('registrar_movimiento', {
      p_producto_id: l.producto!.id,
      p_ubicacion_id: bodega.id,
      p_tipo: 'SALIDA',
      p_cantidad: c,
      p_documento_ref: doc,
      p_nota: `${l.motivo} · cañón ${l.equipo.serial}`,
      p_destino: 'CLIENTE',
      p_cliente_id: insp.cliente_id,
      p_equipo_id: l.equipo.id,
    });
    setTrabajando(null);
    if (error) return setMensaje({ ok: false, texto: error.message });
    setMensaje({ ok: true, texto: `Salió ${numero.format(c)} ${UNIDADES[l.producto!.unidad_medida] ?? ''} de ${l.producto!.nombre} de ${bodega.nombre}, cargado al cañón ${l.equipo.serial}.` });
    await cargar();
  }

  if (!lineas.length)
    return (
      <p className="rounded-lg border border-linea bg-white p-4 text-sm text-acero">
        Los hallazgos de esta inspección no tienen un repuesto sugerido en el inventario. Si cambió algo, regístrelo en Inventario como salida a este cliente y cañón.
      </p>
    );

  return (
    <section className="rounded-xl border-2 border-poli bg-white">
      <header className="border-b border-linea px-4 py-3">
        <h2 className="font-bold">Repuestos para los cañones con falla</h2>
        <p className="text-sm text-acero">
          Sugeridos según el modelo y el hallazgo (por confirmar con ingeniería de Poliway). Al sacarlos, quedan en la hoja de vida del cañón y en los movimientos como «{doc}».
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b-2 border-tinta text-left text-xs text-acero">
              <th className="px-3 py-2">Cañón</th>
              <th className="px-3 py-2">Motivo</th>
              <th className="px-3 py-2">Repuesto</th>
              <th className="px-3 py-2 text-right">Existencia</th>
              <th className="w-20 px-3 py-2 text-right">Cantidad</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => {
              const k = clave(l);
              const hay = stock[l.producto!.id]?.total ?? 0;
              const hecho = hechos.has(k);
              return (
                <tr key={k} className="border-b border-linea">
                  <td className="px-3 py-2 font-semibold">{l.equipo.serial}</td>
                  <td className="px-3 py-2">{l.motivo}</td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs">{l.producto!.sku}</span> {l.producto!.nombre}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${hay <= 0 ? 'font-bold text-alerta' : ''}`}>{hay <= 0 ? 'Agotado' : numero.format(hay)}</td>
                  <td className="px-3 py-2">
                    <input
                      value={cant[k] ?? '1'}
                      disabled={hecho}
                      onChange={(e) => setCant({ ...cant, [k]: e.target.value })}
                      inputMode="decimal"
                      className="w-full rounded border border-linea px-2 py-1 text-right tabular-nums"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {hecho ? (
                      <span className="font-semibold text-oro-oscuro">✓ Sacado</span>
                    ) : (
                      <button onClick={() => sacar(l)} disabled={trabajando != null || hay <= 0} className="rounded bg-tinta px-3 py-1.5 font-semibold text-white disabled:opacity-40">
                        {trabajando === k ? 'Sacando…' : 'Sacar del inventario'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        {sesion.esAdmin && faltantes.length > 0 && (
          <button
            onClick={() => {
              const suma = new Map<string, { codigo: string; descripcion: string; cantidad: number; valor: null }>();
              faltantes.forEach((l) => {
                const c = leerMonto(cant[clave(l)] ?? '1') || 1;
                const x = suma.get(l.sku) ?? { codigo: l.producto!.sku, descripcion: l.producto!.nombre, cantidad: 0, valor: null };
                x.cantidad += c;
                suma.set(l.sku, x);
              });
              dejarPedidoPendiente([...suma.values()]);
              router.push('/admin');
            }}
            className={BOTON_ACENTO}
          >
            Pedir a Brasil lo que falta ({faltantes.length}) →
          </button>
        )}
        {mensaje && (
          <p className={`flex-1 rounded px-3 py-2 text-sm font-medium ${mensaje.ok ? 'bg-poli/20' : 'bg-alerta-suave text-alerta'}`} role="status">
            {mensaje.texto}
          </p>
        )}
      </div>
    </section>
  );
}

/* ================================ HISTORIAL ================================ */

function Historial({ cliente, equipos, sesion, onVer }: { cliente: Cliente; equipos: Equipo[]; sesion: Sesion; onVer: (id: number) => void }) {
  const [lista, setLista] = useState<(Insp & { creado: string })[]>([]);
  const [cargando, setCargando] = useState(true);
  const [borrar, setBorrar] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('inspecciones').select('*, inspeccion_equipos(*)').eq('cliente_id', cliente.id).order('fecha', { ascending: false }).order('id', { ascending: false }).limit(60);
    setLista((data ?? []) as (Insp & { creado: string })[]);
    setCargando(false);
  }, [cliente.id]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const falla = (f: Fila) => Object.values(f.resultados).includes('FALLA') || f.hallazgos.length > 0;
  // Cañones que fallan en varias de las últimas rondas: candidatos a mantenimiento mayor
  const repetidos = useMemo(() => {
    const ultimas = lista.filter((i) => i.tipo === 'RONDA').slice(0, 5);
    const n = new Map<number, number>();
    ultimas.forEach((i) => i.inspeccion_equipos.filter(falla).forEach((f) => n.set(f.equipo_id, (n.get(f.equipo_id) ?? 0) + 1)));
    return [...n.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([id, c]) => ({ equipo: equipos.find((e) => e.id === id), veces: c, de: ultimas.length }));
  }, [lista, equipos]);
  const sinRevisar = useMemo(() => {
    const vistos = new Set(lista.slice(0, 30).flatMap((i) => i.inspeccion_equipos.map((f) => f.equipo_id)));
    return equipos.filter((e) => !vistos.has(e.id));
  }, [lista, equipos]);
  const ultimaRonda = lista.find((i) => i.tipo === 'RONDA');
  const diasRonda = ultimaRonda ? Math.round((new Date(`${hoyISO()}T12:00:00`).getTime() - new Date(`${ultimaRonda.fecha}T12:00:00`).getTime()) / 86400e3) : null;

  async function quitar(id: number) {
    await supabase.from('inspecciones').delete().eq('id', id);
    setBorrar(null);
    cargar();
  }

  if (cargando) return <p className="py-12 text-center text-acero">Cargando…</p>;

  return (
    <div className="mt-4 space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato titulo="Última ronda" valor={diasRonda == null ? 'Ninguna' : diasRonda === 0 ? 'Hoy' : `Hace ${diasRonda} días`} alerta={diasRonda == null || diasRonda > 1} />
        <Dato titulo="Inspecciones" valor={String(lista.length)} />
        <Dato titulo="Fallas repetidas" valor={String(repetidos.length)} alerta={repetidos.length > 0} />
        <Dato titulo="Sin inspeccionar" valor={String(sinRevisar.length)} alerta={sinRevisar.length > 0 && lista.length > 0} />
      </dl>

      {repetidos.length > 0 && (
        <section className="rounded-lg border-2 border-alerta bg-white p-4">
          <h2 className="font-bold text-alerta">Cañones con falla en varias rondas</h2>
          <p className="text-sm text-acero">Candidatos a inspección a fondo o mantenimiento mayor.</p>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {repetidos.map((r) => (
              <li key={r.equipo?.id} className="rounded-full bg-alerta-suave px-3 py-1 font-semibold text-alerta">
                {r.equipo?.serial} · {r.equipo ? ubicacionDe(r.equipo) : ''}: {r.veces} de {r.de}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!lista.length ? (
        <p className="rounded-lg border border-linea bg-white p-6 text-center text-acero">Todavía no hay inspecciones de esta planta.</p>
      ) : (
        <ul className="divide-y divide-linea rounded-lg border border-linea bg-white">
          {lista.map((i) => {
            const n = i.inspeccion_equipos.filter(falla).length;
            return (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <button onClick={() => onVer(i.id)} className="min-w-0 flex-1 text-left">
                  <span className="block font-semibold">
                    {i.tipo === 'RONDA' ? 'Ronda diaria' : 'Inspección a fondo'} N.° {i.id} · {fechaCorta(i.fecha)}
                    {i.turno ? ` · ${i.turno}` : ''}
                  </span>
                  <span className="text-sm text-acero">
                    {i.inspector ?? 'Sin inspector'} · {i.inspeccion_equipos.length} cañones ·{' '}
                    <b className={n ? 'text-alerta' : 'text-oro-oscuro'}>{n ? `${n} con falla` : 'sin fallas'}</b>
                    {i.corregida ? <span className="text-acero"> · ✏ corregida</span> : null}
                  </span>
                </button>
                <span className="flex gap-2">
                  <button onClick={() => onVer(i.id)} className="rounded border border-linea px-3 py-1.5 text-sm font-semibold hover:border-tinta">
                    Ver
                  </button>
                  {sesion.esAdmin &&
                    (borrar === i.id ? (
                      <button onClick={() => quitar(i.id)} className="rounded bg-alerta px-3 py-1.5 text-sm font-semibold text-white">
                        Confirmar
                      </button>
                    ) : (
                      <button onClick={() => setBorrar(i.id)} className="rounded px-3 py-1.5 text-sm font-semibold text-alerta hover:bg-alerta-suave">
                        Borrar
                      </button>
                    ))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ============================= CARGAR CAÑONES ============================= */

function Cargar({ clientes, clienteId, onListo }: { clientes: Cliente[]; clienteId: number | null; onListo: (id: number) => Promise<void> }) {
  const [leidos, setLeidos] = useState<CanonLeido[]>([]);
  const [destino, setDestino] = useState<string>(clienteId ? String(clienteId) : '');
  const [nuevo, setNuevo] = useState('');
  const [existentes, setExistentes] = useState<Set<string>>(new Set());
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    if (!destino || destino === 'nuevo') return setExistentes(new Set());
    supabase
      .from('equipos')
      .select('serial')
      .eq('cliente_id', Number(destino))
      .then(({ data }) => setExistentes(new Set((data ?? []).map((e) => String(e.serial ?? '').toUpperCase()))));
  }, [destino]);

  async function leer(f: File) {
    setLeyendo(true);
    setMensaje(null);
    try {
      const l = await leerCanonesExcel(f);
      if (!l.length) setMensaje({ ok: false, texto: 'No encontré cañones. El Excel debe tener filas «UBICACION: …» y debajo los cañones con su tipo (DESTROY, XHV).' });
      setLeidos(l);
    } catch (e) {
      setMensaje({ ok: false, texto: (e as Error).message });
    }
    setLeyendo(false);
  }

  const nuevos = leidos.filter((c) => c.codigo.trim() && !existentes.has(c.codigo.trim().toUpperCase()));

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    let id = destino && destino !== 'nuevo' ? Number(destino) : null;
    if (!id) {
      if (!nuevo.trim()) {
        setGuardando(false);
        return setMensaje({ ok: false, texto: 'Escriba el nombre de la planta o cliente.' });
      }
      const { data, error } = await supabase.from('clientes').insert({ nombre: nuevo.trim() }).select('id').single();
      if (error) {
        setGuardando(false);
        return setMensaje({ ok: false, texto: error.message });
      }
      id = data.id as number;
    }
    const filas = nuevos.map((c) => ({ cliente_id: id, modelo: c.modelo, serial: c.codigo.trim().toUpperCase(), planta: c.ubicacion, orden: leidos.indexOf(c) + 1 }));
    const { error } = filas.length ? await supabase.from('equipos').insert(filas) : { error: null };
    setGuardando(false);
    if (error) return setMensaje({ ok: false, texto: error.message });
    setMensaje({ ok: true, texto: `Listo: ${filas.length} cañones cargados${leidos.length - filas.length ? `; ${leidos.length - filas.length} ya existían` : ''}.` });
    setLeidos([]);
    await onListo(id!);
  }

  const porUbicacion = useMemo(() => {
    const m = new Map<string, number>();
    leidos.forEach((c) => m.set(c.ubicacion, (m.get(c.ubicacion) ?? 0) + 1));
    return [...m.entries()];
  }, [leidos]);

  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-xl border-2 border-dashed border-linea bg-white p-6 text-center">
        <p className="text-lg font-bold">Cargue el check-list de Excel de la planta</p>
        <p className="mt-1 text-sm text-acero">La app toma de cada ubicación los códigos de los cañones y su tipo (Destroyer o XHV). No hay que digitarlos.</p>
        <label className={`${BOTON_PRINCIPAL} mt-4 inline-block cursor-pointer`}>
          {leyendo ? 'Leyendo…' : 'Escoger el Excel'}
          <input
            type="file"
            accept=".xlsx,.xlsm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) leer(f);
              e.target.value = '';
            }}
          />
        </label>
      </section>

      {leidos.length > 0 && (
        <section className="space-y-3 rounded-xl border-2 border-tinta bg-white p-4">
          <p className="font-bold">
            {leidos.length} cañones en {porUbicacion.length} ubicaciones · {leidos.filter((c) => c.modelo === 'Destroyer').length} Destroyer,{' '}
            {leidos.filter((c) => c.modelo === 'XHV').length} XHV
          </p>
          <p className="text-sm text-acero">{porUbicacion.map(([u, n]) => `${u}: ${n}`).join(' · ')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="¿De qué planta o cliente son?">
              <select value={destino} onChange={(e) => setDestino(e.target.value)} className={CONTROL}>
                <option value="">Escoja…</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
                <option value="nuevo">+ Planta nueva</option>
              </select>
            </Campo>
            {destino === 'nuevo' && (
              <Campo etiqueta="Nombre de la planta nueva">
                <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} className={CONTROL} />
              </Campo>
            )}
          </div>
          {leidos.some((c) => c.aviso) && (
            <div className="rounded bg-poli/20 px-3 py-2 text-sm">
              <p className="font-semibold">Revise estos códigos (puede corregirlos en la tabla):</p>
              <ul className="list-inside list-disc">
                {leidos
                  .filter((c) => c.aviso)
                  .map((c, i) => (
                    <li key={i}>{c.aviso}</li>
                  ))}
              </ul>
            </div>
          )}
          <div className="max-h-[28rem] overflow-y-auto rounded border border-linea">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b-2 border-tinta text-left text-xs text-acero">
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Ubicación</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {leidos.map((c, i) => {
                  const existe = existentes.has(c.codigo.trim().toUpperCase());
                  return (
                    <tr key={i} className={`border-b border-linea ${c.aviso ? 'bg-poli/10' : ''}`}>
                      <td className="px-3 py-1">
                        <input
                          value={c.codigo}
                          onChange={(e) => setLeidos((x) => x.map((y, j) => (j === i ? { ...y, codigo: e.target.value } : y)))}
                          className="w-full rounded border border-linea px-2 py-1 font-mono"
                        />
                      </td>
                      <td className="px-3 py-1">{c.modelo}</td>
                      <td className="px-3 py-1">{c.ubicacion}</td>
                      <td className="px-3 py-1 text-xs">{existe ? <span className="text-acero">Ya existe</span> : <span className="font-semibold text-oro-oscuro">Nuevo</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={guardar} disabled={guardando || !destino || !nuevos.length} className={BOTON_PRINCIPAL}>
              {guardando ? 'Cargando…' : `Cargar ${nuevos.length} cañones`}
            </button>
            {mensaje && (
              <p className={`flex-1 rounded px-3 py-2 text-sm font-medium ${mensaje.ok ? 'bg-poli/20' : 'bg-alerta-suave text-alerta'}`}>{mensaje.texto}</p>
            )}
          </div>
        </section>
      )}
      {!leidos.length && mensaje && (
        <p className={`rounded px-3 py-2 text-sm font-medium ${mensaje.ok ? 'bg-poli/20' : 'bg-alerta-suave text-alerta'}`}>{mensaje.texto}</p>
      )}
    </div>
  );
}

/* ================================ AYUDAS ================================ */

// Cronómetro del tiempo de llenado: se inicia al disparar y se para cuando el manómetro se estabiliza
function Cronometro({ onListo }: { onListo: (segundos: number) => void }) {
  const [inicio, setInicio] = useState<number | null>(null);
  const [ahora, setAhora] = useState(0);
  useEffect(() => {
    if (inicio == null) return;
    const t = setInterval(() => setAhora(Date.now()), 100);
    return () => clearInterval(t);
  }, [inicio]);
  const seg = inicio == null ? 0 : (ahora - inicio) / 1000;
  return inicio == null ? (
    <button
      onClick={() => {
        setInicio(Date.now());
        setAhora(Date.now());
      }}
      className="rounded border border-tinta bg-poli px-3 py-1.5 text-sm font-bold"
    >
      ▶ Iniciar cronómetro
    </button>
  ) : (
    <button
      onClick={() => {
        onListo(Math.round(seg * 10) / 10);
        setInicio(null);
      }}
      className="rounded border border-alerta bg-alerta px-3 py-1.5 text-sm font-bold text-white tabular-nums"
    >
      ■ Parar · {seg.toFixed(1)} s
    </button>
  );
}

// Advertencia de seguridad del formato, en una sola línea que se abre al tocarla
function Advertencia() {
  return (
    <details className="rounded-lg border border-alerta bg-alerta-suave px-4 py-2 text-sm text-alerta">
      <summary className="cursor-pointer font-semibold">⚠ Seguridad: LOTOTO antes de intervenir · máx. 100 PSI / 7 bar · EPP obligatorio</summary>
      <p className="mt-1 font-medium">{ADVERTENCIA}</p>
    </details>
  );
}

// Botones de frases para escoger con un toque (se agregan o se quitan del texto)
function Frases({ opciones, texto, onCambio }: { opciones: string[]; texto: string; onCambio: (t: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map((o) => {
        const on = tieneFrase(texto, o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onCambio(alternarFrase(texto, o))}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${on ? 'border-tinta bg-tinta text-white' : 'border-linea bg-white hover:border-tinta'}`}
          >
            {on ? '✓ ' : '+ '}
            {o}
          </button>
        );
      })}
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-acero">{etiqueta}</span>
      {children}
    </label>
  );
}

function Dato({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className={`rounded-lg border bg-white p-3 ${alerta ? 'border-alerta' : 'border-linea'}`}>
      <dt className="text-xs text-acero">{titulo}</dt>
      <dd className={`text-xl font-bold tabular-nums ${alerta ? 'text-alerta' : ''}`}>{valor}</dd>
    </div>
  );
}
