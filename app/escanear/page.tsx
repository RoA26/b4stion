'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import BuscadorProducto from '@/components/BuscadorProducto';
import FirmaPad from '@/components/FirmaPad';
import SelectorUbicacion from '@/components/SelectorUbicacion';
import { cargarCatalogo, porCodigo, type ProductoBasico } from '@/lib/catalogo';
import { leerMonto } from '@/lib/formato';
import { decirAlAsistente, useOrdenVoz } from '@/lib/voz/bus';

/* ----------------------------- Tipos ----------------------------- */

type Tipo = 'ENTRADA' | 'SALIDA';
type Paso = 'esperando' | 'encontrado';
type Producto = ProductoBasico;

interface Opcion {
  id: string | number;
  nombre: string;
}
interface Equipo {
  id: number;
  cliente_id: number;
  modelo: string;
  serial: string | null;
  planta: string | null;
}
interface Registro {
  hora: string;
  tipo: Tipo;
  cantidad: number;
  producto: string;
  unidad: string;
  saldo: number;
  ubicacion: string;
  entregado?: string;
}

const UNIDADES: Record<string, string> = { UND: 'und', M: 'm', M2: 'm²', KG: 'kg', ROLLO: 'rollos' };
const DECIMALES = new Set(['M', 'M2', 'KG']); // se venden por cortes o por peso
const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const CLAVE_UBICACION = 'poliway.ubicacion';

function leer(clave: string) {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}
function guardar(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

function traducirError(e: { code?: string; message?: string }) {
  if (e.code === 'PW001') return e.message ?? 'Stock insuficiente.';
  if (e.code === 'PW003') return e.message ?? 'Indique a quién se entrega la salida.';
  if (e.code === '42501') return 'Su rol no permite registrar movimientos. Pida a un administrador que le asigne el rol de bodeguero.';
  if (e.code === '28000') return 'La sesión expiró. Vuelva a iniciar sesión.';
  return e.message ?? 'No se pudo registrar el movimiento.';
}

/* ============================== Página ============================== */

export default function Escanear() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [puedeEditar, setPuedeEditar] = useState(true);
  const [esAdmin, setEsAdmin] = useState(false); // solo el administrador ve y registra costos
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Opcion[]>([]);
  const [proveedores, setProveedores] = useState<Opcion[]>([]);
  const [funcionarios, setFuncionarios] = useState<Opcion[]>([]);
  const [areas, setAreas] = useState<Opcion[]>([]);
  const [clientes, setClientes] = useState<Opcion[]>([]);

  const [paso, setPaso] = useState<Paso>('esperando');
  const [producto, setProducto] = useState<Producto | null>(null);
  const [stockPorUbicacion, setStockPorUbicacion] = useState<Record<string, number>>({});

  const [tipo, setTipo] = useState<Tipo>('SALIDA');
  const [ubicacionId, setUbicacionId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [documento, setDocumento] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [nota, setNota] = useState('');
  // A quién se entrega una salida (se conserva entre registros: suele ser la misma persona)
  const [destino, setDestino] = useState<'FUNCIONARIO' | 'CLIENTE'>('FUNCIONARIO');
  const [funcionarioId, setFuncionarioId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [equipoId, setEquipoId] = useState('');
  const [costo, setCosto] = useState('');
  const [firma, setFirma] = useState<string | null>(null);
  const [claveFirma, setClaveFirma] = useState(0); // para limpiar el recuadro de firma
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [historial, setHistorial] = useState<Registro[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const campoCantidad = useRef<HTMLInputElement>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const [porVoz, setPorVoz] = useState(false); // el formulario lo llenó el asistente de voz

  /* ------------------------ Sesión y catálogos ------------------------ */

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!vivo) return;
      if (!data.session) {
        router.replace('/login');
        return;
      }
      const [perfil, ubic, prov, func, ars, clis, eqs] = await Promise.all([
        supabase.from('perfiles').select('rol, nombre, activo').eq('id', data.session.user.id).maybeSingle(),
        supabase.from('ubicaciones').select('id, nombre').eq('activo', true).order('nombre'),
        supabase.from('proveedores').select('id, nombre').order('nombre'),
        supabase.from('funcionarios').select('id, nombre').eq('activo', true).order('nombre'),
        supabase.from('areas').select('id, nombre').eq('activo', true).order('nombre'),
        supabase.from('clientes').select('id, nombre').eq('activo', true).order('nombre'),
        supabase.from('equipos').select('id, cliente_id, modelo, serial, planta').eq('activo', true).order('modelo'),
      ]);
      if (!vivo) return;
      setPuedeEditar(['admin', 'bodeguero'].includes(perfil.data?.rol ?? '') && perfil.data?.activo !== false);
      setEsAdmin(perfil.data?.rol === 'admin' && perfil.data?.activo !== false);
      setNombreUsuario(perfil.data?.nombre || data.session.user.email || '');
      setEquipos((eqs.data ?? []) as Equipo[]);
      const listaUbic = (ubic.data ?? []) as Opcion[];
      setUbicaciones(listaUbic);
      setProveedores((prov.data ?? []) as Opcion[]);
      setFuncionarios((func.data ?? []) as Opcion[]);
      setAreas((ars.data ?? []) as Opcion[]);
      setClientes((clis.data ?? []) as Opcion[]);
      const recordada = leer(CLAVE_UBICACION);
      const inicial = listaUbic.find((u) => String(u.id) === recordada) ?? listaUbic[0];
      setUbicacionId(inicial ? String(inicial.id) : '');
      setListo(true);
    })();
    return () => {
      vivo = false;
    };
  }, [router]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  /* -------------------------- Buscar producto -------------------------- */

  // Producto escogido (por pistola, cámara o búsqueda): trae su existencia por ubicación
  const elegir = useCallback(async (p: Producto) => {
    setErrorForm(null);
    const { data: filas } = await supabase.from('stock').select('ubicacion_id, cantidad').eq('producto_id', p.id);
    const mapa: Record<string, number> = {};
    (filas ?? []).forEach((f) => {
      mapa[String(f.ubicacion_id)] = Number(f.cantidad);
    });
    setProducto(p);
    setStockPorUbicacion(mapa);
    setCantidad('');
    setDocumento('');
    setNota('');
    setProveedorId('');
    setCosto(p.costo_unitario ? String(p.costo_unitario) : '');
    setFirma(null);
    setClaveFirma((k) => k + 1);
    setPaso('encontrado');
    setTimeout(() => campoCantidad.current?.focus(), 50);
  }, []);

  // Si se llega desde el despiece de cañones (?codigo=...), se busca esa pieza de una vez
  useEffect(() => {
    if (!listo) return;
    const codigo = new URLSearchParams(window.location.search).get('codigo');
    if (!codigo) return;
    cargarCatalogo().then((lista) => {
      const p = porCodigo(lista, codigo);
      if (p) elegir(p);
    });
  }, [listo, elegir]);

  function volverAEscanear() {
    setProducto(null);
    setErrorForm(null);
    setPorVoz(false);
    setPaso('esperando');
  }

  /* ---------------- Órdenes del asistente de voz (Blaster) ---------------- */
  interface DictadoVoz {
    sku: string;
    tipo: Tipo;
    cantidad: number | null;
    costo: number | null;
    documento: string | null;
    ubicacionId: string | null;
    destino: 'FUNCIONARIO' | 'CLIENTE' | null;
    funcionarioId: string | null;
    areaId: string | null;
    clienteId: string | null;
    equipoId: string | null;
  }
  useOrdenVoz(['movimiento', 'confirmar', 'cancelar'], listo && puedeEditar, async (tipoOrden, datos) => {
    if (tipoOrden === 'cancelar') return volverAEscanear();
    if (tipoOrden === 'confirmar') {
      if (!formulario.current) return decirAlAsistente('No hay ningún movimiento esperando confirmación.', false);
      return formulario.current.requestSubmit();
    }
    const d = datos as DictadoVoz;
    const p = porCodigo(await cargarCatalogo(), d.sku);
    if (!p) return decirAlAsistente('No encontré ese producto en el catálogo.', false);
    await elegir(p);
    setTipo(d.tipo);
    if (d.cantidad != null) setCantidad(String(d.cantidad));
    if (d.ubicacionId) setUbicacionId(d.ubicacionId);
    if (d.documento) setDocumento(d.documento);
    if (d.tipo === 'ENTRADA' && d.costo != null) setCosto(String(d.costo));
    if (d.tipo === 'SALIDA' && d.destino) {
      setDestino(d.destino);
      if (d.funcionarioId) setFuncionarioId(d.funcionarioId);
      if (d.areaId) setAreaId(d.areaId);
      if (d.clienteId) setClienteId(d.clienteId);
      setEquipoId(d.equipoId ?? '');
    }
    setPorVoz(true);
  });

  /* ------------------------ Registrar movimiento ------------------------ */

  const unidad = producto?.unidad_medida ?? 'UND';
  const permiteDecimales = DECIMALES.has(unidad);
  const cant = Number(cantidad.replace(',', '.'));
  const cantidadValida = cantidad.trim() !== '' && Number.isFinite(cant) && cant > 0 && (permiteDecimales || Number.isInteger(cant));
  const disponible = stockPorUbicacion[ubicacionId] ?? 0;
  const saldo = cantidadValida ? disponible + (tipo === 'ENTRADA' ? cant : -cant) : null;
  const insuficiente = saldo != null && saldo < 0;
  const nombreUbicacion = ubicaciones.find((u) => String(u.id) === ubicacionId)?.nombre ?? '';
  const totalStock = Object.values(stockPorUbicacion).reduce((a, b) => a + b, 0);

  function ajustar(delta: number) {
    const base = Number.isFinite(cant) ? cant : 0;
    const nuevo = Math.max(0, Math.round((base + delta) * 1000) / 1000);
    setCantidad(nuevo === 0 ? '' : String(nuevo));
    setErrorForm(null);
  }

  const nombreDe = (lista: Opcion[], id: string) => lista.find((x) => String(x.id) === id)?.nombre ?? '';
  const entregadoA =
    destino === 'FUNCIONARIO'
      ? `${nombreDe(funcionarios, funcionarioId)} (${nombreDe(areas, areaId)})`
      : nombreDe(clientes, clienteId);
  const equiposCliente = equipos.filter((e) => String(e.cliente_id) === clienteId);
  const costoNum = leerMonto(costo);
  const costoValido = costo.trim() === '' || (Number.isFinite(costoNum) && costoNum >= 0);

  // Error de validación: se muestra y, si la orden vino por voz, el asistente lo dice
  function fallo(msg: string) {
    setErrorForm(msg);
    decirAlAsistente(msg, false);
  }

  async function registrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!producto) return;
    if (!ubicacionId) return fallo('No hay ubicaciones activas. Cree una en Supabase (tabla ubicaciones).');
    if (!cantidadValida)
      return fallo(
        permiteDecimales ? 'Escriba una cantidad mayor que cero.' : `Escriba una cantidad entera mayor que cero (${UNIDADES[unidad] ?? unidad}).`
      );
    if (insuficiente)
      return fallo(`En ${nombreUbicacion} solo hay ${numero.format(disponible)} ${UNIDADES[unidad] ?? unidad}.`);
    if (tipo === 'SALIDA' && destino === 'FUNCIONARIO' && (!funcionarioId || !areaId))
      return fallo('Escoja el funcionario que recibe y el área donde se usará.');
    if (tipo === 'SALIDA' && destino === 'CLIENTE' && !clienteId)
      return fallo('Escoja el cliente al que se despacha.');
    if (tipo === 'ENTRADA' && !costoValido) return fallo('Revise el costo unitario: escriba solo números.');

    setEnviando(true);
    setErrorForm(null);
    const { data, error } = await supabase.rpc('registrar_movimiento', {
      p_producto_id: producto.id,
      p_ubicacion_id: Number(ubicacionId),
      p_tipo: tipo,
      p_cantidad: cant,
      p_proveedor_id: tipo === 'ENTRADA' && proveedorId ? proveedorId : null,
      p_documento_ref: documento.trim() || null,
      p_nota: nota.trim() || null,
      p_destino: tipo === 'SALIDA' ? destino : null,
      p_funcionario_id: tipo === 'SALIDA' && destino === 'FUNCIONARIO' ? Number(funcionarioId) : null,
      p_area_id: tipo === 'SALIDA' && destino === 'FUNCIONARIO' ? Number(areaId) : null,
      p_cliente_id: tipo === 'SALIDA' && destino === 'CLIENTE' ? Number(clienteId) : null,
      p_costo_unitario: tipo === 'ENTRADA' && esAdmin && costo.trim() !== '' ? costoNum : null,
      p_equipo_id: tipo === 'SALIDA' && destino === 'CLIENTE' && equipoId ? Number(equipoId) : null,
      p_firma: tipo === 'SALIDA' ? firma : null,
    });
    setEnviando(false);

    if (error) {
      setErrorForm(traducirError(error));
      decirAlAsistente(traducirError(error), false);
      return;
    }

    guardar(CLAVE_UBICACION, ubicacionId);
    if (tipo === 'ENTRADA' && costo.trim() !== '') cargarCatalogo(true); // el costo promedio cambió
    const saldoReal = Number((data as { saldo_resultante?: number } | null)?.saldo_resultante ?? saldo ?? 0);
    setHistorial((h) =>
      [
        {
          hora: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
          tipo,
          cantidad: cant,
          producto: producto.nombre,
          unidad,
          saldo: saldoReal,
          ubicacion: nombreUbicacion,
          entregado: tipo !== 'SALIDA' ? undefined : `${entregadoA}${firma ? ', con firma' : ''}`,
        },
        ...h,
      ].slice(0, 15)
    );
    setAviso(`${tipo === 'ENTRADA' ? 'Entrada' : 'Salida'} registrada: ${numero.format(cant)} ${UNIDADES[unidad] ?? unidad} de ${producto.nombre}`);
    navigator.vibrate?.([60, 40, 60]);
    decirAlAsistente(
      `${tipo === 'ENTRADA' ? 'Entrada' : 'Salida'} registrada: ${numero.format(cant)} ${UNIDADES[unidad] ?? unidad} de ${producto.nombre}. Quedan ${numero.format(saldoReal)}.`
    );
    volverAEscanear();
  }

  /* ------------------------------ Vista ------------------------------ */

  if (!listo) return <p className="py-24 text-center text-acero">Cargando…</p>;

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-5">
      <header className="flex items-end justify-between gap-4 border-b-2 border-tinta pb-3">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-blaster.png" alt="Blaster by Poliway" className="h-9 w-auto" />
          <h1 className="text-3xl font-bold leading-tight">Inventario</h1>
          <p className="text-sm text-acero">Entradas y salidas</p>
        </div>
        <Link
          href="/"
          className="rounded border border-tinta px-3 py-1.5 text-sm font-medium hover:bg-tinta hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
        >
          Inicio
        </Link>
      </header>

      {!puedeEditar && (
        <p className="mt-4 rounded border border-alerta bg-alerta-suave px-4 py-3 text-sm font-medium text-alerta">
          Su usuario es de consulta: puede ver la existencia de un producto, pero no registrar movimientos.
        </p>
      )}

      {/* ---------------------- Paso 1: leer el código ---------------------- */}
      {paso === 'esperando' && (
        <section className="mt-5" aria-label="Leer código">
          <BuscadorProducto activo={paso === 'esperando'} onElegir={elegir} />
        </section>
      )}

      {/* -------------------- Paso 2: registrar movimiento -------------------- */}
      {paso === 'encontrado' && producto && (
        <section className="mt-5" aria-label="Registrar movimiento">
          <div className="rounded-lg border border-linea bg-white p-4">
            <p className="text-sm text-acero tabular-nums">
              {producto.sku} <span className="text-linea">|</span> {producto.codigo_barras}
            </p>
            <h2 className="mt-0.5 text-xl font-bold leading-snug">{producto.nombre}</h2>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-2xl font-semibold tabular-nums">
                {numero.format(totalStock)} <span className="text-base font-normal text-acero">{UNIDADES[unidad] ?? unidad}</span>
              </span>
              <span className={`text-sm ${totalStock <= producto.stock_minimo ? 'font-semibold text-alerta' : 'text-acero'}`}>
                {totalStock <= producto.stock_minimo ? 'Bajo el mínimo' : 'Mínimo'} {numero.format(producto.stock_minimo)}
              </span>
            </div>
          </div>

          {puedeEditar ? (
            <form ref={formulario} onSubmit={registrar} className="mt-4 space-y-4" noValidate>
              {porVoz && (
                <p className="rounded-lg border border-poli bg-poli/15 px-3 py-2 text-sm font-medium">
                  🎤 Datos dictados al asistente Blaster. Revíselos y presione Registrar, o diga «confirmar».
                </p>
              )}
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de movimiento">
                {(['ENTRADA', 'SALIDA'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={tipo === t}
                    onClick={() => {
                      setTipo(t);
                      setErrorForm(null);
                    }}
                    className={`rounded-lg border-2 py-3.5 text-lg font-bold ${
                      tipo === t
                        ? t === 'ENTRADA'
                          ? 'border-poli bg-poli text-tinta'
                          : 'border-tinta bg-tinta text-white'
                        : 'border-linea bg-white text-acero'
                    }`}
                  >
                    {t === 'ENTRADA' ? 'Entrada' : 'Salida'}
                  </button>
                ))}
              </div>

              <div>
                <span className="mb-1 block text-sm font-medium">Bodega o dependencia</span>
                <SelectorUbicacion
                  id="ubicacion"
                  ubicaciones={ubicaciones}
                  valor={ubicacionId}
                  onCambio={setUbicacionId}
                  onCreada={(u) => setUbicaciones((l) => [...l, u])}
                  puedeCrear={puedeEditar}
                  etiqueta={(u) => `${u.nombre} (${numero.format(stockPorUbicacion[String(u.id)] ?? 0)} ${UNIDADES[unidad] ?? unidad})`}
                />
              </div>

              <div>
                <label htmlFor="cantidad" className="mb-1 block text-sm font-medium">
                  Cantidad ({UNIDADES[unidad] ?? unidad})
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => ajustar(-1)}
                    aria-label="Restar uno"
                    className="w-14 shrink-0 rounded-lg border border-linea bg-white text-2xl font-bold"
                  >
                    −
                  </button>
                  <input
                    ref={campoCantidad}
                    id="cantidad"
                    type="number"
                    inputMode={permiteDecimales ? 'decimal' : 'numeric'}
                    min="0"
                    step={permiteDecimales ? 'any' : '1'}
                    value={cantidad}
                    onChange={(e) => {
                      setCantidad(e.target.value);
                      setErrorForm(null);
                    }}
                    placeholder="0"
                    className="min-w-0 flex-1 rounded-lg border border-linea bg-white px-3 py-3 text-center text-2xl font-semibold tabular-nums focus:border-poli focus:outline-none focus:ring-2 focus:ring-poli/30"
                  />
                  <button
                    type="button"
                    onClick={() => ajustar(1)}
                    aria-label="Sumar uno"
                    className="w-14 shrink-0 rounded-lg border border-linea bg-white text-2xl font-bold"
                  >
                    +
                  </button>
                </div>
                <p className={`mt-1.5 text-sm tabular-nums ${insuficiente ? 'font-semibold text-alerta' : 'text-acero'}`}>
                  {saldo == null
                    ? `Disponible en ${nombreUbicacion || 'la ubicación'}: ${numero.format(disponible)} ${UNIDADES[unidad] ?? unidad}`
                    : insuficiente
                      ? `No alcanza: solo hay ${numero.format(disponible)} ${UNIDADES[unidad] ?? unidad}`
                      : `Quedarán ${numero.format(saldo)} ${UNIDADES[unidad] ?? unidad} en ${nombreUbicacion}`}
                </p>
              </div>

              {tipo === 'SALIDA' && (
                <fieldset className="space-y-3 rounded-lg border border-linea bg-white p-3">
                  <legend className="px-1 text-sm font-semibold">¿A quién se entrega?</legend>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Destino de la salida">
                    {(['FUNCIONARIO', 'CLIENTE'] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        role="radio"
                        aria-checked={destino === d}
                        onClick={() => {
                          setDestino(d);
                          setErrorForm(null);
                        }}
                        className={`rounded-md border py-2.5 font-semibold ${
                          destino === d ? 'border-tinta bg-tinta text-white' : 'border-linea text-acero'
                        }`}
                      >
                        {d === 'FUNCIONARIO' ? 'Funcionario' : 'Cliente'}
                      </button>
                    ))}
                  </div>

                  {destino === 'FUNCIONARIO' ? (
                    <>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium">Funcionario que recibe</span>
                        <select
                          id="funcionario"
                          value={funcionarioId}
                          onChange={(e) => {
                            setFuncionarioId(e.target.value);
                            setErrorForm(null);
                          }}
                          className="w-full rounded-lg border border-linea bg-white px-3 py-3 text-base"
                        >
                          <option value="">Escoja el funcionario</option>
                          {funcionarios.map((f) => (
                            <option key={f.id} value={String(f.id)}>
                              {f.nombre}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium">Área donde se usará</span>
                        <select
                          id="area"
                          value={areaId}
                          onChange={(e) => {
                            setAreaId(e.target.value);
                            setErrorForm(null);
                          }}
                          className="w-full rounded-lg border border-linea bg-white px-3 py-3 text-base"
                        >
                          <option value="">Escoja el área</option>
                          {areas.map((a) => (
                            <option key={a.id} value={String(a.id)}>
                              {a.nombre}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  ) : (
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium">Cliente</span>
                      <select
                        id="cliente"
                        value={clienteId}
                        onChange={(e) => {
                          setClienteId(e.target.value);
                          setErrorForm(null);
                        }}
                        className="w-full rounded-lg border border-linea bg-white px-3 py-3 text-base"
                      >
                        <option value="">Escoja el cliente</option>
                        {clientes.map((c) => (
                          <option key={c.id} value={String(c.id)}>
                            {c.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {destino === 'CLIENTE' && equiposCliente.length > 0 && (
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium">
                        Cañón del cliente <span className="font-normal text-acero">(opcional, para su hoja de vida)</span>
                      </span>
                      <select
                        id="equipo"
                        value={equipoId}
                        onChange={(e) => setEquipoId(e.target.value)}
                        className="w-full rounded-lg border border-linea bg-white px-3 py-3 text-base"
                      >
                        <option value="">Sin equipo específico</option>
                        {equiposCliente.map((eq) => (
                          <option key={eq.id} value={String(eq.id)}>
                            {eq.modelo} {eq.serial ?? ''} {eq.planta ? `(${eq.planta})` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <p className="text-xs text-acero">
                    ¿No aparece en la lista?{' '}
                    <Link href="/listas" className="font-semibold text-tinta underline">
                      Agréguelo en Listas
                    </Link>
                  </p>
                  <p className="rounded bg-concreto px-3 py-2 text-sm">
                    <span className="text-acero">Entrega (almacén):</span> <strong>{nombreUsuario}</strong>
                  </p>
                  <div>
                    <span className="mb-1 block text-sm font-medium">
                      Firma de quien recibe <span className="font-normal text-acero">(opcional)</span>
                    </span>
                    <FirmaPad key={claveFirma} onCambio={setFirma} />
                  </div>
                </fieldset>
              )}

              {tipo === 'ENTRADA' && esAdmin && (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">
                    Costo unitario sin IVA <span className="font-normal text-acero">(opcional, actualiza el costo promedio)</span>
                  </span>
                  <input
                    id="costo"
                    inputMode="decimal"
                    value={costo}
                    onChange={(e) => {
                      setCosto(e.target.value);
                      setErrorForm(null);
                    }}
                    placeholder="Ej: 95000"
                    className="w-full rounded-lg border border-linea bg-white px-3 py-3 text-base tabular-nums"
                  />
                  <span className="mt-1 block text-xs text-acero">
                    Costo promedio actual: {pesos.format(producto.costo_unitario || 0)} por {UNIDADES[unidad] ?? unidad}
                  </span>
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  {tipo === 'ENTRADA' ? 'Factura o remisión del proveedor' : 'Remisión u orden'}{' '}
                  <span className="font-normal text-acero">(opcional)</span>
                </span>
                <input
                  id="documento"
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  placeholder={tipo === 'ENTRADA' ? 'Ej: FAC-1234' : 'Ej: REM-0456'}
                  className="w-full rounded-lg border border-linea bg-white px-3 py-3 text-base"
                />
              </label>

              {tipo === 'ENTRADA' && proveedores.length > 0 && (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">
                    Proveedor <span className="font-normal text-acero">(opcional)</span>
                  </span>
                  <select
                    id="proveedor"
                    value={proveedorId}
                    onChange={(e) => setProveedorId(e.target.value)}
                    className="w-full rounded-lg border border-linea bg-white px-3 py-3 text-base"
                  >
                    <option value="">Sin proveedor</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Nota <span className="font-normal text-acero">(opcional)</span>
                </span>
                <input
                  id="nota"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder={tipo === 'SALIDA' ? 'Ej: Corte para cliente' : 'Ej: Rollo en buen estado'}
                  className="w-full rounded-lg border border-linea bg-white px-3 py-3 text-base"
                />
              </label>

              {errorForm && (
                <p role="alert" className="rounded-lg border border-alerta bg-alerta-suave px-4 py-3 text-sm font-medium text-alerta">
                  {errorForm}
                </p>
              )}

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="submit"
                  disabled={enviando || insuficiente}
                  className={`rounded-lg py-4 text-lg font-bold disabled:opacity-50 ${tipo === 'ENTRADA' ? 'bg-poli text-tinta' : 'bg-tinta text-white'}`}
                >
                  {enviando
                    ? 'Registrando…'
                    : cantidadValida
                      ? `Registrar ${tipo === 'ENTRADA' ? 'entrada' : 'salida'} de ${numero.format(cant)} ${UNIDADES[unidad] ?? unidad}`
                      : `Registrar ${tipo === 'ENTRADA' ? 'entrada' : 'salida'}`}
                </button>
                <button type="button" onClick={volverAEscanear} className="py-2 font-semibold text-acero underline">
                  Cancelar y escanear otro
                </button>
              </div>
            </form>
          ) : (
            <button onClick={volverAEscanear} className="mt-4 w-full rounded-lg bg-tinta py-3.5 font-semibold text-white">
              Escanear otro código
            </button>
          )}
        </section>
      )}

      {/* ----------------------- Historial de la sesión ----------------------- */}
      {historial.length > 0 && (
        <section className="mt-8" aria-label="Registrado en esta sesión">
          <h2 className="mb-2 text-sm font-semibold text-acero">Registrado en esta sesión</h2>
          <ul className="divide-y divide-linea rounded-lg border border-linea bg-white">
            {historial.map((r, i) => (
              <li key={i} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.producto}</p>
                  <p className="text-xs text-acero">
                    {r.hora} en {r.ubicacion}, quedan {numero.format(r.saldo)} {UNIDADES[r.unidad] ?? r.unidad}
                    {r.entregado ? `. Entregado a ${r.entregado}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 font-semibold tabular-nums ${r.tipo === 'ENTRADA' ? 'text-oro-oscuro' : 'text-tinta'}`}>
                  {r.tipo === 'ENTRADA' ? '+' : '−'}
                  {numero.format(r.cantidad)} {UNIDADES[r.unidad] ?? r.unidad}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
