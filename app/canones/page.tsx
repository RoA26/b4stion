'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { CANONES, GRUPOS, type Grupo, type PiezaDespiece } from '@/lib/canones';
import { cargarCatalogo, type ProductoBasico } from '@/lib/catalogo';
import { leerMonto, numero, pesos, UNIDADES } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';
import { decirAlAsistente, useOrdenVoz } from '@/lib/voz/bus';
import { ARMADO, NOTA_ARMADO, NOTA_GENERAL, PIEZAS } from '@/lib/voz/conocimiento';

/* Despiece interactivo de los cañones Blaster:
   - los números del dibujo (①, ②…) y las piezas se pueden tocar
   - filtro por tipo de componente (resortes, sellos…)
   - ficha de cada repuesto: función, código, existencia, costo, en qué cañones va
   - movimiento rápido (entrada o salida) ahí mismo, enlazado al inventario */

type Clave = keyof typeof CANONES;
interface Stock {
  total: number;
  minimo: number;
  unidad: string;
  porUbicacion: { id: number; nombre: string; cantidad: number }[];
}
interface Opcion {
  id: number;
  nombre: string;
}
interface Equipo {
  id: number;
  cliente_id: number;
  modelo: string;
  serial: string | null;
}

const CLAVES = Object.keys(CANONES) as Clave[];
const und = (u: string) => UNIDADES[u] ?? u.toLowerCase();

function piezasDe(c: Clave): PiezaDespiece[] {
  const mapa = new Map<number, PiezaDespiece>();
  CANONES[c].zonas.forEach((z) => z.piezas.forEach((p) => mapa.set(p.n, p)));
  return [...mapa.values()].sort((a, b) => a.n - b.n);
}
function usosDe(sku: string) {
  return CLAVES.flatMap((c) => piezasDe(c).filter((p) => p.sku === sku).map((p) => ({ c, n: p.n })));
}

export default function DespieceCanones() {
  const sesion = useSesion();
  const [canon, setCanon] = useState<Clave>('destroyer');
  const [grupo, setGrupo] = useState<Grupo | ''>('');
  const [elegida, setElegida] = useState<number | null>(null); // número de la pieza en el despiece
  const [encima, setEncima] = useState<number | null>(null);
  // Modo armado: recorre las piezas en el orden en que se arma el cañón
  const [armado, setArmado] = useState<{ idx: number; pausado: boolean; fin?: boolean } | null>(null);
  const [vozArmado, setVozArmado] = useState(true);
  const turnoArmado = useRef(0);

  const [stock, setStock] = useState<Record<string, Stock>>({});
  const [catalogo, setCatalogo] = useState<ProductoBasico[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Opcion[]>([]);
  const [funcionarios, setFuncionarios] = useState<Opcion[]>([]);
  const [areas, setAreas] = useState<Opcion[]>([]);
  const [clientes, setClientes] = useState<Opcion[]>([]);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarStock = useCallback(async () => {
    const [inv, cat] = await Promise.all([
      supabase.from('v_inventario').select('sku, cantidad, stock_minimo, unidad_medida, ubicacion_id, ubicacion'),
      cargarCatalogo(true),
    ]);
    if (inv.error) setError(`No se pudo leer el inventario: ${inv.error.message}`);
    const mapa: Record<string, Stock> = {};
    (inv.data ?? []).forEach((f) => {
      const s = (mapa[f.sku] ??= { total: 0, minimo: Number(f.stock_minimo ?? 0), unidad: f.unidad_medida, porUbicacion: [] });
      const c = Number(f.cantidad ?? 0);
      s.total += c;
      if (f.ubicacion_id != null) s.porUbicacion.push({ id: Number(f.ubicacion_id), nombre: f.ubicacion ?? '', cantidad: c });
    });
    setStock(mapa);
    setCatalogo(cat);
    setCargado(true);
  }, []);

  useEffect(() => {
    if (!sesion.listo) return;
    cargarStock();
    (async () => {
      const [u, f, a, c, e] = await Promise.all([
        supabase.from('ubicaciones').select('id, nombre').eq('activo', true).order('nombre'),
        supabase.from('funcionarios').select('id, nombre').eq('activo', true).order('nombre'),
        supabase.from('areas').select('id, nombre').eq('activo', true).order('nombre'),
        supabase.from('clientes').select('id, nombre').eq('activo', true).order('nombre'),
        supabase.from('equipos').select('id, cliente_id, modelo, serial').eq('activo', true).order('modelo'),
      ]);
      setUbicaciones((u.data ?? []) as Opcion[]);
      setFuncionarios((f.data ?? []) as Opcion[]);
      setAreas((a.data ?? []) as Opcion[]);
      setClientes((c.data ?? []) as Opcion[]);
      setEquipos((e.data ?? []) as Equipo[]);
    })();
  }, [sesion.listo, cargarStock]);

  const datos = CANONES[canon];
  const piezas = useMemo(() => piezasDe(canon), [canon]);
  const gruposDelCanon = useMemo(() => [...new Set(piezas.map((p) => p.grupo))], [piezas]);
  const pieza = piezas.find((p) => p.n === elegida) ?? null;
  const pasos = ARMADO[canon];
  const pasoActual = armado ? pasos[armado.idx] : null;
  const armadas = useMemo(() => new Set(armado ? pasos.slice(0, armado.idx).map((p) => p.n) : []), [armado, pasos]);
  const resaltada = pasoActual ? pasoActual.n : encima ?? elegida;
  const enGrupo = (n: number) => !!grupo && piezas.find((p) => p.n === n)?.grupo === grupo;

  const resumen = useMemo(() => {
    const skus = [...new Set(piezas.map((p) => p.sku))];
    return { total: piezas.length, sinExistencia: skus.filter((s) => (stock[s]?.total ?? 0) <= 0).length };
  }, [piezas, stock]);

  function cambiarCanon(c: Clave, n: number | null = null) {
    setArmado(null);
    setCanon(c);
    setGrupo('');
    setEncima(null);
    setElegida(n);
  }

  // Voz del modo armado: la preferencia de silencio del asistente también aplica aquí
  useEffect(() => {
    try {
      setVozArmado(localStorage.getItem('poliway.blaster.silencio') !== 'true');
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  function iniciarArmado() {
    window.speechSynthesis?.cancel();
    setElegida(null);
    setGrupo('');
    setEncima(null);
    setArmado({ idx: 0, pausado: false });
  }
  function irAPaso(idx: number) {
    setArmado((a) => (a ? { idx: Math.min(Math.max(idx, 0), pasos.length - 1), pausado: a.pausado && !a.fin, fin: false } : a));
  }

  // Narra el paso actual y, al terminar, pasa al siguiente
  useEffect(() => {
    if (!armado || armado.pausado) return;
    const turno = ++turnoArmado.current;
    const paso = pasos[armado.idx];
    if (!paso) return;
    const p = piezasDe(canon).find((x) => x.n === paso.n);
    // en el Destroyer (dibujo alto) se lleva la pieza a la vista
    document.querySelector(`[data-globo="${paso.n}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    let espera: ReturnType<typeof setTimeout> | undefined;
    const siguiente = () => {
      if (turno !== turnoArmado.current) return;
      setArmado((a) => (!a ? a : a.idx + 1 < pasos.length ? { idx: a.idx + 1, pausado: false } : { ...a, pausado: true, fin: true }));
    };
    const texto = `Paso ${armado.idx + 1}. ${p?.nombre ?? ''}. ${paso.texto ?? ''}`;
    if (vozArmado && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const s = window.speechSynthesis;
      s.cancel();
      const u = new SpeechSynthesisUtterance(texto.replace(/["«»]/g, ''));
      u.lang = 'es-CO';
      const voces = s.getVoices();
      u.voice = voces.find((v) => v.lang === 'es-CO') ?? voces.find((v) => v.lang.startsWith('es-')) ?? null;
      u.rate = 1.0;
      u.onend = () => (espera = setTimeout(siguiente, 700));
      u.onerror = () => (espera = setTimeout(siguiente, 3000));
      s.speak(u);
    } else espera = setTimeout(siguiente, 3500);
    return () => {
      // se invalida el paso que estaba sonando (es un contador, no un elemento de la página)
      // eslint-disable-next-line react-hooks/exhaustive-deps
      turnoArmado.current++;
      if (espera) clearTimeout(espera);
      window.speechSynthesis?.cancel();
    };
  }, [armado, canon, pasos, vozArmado]);

  // Desde el asistente de voz: "abre cañones XHV", mostrar una pieza mientras la explica, o "¿cómo se arma el Capol?"
  useOrdenVoz(['canon'], true, (_t, d) => {
    const { modelo, sku, n, armar } = d as { modelo?: Clave; sku?: string; n?: number; armar?: boolean };
    const c = modelo && modelo in CANONES ? modelo : sku ? usosDe(sku)[0]?.c : undefined;
    if (!c) return;
    if (armar) {
      setCanon(c);
      setElegida(null);
      setGrupo('');
      setArmado({ idx: 0, pausado: false });
      return;
    }
    const num = n ?? (sku ? piezasDe(c).find((p) => p.sku === sku)?.n : undefined) ?? null;
    cambiarCanon(c, num);
    if (num != null) setTimeout(() => document.getElementById('ficha-pieza')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  });

  if (!sesion.listo) return <p className="py-24 text-center text-acero">Cargando…</p>;

  const anchoMax = canon === 'destroyer' ? 360 : canon === 'xhv' ? 520 : 900;

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-tinta pb-4">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-blaster.png" alt="Blaster by Poliway" className="h-9 w-auto" />
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">Despiece de cañones</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/escanear" className="rounded bg-poli px-3 py-1.5 font-semibold text-tinta hover:bg-tinta hover:text-white">
            Inventario
          </Link>
          <Link href="/" className="rounded border border-tinta px-3 py-1.5 font-medium hover:bg-tinta hover:text-white">
            Inicio
          </Link>
        </div>
      </header>

      {/* Cañón */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-linea bg-white p-1" role="tablist" aria-label="Modelo de cañón">
          {CLAVES.map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={canon === c}
              onClick={() => cambiarCanon(c)}
              className={`rounded-md px-4 py-2 font-bold ${canon === c ? 'bg-tinta text-white' : 'text-acero hover:text-tinta'}`}
            >
              {CANONES[c].nombre}
            </button>
          ))}
        </div>
        {cargado && (
          <p className="text-sm text-acero">
            {resumen.total} piezas en el despiece,{' '}
            <span className={resumen.sinExistencia ? 'font-semibold text-alerta' : 'font-semibold text-oro-oscuro'}>{resumen.sinExistencia} sin existencia</span>
          </p>
        )}
      </div>

      {/* Tipo de componente */}
      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Filtrar por tipo de componente">
        <button
          onClick={() => setGrupo('')}
          aria-pressed={!grupo}
          className={`rounded-full border px-3 py-1 text-sm font-semibold ${!grupo ? 'border-tinta bg-tinta text-white' : 'border-linea bg-white hover:border-tinta'}`}
        >
          Todas
        </button>
        {gruposDelCanon.map((g) => (
          <button
            key={g}
            onClick={() => setGrupo(grupo === g ? '' : g)}
            aria-pressed={grupo === g}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${grupo === g ? 'border-poli bg-poli text-tinta' : 'border-linea bg-white hover:border-tinta'}`}
          >
            {GRUPOS[g]} ({piezas.filter((p) => p.grupo === g).length})
          </button>
        ))}
      </div>

      <div className="mt-3">
        <button
          onClick={() => (armado ? setArmado(null) : iniciarArmado())}
          className={`rounded-lg px-4 py-2 font-semibold ${armado ? 'border border-tinta bg-white hover:bg-tinta hover:text-white' : 'bg-poli text-tinta hover:bg-tinta hover:text-white'}`}
        >
          {armado ? '■ Terminar el modo armado' : `▶ Ver cómo se arma el ${datos.nombre}`}
        </button>
      </div>

      {error && <p className="mt-4 rounded border border-alerta bg-alerta-suave px-4 py-3 text-sm font-medium text-alerta">{error}</p>}

      <div className="mt-4 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* -------------------------- Dibujo -------------------------- */}
        <section className="rounded-lg border border-linea bg-white p-3 sm:p-5">
          <p className="mb-2 text-sm text-acero">Toque un número o una pieza del dibujo para ver su información y su existencia.</p>
          <div
            className="relative mx-auto"
            style={{ maxWidth: anchoMax, aspectRatio: `${datos.ancho} / ${datos.alto}` }}
            onMouseLeave={() => setEncima(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={datos.imagen}
              alt={`Despiece del cañón ${datos.nombre}`}
              className={`block h-full w-full select-none transition ${resaltada != null || grupo ? 'opacity-55 saturate-50' : ''}`}
              draggable={false}
            />

            {datos.zonas.map((z, i) => {
              const activa = z.piezas.some((p) => p.n === resaltada);
              const delGrupo = z.piezas.some((p) => enGrupo(p.n) || armadas.has(p.n));
              return (
                <button
                  key={`${canon}-z${i}`}
                  type="button"
                  tabIndex={-1}
                  aria-label={z.piezas.map((p) => `${p.n}. ${p.nombre}`).join('; ')}
                  onMouseEnter={() => !armado && setEncima(z.piezas[0].n)}
                  onClick={() => {
                    setArmado(null);
                    setElegida(z.piezas[0].n);
                  }}
                  className={`absolute rounded border-2 transition-colors ${
                    activa
                      ? 'z-10 border-[#FFBD59] bg-[#FFBD59]/30 shadow-[0_0_0_3px_rgba(255,189,89,0.35)]'
                      : delGrupo
                        ? 'border-[#FFBD59] bg-[#FFBD59]/15'
                        : 'border-transparent hover:border-[#FFBD59]/70'
                  }`}
                  style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}
                />
              );
            })}

            {/* Números del despiece: se pueden tocar */}
            {datos.globos.map((g, i) => {
              const activa = g.n === resaltada;
              const p = piezas.find((x) => x.n === g.n);
              return (
                <button
                  key={`${canon}-g${i}`}
                  type="button"
                  aria-label={`Pieza ${g.n}: ${p?.nombre ?? ''}`}
                  aria-pressed={g.n === elegida}
                  data-globo={g.n}
                  onMouseEnter={() => !armado && setEncima(g.n)}
                  onFocus={() => !armado && setEncima(g.n)}
                  onClick={() => {
                    setArmado(null);
                    setElegida(g.n);
                  }}
                  className={`absolute z-20 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-sm font-bold transition ${
                    activa
                      ? 'scale-110 border-tinta bg-[#FFBD59] text-tinta shadow-lg'
                      : enGrupo(g.n)
                        ? 'border-[#FFBD59] bg-[#FFBD59]/40 text-transparent'
                        : 'border-transparent text-transparent hover:border-[#FFBD59] hover:bg-[#FFBD59]/30'
                  } focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tinta`}
                  style={{ left: `${g.x}%`, top: `${g.y}%` }}
                >
                  {g.n}
                </button>
              );
            })}

            {/* Nombre rápido al pasar el mouse */}
            {encima != null && encima !== elegida && (() => {
              const p = piezas.find((x) => x.n === encima);
              const z = datos.zonas.find((x) => x.piezas.some((q) => q.n === encima));
              if (!p || !z) return null;
              const s = stock[p.sku];
              const derecha = z.x + z.w / 2 > 55;
              return (
                <div
                  className="pointer-events-none absolute z-30 w-56 rounded-lg bg-tinta px-3 py-2 text-sm text-white shadow-xl"
                  style={{
                    top: `${Math.min(Math.max(z.y + z.h / 2, 6), 90)}%`,
                    transform: 'translateY(-50%)',
                    ...(derecha ? { right: `${100 - z.x + 1}%` } : { left: `${Math.min(z.x + z.w + 1, 60)}%` }),
                  }}
                >
                  <p className="font-bold leading-snug">
                    <span className="mr-1 text-[#FFBD59]">{p.n}</span>
                    {p.nombre}
                  </p>
                  <p className="font-mono text-xs text-white/70">{p.sku}</p>
                  <p className={`text-sm font-semibold ${!cargado ? 'text-white/70' : (s?.total ?? 0) > 0 ? 'text-[#7EE2C0]' : 'text-[#FFB4AB]'}`}>
                    {!cargado ? 'Consultando…' : !s ? 'No está en el inventario' : s.total > 0 ? `Hay ${numero.format(s.total)} ${und(s.unidad)}` : 'Sin existencia'}
                  </p>
                </div>
              );
            })()}
          </div>

          {datos.vista && (
            <figure className="mx-auto mt-5 max-w-xl border-t border-linea pt-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={datos.vista.imagen} alt={`${datos.vista.titulo} del cañón ${datos.nombre}`} className="w-full" />
              <figcaption className="mt-1 text-center text-xs text-acero">{datos.vista.titulo}</figcaption>
            </figure>
          )}
          {canon === 'destroyer' && (
            <p className="mt-3 text-xs text-acero">
              Dibujo del catálogo coloreado por material (aluminio, bronce, caucho, resortes y poliuretano). Si Poliway entrega el render original a color, se
              reemplaza.
            </p>
          )}
        </section>

        {/* ---------------------- Ficha o lista ---------------------- */}
        <aside className="space-y-4 lg:sticky lg:top-4">
          {armado && pasoActual && (() => {
            const p = piezas.find((x) => x.n === pasoActual.n);
            const s = p ? stock[p.sku] : undefined;
            return (
              <section className="overflow-hidden rounded-lg border-2 border-poli bg-white" aria-live="polite">
                <header className="flex items-center justify-between gap-2 bg-poli px-4 py-2.5">
                  <p className="font-bold">Cómo se arma el {datos.nombre}</p>
                  <button onClick={() => setArmado(null)} aria-label="Terminar el modo armado" className="rounded px-2 text-xl leading-none hover:bg-tinta/10">
                    ×
                  </button>
                </header>
                <div className="space-y-2 p-4">
                  <div className="flex items-center justify-between text-sm text-acero">
                    <span>
                      Paso {armado.idx + 1} de {pasos.length}
                    </span>
                    {armado.fin && <span className="font-semibold text-oro-oscuro">¡Cañón armado!</span>}
                  </div>
                  <div className="h-1.5 rounded-full bg-linea" aria-hidden>
                    <div className="h-full rounded-full bg-tinta transition-all" style={{ width: `${((armado.idx + 1) / pasos.length) * 100}%` }} />
                  </div>
                  <h2 className="text-xl font-bold leading-snug">
                    <span className="mr-1.5 text-oro-oscuro">{pasoActual.n}</span>
                    {p?.nombre}
                  </h2>
                  <p className="font-mono text-sm text-acero">
                    {p?.sku} · {!s ? 'no está en el inventario' : s.total > 0 ? `hay ${numero.format(s.total)} ${und(s.unidad)}` : 'sin existencia'}
                  </p>
                  {pasoActual.texto && <p>{pasoActual.texto}</p>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button onClick={() => irAPaso(armado.idx - 1)} disabled={armado.idx === 0} className="rounded-lg border border-linea px-3 py-2 font-semibold disabled:opacity-40" aria-label="Paso anterior">
                      ⏮
                    </button>
                    {armado.fin ? (
                      <button onClick={iniciarArmado} className="flex-1 rounded-lg bg-tinta px-4 py-2 font-semibold text-white">
                        ↺ Ver de nuevo
                      </button>
                    ) : (
                      <button
                        onClick={() => setArmado((a) => (a ? { ...a, pausado: !a.pausado } : a))}
                        className="flex-1 rounded-lg bg-tinta px-4 py-2 font-semibold text-white hover:bg-poli hover:text-tinta"
                      >
                        {armado.pausado ? '▶ Seguir' : '⏸ Pausa'}
                      </button>
                    )}
                    <button
                      onClick={() => irAPaso(armado.idx + 1)}
                      disabled={armado.idx >= pasos.length - 1}
                      className="rounded-lg border border-linea px-3 py-2 font-semibold disabled:opacity-40"
                      aria-label="Paso siguiente"
                    >
                      ⏭
                    </button>
                    <button
                      onClick={() => setVozArmado((v) => !v)}
                      className="rounded-lg border border-linea px-3 py-2"
                      aria-label={vozArmado ? 'Silenciar la narración' : 'Activar la narración'}
                      title={vozArmado ? 'Silenciar la narración' : 'Activar la narración'}
                    >
                      {vozArmado ? '🔊' : '🔇'}
                    </button>
                  </div>
                  <p className="text-xs italic text-acero">{NOTA_ARMADO}</p>
                </div>
              </section>
            );
          })()}
          {pieza ? (
            <Ficha
              key={`${canon}-${pieza.n}`}
              canon={canon}
              pieza={pieza}
              stock={stock[pieza.sku]}
              cargado={cargado}
              producto={catalogo.find((p) => p.sku === pieza.sku) ?? null}
              puedeEditar={sesion.puedeEditar}
              ubicaciones={ubicaciones}
              funcionarios={funcionarios}
              areas={areas}
              clientes={clientes}
              equipos={equipos}
              onCerrar={() => setElegida(null)}
              onIr={(c, n) => cambiarCanon(c, n)}
              onRegistrado={cargarStock}
            />
          ) : null}

          <section className="rounded-lg border border-linea bg-white">
            <h2 className="border-b border-linea px-4 py-3 font-bold">
              {grupo ? GRUPOS[grupo] : 'Piezas'} del {datos.nombre}
            </h2>
            <ul className="max-h-[60vh] divide-y divide-linea overflow-y-auto">
              {piezas
                .filter((p) => !grupo || p.grupo === grupo)
                .map((p) => {
                  const s = stock[p.sku];
                  return (
                    <li key={p.n}>
                      <button
                        onClick={() => setElegida(p.n)}
                        onMouseEnter={() => setEncima(p.n)}
                        onMouseLeave={() => setEncima(null)}
                        className={`grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 text-left hover:bg-concreto ${
                          elegida === p.n ? 'bg-poli/20' : ''
                        }`}
                      >
                        <span className="font-bold text-oro-oscuro tabular-nums">{p.n}</span>
                        <span className="min-w-0">
                          <span className="block font-semibold leading-snug">{p.nombre}</span>
                          <span className="block truncate font-mono text-xs text-acero">{p.sku}</span>
                        </span>
                        <span className={`text-right text-sm font-semibold tabular-nums ${!s || s.total <= 0 ? 'text-alerta' : s.minimo > 0 && s.total <= s.minimo ? 'text-oro-oscuro' : ''}`}>
                          {!cargado ? '…' : !s ? '—' : s.total > 0 ? numero.format(s.total) : 'Agotado'}
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}

/* ============================ Ficha de la pieza ============================ */

function Ficha({
  canon,
  pieza,
  stock,
  cargado,
  producto,
  puedeEditar,
  ubicaciones,
  funcionarios,
  areas,
  clientes,
  equipos,
  onCerrar,
  onIr,
  onRegistrado,
}: {
  canon: Clave;
  pieza: PiezaDespiece;
  stock: Stock | undefined;
  cargado: boolean;
  producto: ProductoBasico | null;
  puedeEditar: boolean;
  ubicaciones: Opcion[];
  funcionarios: Opcion[];
  areas: Opcion[];
  clientes: Opcion[];
  equipos: Equipo[];
  onCerrar: () => void;
  onIr: (c: Clave, n: number) => void;
  onRegistrado: () => Promise<void>;
}) {
  const info = PIEZAS[pieza.sku];
  const usos = usosDe(pieza.sku);
  const u = und(stock?.unidad ?? producto?.unidad_medida ?? 'UND');
  const total = stock?.total ?? 0;
  const minimo = stock?.minimo ?? producto?.stock_minimo ?? 0;

  // Movimiento rápido
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<'ENTRADA' | 'SALIDA'>('SALIDA');
  const [cantidad, setCantidad] = useState('1');
  const [ubic, setUbic] = useState('');
  const [destino, setDestino] = useState<'FUNCIONARIO' | 'CLIENTE'>('FUNCIONARIO');
  const [func, setFunc] = useState('');
  const [area, setArea] = useState('');
  const [cliente, setCliente] = useState('');
  const [equipo, setEquipo] = useState('');
  const [costo, setCosto] = useState('');
  const [documento, setDocumento] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    if (!ubic && ubicaciones[0]) setUbic(String(ubicaciones[0].id));
  }, [ubicaciones, ubic]);

  const disponible = stock?.porUbicacion.find((x) => String(x.id) === ubic)?.cantidad ?? 0;
  const control = 'w-full rounded-lg border border-linea bg-white px-3 py-2 text-base focus:border-poli focus:outline-none focus:ring-2 focus:ring-poli/40';

  async function registrar(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    const cant = leerMonto(cantidad);
    if (!producto) return setMensaje({ ok: false, texto: 'Este repuesto no está en el inventario.' });
    if (!Number.isFinite(cant) || cant <= 0) return setMensaje({ ok: false, texto: 'Escriba una cantidad mayor que cero.' });
    if (!ubic) return setMensaje({ ok: false, texto: 'Escoja la bodega.' });
    if (tipo === 'SALIDA' && cant > disponible) return setMensaje({ ok: false, texto: `En esa bodega solo hay ${numero.format(disponible)} ${u}.` });
    if (tipo === 'SALIDA' && destino === 'FUNCIONARIO' && (!func || !area)) return setMensaje({ ok: false, texto: 'Escoja el funcionario y el área.' });
    if (tipo === 'SALIDA' && destino === 'CLIENTE' && !cliente) return setMensaje({ ok: false, texto: 'Escoja el cliente.' });
    const costoNum = costo.trim() ? leerMonto(costo) : null;
    if (costoNum != null && (!Number.isFinite(costoNum) || costoNum < 0)) return setMensaje({ ok: false, texto: 'Revise el costo: escriba solo números.' });

    setEnviando(true);
    const { error } = await supabase.rpc('registrar_movimiento', {
      p_producto_id: producto.id,
      p_ubicacion_id: Number(ubic),
      p_tipo: tipo,
      p_cantidad: cant,
      p_proveedor_id: null,
      p_documento_ref: documento.trim() || null,
      p_nota: `Registrado desde el despiece del ${CANONES[canon].nombre}`,
      p_destino: tipo === 'SALIDA' ? destino : null,
      p_funcionario_id: tipo === 'SALIDA' && destino === 'FUNCIONARIO' ? Number(func) : null,
      p_area_id: tipo === 'SALIDA' && destino === 'FUNCIONARIO' ? Number(area) : null,
      p_cliente_id: tipo === 'SALIDA' && destino === 'CLIENTE' ? Number(cliente) : null,
      p_costo_unitario: tipo === 'ENTRADA' ? costoNum : null,
      p_equipo_id: tipo === 'SALIDA' && destino === 'CLIENTE' && equipo ? Number(equipo) : null,
      p_firma: null,
    });
    setEnviando(false);
    if (error) {
      const texto = error.code === '42501' ? 'Su usuario no puede registrar movimientos.' : error.message ?? 'No se pudo registrar.';
      setMensaje({ ok: false, texto });
      decirAlAsistente(texto, false);
      return;
    }
    const texto = `${tipo === 'ENTRADA' ? 'Entrada' : 'Salida'} registrada: ${numero.format(cant)} ${u} de ${pieza.nombre}.`;
    setMensaje({ ok: true, texto });
    decirAlAsistente(texto);
    setCantidad('1');
    setDocumento('');
    await onRegistrado();
  }

  return (
    <section id="ficha-pieza" className="overflow-hidden rounded-lg border-2 border-tinta bg-white" aria-live="polite">
      <header className="flex items-start justify-between gap-3 bg-tinta px-4 py-3 text-white">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/70">
            {CANONES[canon].nombre} · pieza {pieza.n} · {GRUPOS[pieza.grupo]}
          </p>
          <h2 className="text-xl font-bold leading-snug">{pieza.nombre}</h2>
          <p className="font-mono text-sm text-[#FFBD59]">{pieza.sku}</p>
        </div>
        <button onClick={onCerrar} aria-label="Cerrar la ficha" className="rounded px-2 text-2xl leading-none hover:bg-white/10">
          ×
        </button>
      </header>

      <div className="space-y-3 p-4">
        {/* Existencia */}
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className={`text-3xl font-bold tabular-nums ${!stock || total <= 0 ? 'text-alerta' : ''}`}>
            {!cargado ? '…' : !stock ? '—' : total > 0 ? numero.format(total) : '0'}
          </span>
          <span className="text-acero">{u} en bodega</span>
          {minimo > 0 && (
            <span className={`text-sm ${total <= minimo ? 'font-semibold text-alerta' : 'text-acero'}`}>
              {total <= minimo ? 'En el mínimo' : 'Mínimo'} {numero.format(minimo)}
            </span>
          )}
        </div>
        {!stock && cargado && <p className="text-sm text-alerta">Este código no está en el inventario.</p>}
        {stock && stock.porUbicacion.filter((x) => x.cantidad > 0).length > 1 && (
          <ul className="text-sm text-acero">
            {stock.porUbicacion
              .filter((x) => x.cantidad > 0)
              .map((x) => (
                <li key={x.id}>
                  {x.nombre}: {numero.format(x.cantidad)} {u}
                </li>
              ))}
          </ul>
        )}
        {producto && producto.costo_unitario > 0 && (
          <p className="text-sm">
            Costo promedio: <b>{pesos.format(producto.costo_unitario)}</b> · Valor en bodega: <b>{pesos.format(producto.costo_unitario * total)}</b>
          </p>
        )}

        {/* Para qué sirve */}
        {info ? (
          <div className="rounded-lg bg-concreto p-3 text-sm">
            <p className="font-semibold">Para qué sirve</p>
            <p>{info.funcion}</p>
            {info.desgaste && (
              <p className="mt-1.5">
                <b>Mantenimiento:</b> {info.desgaste}
              </p>
            )}
            <p className="mt-1.5 text-xs italic text-acero">{NOTA_GENERAL}</p>
          </div>
        ) : (
          <p className="text-sm text-acero">Todavía no hay descripción de esta pieza.</p>
        )}

        {/* En qué cañones va */}
        <div className="text-sm">
          <span className="font-semibold">Va en: </span>
          {usos.map((x, i) => (
            <span key={`${x.c}-${x.n}`}>
              {i > 0 && ', '}
              {x.c === canon ? (
                <span>
                  {CANONES[x.c].nombre} (ítem {x.n})
                </span>
              ) : (
                <button onClick={() => onIr(x.c, x.n)} className="font-semibold text-oro-oscuro underline">
                  {CANONES[x.c].nombre} (ítem {x.n})
                </button>
              )}
            </span>
          ))}
        </div>

        {/* Movimiento rápido */}
        {puedeEditar && producto && (
          <div className="border-t border-linea pt-3">
            {!abierto ? (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setTipo('SALIDA');
                    setAbierto(true);
                  }}
                  className="flex-1 rounded-lg bg-tinta px-4 py-2.5 font-semibold text-white hover:bg-poli hover:text-tinta"
                >
                  Registrar salida
                </button>
                <button
                  onClick={() => {
                    setTipo('ENTRADA');
                    setAbierto(true);
                  }}
                  className="flex-1 rounded-lg bg-poli px-4 py-2.5 font-semibold text-tinta hover:bg-tinta hover:text-white"
                >
                  Registrar entrada
                </button>
              </div>
            ) : (
              <form onSubmit={registrar} className="space-y-2.5" noValidate>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de movimiento">
                  {(['ENTRADA', 'SALIDA'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={tipo === t}
                      onClick={() => setTipo(t)}
                      className={`rounded-lg border-2 py-2 font-bold ${
                        tipo === t ? (t === 'ENTRADA' ? 'border-poli bg-poli text-tinta' : 'border-tinta bg-tinta text-white') : 'border-linea text-acero'
                      }`}
                    >
                      {t === 'ENTRADA' ? 'Entrada' : 'Salida'}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                  <label>
                    <span className="mb-0.5 block text-xs font-medium">Cantidad ({u})</span>
                    <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" className={`${control} text-center font-semibold`} />
                  </label>
                  <label>
                    <span className="mb-0.5 block text-xs font-medium">Bodega</span>
                    <select value={ubic} onChange={(e) => setUbic(e.target.value)} className={control}>
                      {ubicaciones.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nombre} ({numero.format(stock?.porUbicacion.find((p) => p.id === x.id)?.cantidad ?? 0)})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {tipo === 'SALIDA' ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {(['FUNCIONARIO', 'CLIENTE'] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDestino(d)}
                          className={`rounded border py-1.5 font-semibold ${destino === d ? 'border-tinta bg-tinta text-white' : 'border-linea'}`}
                        >
                          {d === 'FUNCIONARIO' ? 'A funcionario' : 'A cliente'}
                        </button>
                      ))}
                    </div>
                    {destino === 'FUNCIONARIO' ? (
                      <div className="grid grid-cols-2 gap-2">
                        <select value={func} onChange={(e) => setFunc(e.target.value)} className={control} aria-label="Funcionario que recibe">
                          <option value="">Funcionario…</option>
                          {funcionarios.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.nombre}
                            </option>
                          ))}
                        </select>
                        <select value={area} onChange={(e) => setArea(e.target.value)} className={control} aria-label="Área">
                          <option value="">Área…</option>
                          {areas.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={cliente}
                          onChange={(e) => {
                            setCliente(e.target.value);
                            setEquipo('');
                          }}
                          className={control}
                          aria-label="Cliente"
                        >
                          <option value="">Cliente…</option>
                          {clientes.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.nombre}
                            </option>
                          ))}
                        </select>
                        <select value={equipo} onChange={(e) => setEquipo(e.target.value)} className={control} aria-label="Equipo instalado">
                          <option value="">Equipo (opcional)</option>
                          {equipos
                            .filter((x) => String(x.cliente_id) === cliente)
                            .map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.modelo} {x.serial ?? ''}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <input value={costo} onChange={(e) => setCosto(e.target.value)} inputMode="decimal" placeholder="Costo unitario" className={control} aria-label="Costo unitario" />
                    <input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Factura o remisión" className={control} aria-label="Documento" />
                  </div>
                )}
                {mensaje && (
                  <p className={`rounded px-3 py-2 text-sm font-medium ${mensaje.ok ? 'bg-poli/20' : 'bg-alerta-suave text-alerta'}`} role="status">
                    {mensaje.texto}
                  </p>
                )}
                <div className="flex gap-2">
                  <button type="submit" disabled={enviando} className="flex-1 rounded-lg bg-tinta px-4 py-2.5 font-semibold text-white hover:bg-poli hover:text-tinta disabled:opacity-50">
                    {enviando ? 'Registrando…' : `Registrar ${tipo === 'ENTRADA' ? 'entrada' : 'salida'}`}
                  </button>
                  <button type="button" onClick={() => setAbierto(false)} className="rounded-lg border border-linea px-3 font-semibold">
                    Cerrar
                  </button>
                </div>
                <Link href={`/escanear?codigo=${encodeURIComponent(pieza.sku)}`} className="block text-center text-sm font-semibold text-oro-oscuro underline">
                  Abrir en Inventario (con firma del que recibe)
                </Link>
              </form>
            )}
            {!abierto && mensaje?.ok && <p className="mt-2 rounded bg-poli/20 px-3 py-2 text-sm font-medium">{mensaje.texto}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
