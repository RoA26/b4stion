'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Encabezado, { BOTON_PRINCIPAL, BOTON_SECUNDARIO, CONTROL } from '@/components/Encabezado';
import BuscadorProducto from '@/components/BuscadorProducto';
import FirmaPad from '@/components/FirmaPad';
import { descargarActa, type DatosActa } from '@/lib/acta';
import { supabase } from '@/lib/supabase';
import { useSesion } from '@/lib/sesion';
import { type ProductoBasico } from '@/lib/catalogo';
import { leerMonto, numero, UNIDADES } from '@/lib/formato';
import { exportarExcel, exportarPdf, type Columna } from '@/lib/exportar';

/* =====================================================================
   PRÉSTAMOS
   - Salida: prestamos a otra empresa → sale del inventario y vuelve con la devolución.
   - Entrada: otra empresa nos presta → entra al inventario y queda la obligación de devolver.
   La devolución puede ser parcial, o cerrarse como "saldado de otra forma"
   (por ejemplo, se pagó o se cambió por otro producto) sin mover inventario.
   ===================================================================== */

type Sentido = 'SALIDA' | 'ENTRADA';
interface Prestamo {
  id: number;
  sentido: Sentido;
  empresa: string;
  contacto: string | null;
  producto_id: string;
  sku: string;
  producto: string;
  unidad_medida: string;
  ubicacion_id: number | null;
  ubicacion: string | null;
  cantidad: number;
  devuelto: number;
  pendiente: number;
  fecha: string;
  fecha_devolucion: string | null;
  autorizo: string | null;
  nota: string | null;
  estado: 'PENDIENTE' | 'PARCIAL' | 'DEVUELTO' | 'SALDADO';
  registrado_por: string | null;
  vencido: boolean;
  tiene_firma?: boolean;
  firmo?: string | null;
}
interface Opcion {
  id: number;
  nombre: string;
}

const fechaCorta = (f: string | null) => (f ? new Date(f.length === 10 ? `${f}T12:00:00` : f).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const und = (u: string) => UNIDADES[u] ?? u.toLowerCase();
const TEXTO = {
  SALIDA: { titulo: 'Prestamos a otros', verbo: 'Prestar', empresa: 'Empresa a la que se presta', ayuda: 'Sale del inventario y vuelve cuando la devuelvan.', devolver: 'Nos devolvieron' },
  ENTRADA: { titulo: 'Nos prestan', verbo: 'Recibir préstamo', empresa: 'Empresa que nos presta', ayuda: 'Entra al inventario y queda pendiente devolverlo.', devolver: 'Devolvimos' },
};
// Arma el acta desde un préstamo guardado (trae la firma aparte, porque es una imagen grande)
async function actaDe(p: Prestamo) {
  const { data } = await supabase.from('prestamos').select('firma, firmo').eq('id', p.id).maybeSingle();
  const datos: DatosActa = {
    id: p.id,
    sentido: p.sentido,
    empresa: p.empresa,
    contacto: p.contacto,
    sku: p.sku,
    producto: p.producto,
    unidad: und(p.unidad_medida),
    cantidad: p.cantidad,
    bodega: p.ubicacion,
    fecha: p.fecha,
    fechaDevolucion: p.fecha_devolucion,
    autorizo: p.autorizo,
    nota: p.nota,
    registradoPor: p.registrado_por,
    firma: data?.firma ?? null,
    firmo: data?.firmo ?? p.firmo ?? null,
  };
  await descargarActa(datos);
}

const ESTADO = { PENDIENTE: 'Pendiente', PARCIAL: 'Devuelto en parte', DEVUELTO: 'Devuelto', SALDADO: 'Saldado de otra forma' };

export default function Prestamos() {
  const sesion = useSesion();
  const [sentido, setSentido] = useState<Sentido>('SALIDA');
  const [lista, setLista] = useState<Prestamo[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Opcion[]>([]);
  const [verHistorial, setVerHistorial] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('v_prestamos').select('*').order('fecha', { ascending: false }).order('id', { ascending: false });
    if (error) setError(error.message);
    setLista(((data ?? []) as Prestamo[]).map((p) => ({ ...p, cantidad: Number(p.cantidad), devuelto: Number(p.devuelto), pendiente: Number(p.pendiente) })));
  }, []);

  useEffect(() => {
    if (!sesion.puedeEditar) return;
    cargar();
    supabase
      .from('ubicaciones')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setUbicaciones((data ?? []) as Opcion[]));
    const v = new URLSearchParams(window.location.search).get('sentido');
    if (v === 'ENTRADA' || v === 'SALIDA') setSentido(v);
  }, [sesion.puedeEditar, cargar]);

  if (!sesion.listo) return <p className="py-24 text-center text-acero">Cargando…</p>;
  if (!sesion.puedeEditar)
    return (
      <main className="mx-auto max-w-3xl px-4 pt-6">
        <Encabezado titulo="Préstamos" />
        <p className="mt-6 rounded border border-alerta bg-alerta-suave px-4 py-3 font-medium text-alerta">Los préstamos los registran el administrador y el almacén.</p>
      </main>
    );

  const deEsteLado = lista.filter((p) => p.sentido === sentido);
  const abiertos = deEsteLado.filter((p) => p.estado === 'PENDIENTE' || p.estado === 'PARCIAL');
  const cerrados = deEsteLado.filter((p) => p.estado === 'DEVUELTO' || p.estado === 'SALDADO');
  const empresas = [...new Set(lista.map((p) => p.empresa))].sort();
  const cuenta = (s: Sentido) => lista.filter((p) => p.sentido === s && (p.estado === 'PENDIENTE' || p.estado === 'PARCIAL')).length;
  const vencidos = (s: Sentido) => lista.filter((p) => p.sentido === s && p.vencido).length;

  // Informe de todos los préstamos (pendientes, vencidos e historial), de los dos sentidos
  async function informe(formato: 'excel' | 'pdf') {
    const ESTADO_INF: Record<Prestamo['estado'], string> = { PENDIENTE: 'Pendiente', PARCIAL: 'Devuelto en parte', DEVUELTO: 'Devuelto', SALDADO: 'Saldado de otra forma' };
    const orden = [...lista].sort((a, b) => Number(b.vencido) - Number(a.vencido) || a.sentido.localeCompare(b.sentido) || b.fecha.localeCompare(a.fecha));
    const columnas: Columna<Prestamo>[] = [
      { titulo: 'Fecha', ancho: 11, tipo: 'texto', valor: (p) => fechaCorta(p.fecha) },
      { titulo: 'Tipo', ancho: 13, tipo: 'texto', valor: (p) => (p.sentido === 'SALIDA' ? 'Prestamos a otros' : 'Nos prestan') },
      { titulo: 'Empresa', ancho: 24, tipo: 'texto', valor: (p) => p.empresa },
      { titulo: 'Contacto', ancho: 14, tipo: 'texto', valor: (p) => p.contacto ?? '' },
      { titulo: 'Código', ancho: 14, tipo: 'texto', valor: (p) => p.sku },
      { titulo: 'Producto', ancho: 28, tipo: 'texto', valor: (p) => p.producto },
      { titulo: 'Cantidad', ancho: 9, tipo: 'numero', valor: (p) => p.cantidad },
      { titulo: 'Devuelto', ancho: 9, tipo: 'numero', valor: (p) => p.devuelto },
      { titulo: 'Pendiente', ancho: 9, tipo: 'numero', valor: (p) => p.pendiente },
      { titulo: 'Devolver el', ancho: 11, tipo: 'texto', valor: (p) => fechaCorta(p.fecha_devolucion) },
      { titulo: 'Estado', ancho: 15, tipo: 'texto', valor: (p) => `${ESTADO_INF[p.estado]}${p.vencido ? ' (VENCIDO)' : ''}` },
      { titulo: 'Autorizó', ancho: 14, tipo: 'texto', valor: (p) => p.autorizo ?? '' },
      { titulo: 'Firmó', ancho: 14, tipo: 'texto', valor: (p) => p.firmo ?? '' },
    ];
    const abiertos = lista.filter((p) => p.estado === 'PENDIENTE' || p.estado === 'PARCIAL');
    const inf = {
      titulo: 'Informe de préstamos',
      archivo: 'informe_prestamos',
      detalle: [`${lista.length} préstamos registrados; ${abiertos.length} pendientes; ${lista.filter((p) => p.vencido).length} vencidos`, `Generado por ${sesion.nombre}`],
      columnas: columnas as Columna<unknown>[],
      filas: orden as unknown[],
      totales: [
        { etiqueta: 'Prestamos a otros pendientes', valor: String(abiertos.filter((p) => p.sentido === 'SALIDA').length) },
        { etiqueta: 'Nos prestan pendientes', valor: String(abiertos.filter((p) => p.sentido === 'ENTRADA').length) },
      ],
    };
    if (formato === 'excel') await exportarExcel(inf);
    else await exportarPdf(inf);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <Encabezado titulo="Préstamos">
        <button onClick={() => informe('excel')} disabled={!lista.length} className="rounded border border-tinta px-3 py-1.5 font-medium hover:bg-tinta hover:text-white disabled:opacity-40">
          Informe Excel
        </button>
        <button onClick={() => informe('pdf')} disabled={!lista.length} className="rounded border border-tinta px-3 py-1.5 font-medium hover:bg-tinta hover:text-white disabled:opacity-40">
          Informe PDF
        </button>
      </Encabezado>

      <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg border border-linea bg-white p-1" role="tablist">
        {(['SALIDA', 'ENTRADA'] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={sentido === s}
            onClick={() => setSentido(s)}
            className={`rounded-md px-3 py-2 font-bold ${sentido === s ? 'bg-tinta text-white' : 'text-acero hover:text-tinta'}`}
          >
            {s === 'SALIDA' ? '↗ ' : '↙ '}
            {TEXTO[s].titulo}
            <span className="ml-1 font-normal">({cuenta(s)})</span>
            {vencidos(s) > 0 && <span className="ml-2 rounded-full bg-alerta px-2 py-0.5 text-xs text-white">{vencidos(s)} vencidos</span>}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 rounded bg-alerta-suave px-3 py-2 text-sm text-alerta">{error}</p>}

      <Formulario key={sentido} sentido={sentido} ubicaciones={ubicaciones} empresas={empresas} onGuardado={cargar} />

      <section className="mt-6">
        <h2 className="text-lg font-bold">{sentido === 'SALIDA' ? 'Lo que tienen otros (por devolvernos)' : 'Lo que debemos devolver'}</h2>
        {!abiertos.length ? (
          <p className="mt-2 rounded-lg border border-linea bg-white p-5 text-center text-acero">No hay préstamos pendientes.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {abiertos.map((p) => (
              <Fila key={p.id} p={p} ubicaciones={ubicaciones} onCambio={cargar} />
            ))}
          </ul>
        )}
      </section>

      {cerrados.length > 0 && (
        <section className="mt-6">
          <button onClick={() => setVerHistorial((v) => !v)} className="font-semibold underline" aria-expanded={verHistorial}>
            {verHistorial ? 'Ocultar' : 'Ver'} historial ({cerrados.length} cerrados)
          </button>
          {verHistorial && (
            <div className="mt-2 overflow-x-auto rounded-lg border border-linea bg-white">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b-2 border-tinta text-left text-xs text-acero">
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Empresa</th>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2 text-right">Cantidad</th>
                    <th className="px-3 py-2">Cierre</th>
                  </tr>
                </thead>
                <tbody>
                  {cerrados.map((p) => (
                    <tr key={p.id} className="border-b border-linea">
                      <td className="px-3 py-2">{fechaCorta(p.fecha)}</td>
                      <td className="px-3 py-2">{p.empresa}</td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs">{p.sku}</span> {p.producto}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {numero.format(p.cantidad)} {und(p.unidad_medida)}
                      </td>
                      <td className="px-3 py-2">{ESTADO[p.estado]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function Formulario({ sentido, ubicaciones, empresas, onGuardado }: { sentido: Sentido; ubicaciones: Opcion[]; empresas: string[]; onGuardado: () => Promise<void> }) {
  const [producto, setProducto] = useState<ProductoBasico | null>(null);
  const [empresa, setEmpresa] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [bodega, setBodega] = useState('');
  const [devolucion, setDevolucion] = useState('');
  const [contacto, setContacto] = useState('');
  const [autorizo, setAutorizo] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [existencia, setExistencia] = useState<number | null>(null);
  const [firma, setFirma] = useState<string | null>(null);
  const [firmo, setFirmo] = useState('');
  const [claveFirma, setClaveFirma] = useState(0);
  const [ultimo, setUltimo] = useState<number | null>(null);

  useEffect(() => {
    if (!bodega && ubicaciones[0]) setBodega(String(ubicaciones[0].id));
  }, [ubicaciones, bodega]);

  useEffect(() => {
    setExistencia(null);
    if (!producto || !bodega) return;
    supabase
      .from('v_inventario')
      .select('cantidad')
      .eq('producto_id', producto.id)
      .eq('ubicacion_id', Number(bodega))
      .maybeSingle()
      .then(({ data }) => setExistencia(Number(data?.cantidad ?? 0)));
  }, [producto, bodega]);

  async function guardar() {
    const cant = leerMonto(cantidad);
    if (!empresa.trim()) return setMensaje({ ok: false, texto: 'Escriba la empresa.' });
    if (!producto) return setMensaje({ ok: false, texto: 'Escoja el producto.' });
    if (!Number.isFinite(cant) || cant <= 0) return setMensaje({ ok: false, texto: 'Escriba una cantidad mayor que cero.' });
    if (firma && !firmo.trim()) return setMensaje({ ok: false, texto: 'Escriba el nombre de quien firma.' });
    if (sentido === 'SALIDA' && existencia != null && cant > existencia)
      return setMensaje({ ok: false, texto: `En esa bodega solo hay ${numero.format(existencia)} ${und(producto.unidad_medida)}.` });
    setGuardando(true);
    setMensaje(null);
    const { data: id, error } = await supabase.rpc('registrar_prestamo', {
      p_sentido: sentido,
      p_empresa: empresa.trim(),
      p_producto_id: producto.id,
      p_cantidad: cant,
      p_ubicacion_id: Number(bodega),
      p_fecha_devolucion: devolucion || null,
      p_contacto: contacto.trim() || null,
      p_autorizo: autorizo.trim() || null,
      p_nota: nota.trim() || null,
    });
    if (error) {
      setGuardando(false);
      return setMensaje({ ok: false, texto: error.message });
    }
    let avisoFirma = '';
    if (firma) {
      const r = await supabase.rpc('firmar_prestamo', { p_prestamo_id: id, p_firma: firma, p_firmo: firmo.trim() });
      if (r.error) avisoFirma = ` La firma no se pudo guardar (${r.error.message}).`;
    }
    setGuardando(false);
    setUltimo(Number(id));
    setMensaje({
      ok: true,
      texto:
        (sentido === 'SALIDA'
          ? `Préstamo registrado: salieron ${numero.format(cant)} ${und(producto.unidad_medida)} de ${producto.nombre} para ${empresa.trim()}.`
          : `Préstamo recibido: entraron ${numero.format(cant)} ${und(producto.unidad_medida)} de ${producto.nombre}. Queda pendiente devolverlo a ${empresa.trim()}.`) + avisoFirma,
    });
    setFirma(null);
    setFirmo('');
    setClaveFirma((k) => k + 1);
    setProducto(null);
    setCantidad('');
    setNota('');
    setDevolucion('');
    await onGuardado();
  }

  return (
    <section className="mt-4 rounded-xl border-2 border-tinta bg-white p-4">
      <h2 className="text-lg font-bold">{TEXTO[sentido].verbo}</h2>
      <p className="text-sm text-acero">{TEXTO[sentido].ayuda}</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-acero">{TEXTO[sentido].empresa} *</span>
          <input value={empresa} onChange={(e) => setEmpresa(e.target.value)} list="empresas-prestamo" className={CONTROL} />
          <datalist id="empresas-prestamo">
            {empresas.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-acero">Persona de contacto</span>
          <input value={contacto} onChange={(e) => setContacto(e.target.value)} className={CONTROL} />
        </label>
      </div>

      <div className="mt-3">
        <span className="mb-1 block text-xs font-semibold text-acero">Producto *</span>
        {producto ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-linea bg-concreto px-3 py-2">
            <span>
              <span className="font-mono text-xs">{producto.sku}</span> <b>{producto.nombre}</b>
              {existencia != null && (
                <span className="ml-2 text-sm text-acero">
                  · hay {numero.format(existencia)} {und(producto.unidad_medida)} en la bodega
                </span>
              )}
            </span>
            <button onClick={() => setProducto(null)} className="text-sm font-semibold underline">
              Cambiar
            </button>
          </div>
        ) : (
          <BuscadorProducto activo onElegir={setProducto} ayuda="Escanee, o escriba el código o parte del nombre" />
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-acero">Cantidad *</span>
          <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" className={`${CONTROL} text-right tabular-nums`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-acero">{sentido === 'SALIDA' ? 'Sale de la bodega' : 'Entra a la bodega'}</span>
          <select value={bodega} onChange={(e) => setBodega(e.target.value)} className={CONTROL}>
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-acero">Fecha para devolver</span>
          <input type="date" value={devolucion} onChange={(e) => setDevolucion(e.target.value)} className={CONTROL} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-acero">Autorizó</span>
          <input value={autorizo} onChange={(e) => setAutorizo(e.target.value)} className={CONTROL} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-acero">Descripción o nota</span>
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Para qué es, estado en que sale, etc." className={CONTROL} />
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <span className="mb-1 block text-xs font-semibold text-acero">
            {sentido === 'SALIDA' ? 'Firma de quien recibe' : 'Firma de quien entrega'} (opcional, sale en el acta)
          </span>
          <FirmaPad key={claveFirma} onCambio={setFirma} />
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-acero">Nombre de quien firma{firma ? ' *' : ''}</span>
          <input value={firmo} onChange={(e) => setFirmo(e.target.value)} className={CONTROL} />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={guardar} disabled={guardando} className={BOTON_PRINCIPAL}>
          {guardando ? 'Guardando…' : sentido === 'SALIDA' ? 'Registrar préstamo' : 'Registrar lo recibido'}
        </button>
        {mensaje && (
          <p className={`flex-1 rounded px-3 py-2 text-sm font-medium ${mensaje.ok ? 'bg-poli/20' : 'bg-alerta-suave text-alerta'}`} role="status">
            {mensaje.ok ? '✅ ' : '✖ '}
            {mensaje.texto}
          </p>
        )}
        {mensaje?.ok && ultimo != null && <BotonActa id={ultimo} />}
      </div>
    </section>
  );
}

// Descarga el acta del préstamo recién registrado
function BotonActa({ id }: { id: number }) {
  const [trabajando, setTrabajando] = useState(false);
  return (
    <button
      onClick={async () => {
        setTrabajando(true);
        const { data } = await supabase.from('v_prestamos').select('*').eq('id', id).maybeSingle();
        if (data) await actaDe({ ...(data as Prestamo), cantidad: Number(data.cantidad) });
        setTrabajando(false);
      }}
      disabled={trabajando}
      className={BOTON_SECUNDARIO}
    >
      {trabajando ? 'Generando…' : '📄 Descargar acta'}
    </button>
  );
}

function Fila({ p, ubicaciones, onCambio }: { p: Prestamo; ubicaciones: Opcion[]; onCambio: () => Promise<void> }) {
  const [abierto, setAbierto] = useState(false);
  const [forma, setForma] = useState<'PRODUCTO' | 'OTRA'>('PRODUCTO');
  const [cantidad, setCantidad] = useState(String(p.pendiente));
  const [bodega, setBodega] = useState(String(p.ubicacion_id ?? ubicaciones[0]?.id ?? ''));
  const [nota, setNota] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firmando, setFirmando] = useState(false);
  const [firma, setFirma] = useState<string | null>(null);
  const [firmo, setFirmo] = useState(p.contacto ?? '');

  async function guardarFirma() {
    if (!firma) return setError('Firme en el recuadro.');
    if (!firmo.trim()) return setError('Escriba el nombre de quien firma.');
    setTrabajando(true);
    setError(null);
    const { error } = await supabase.rpc('firmar_prestamo', { p_prestamo_id: p.id, p_firma: firma, p_firmo: firmo.trim() });
    setTrabajando(false);
    if (error) return setError(error.message);
    setFirmando(false);
    await onCambio();
  }

  const dias = useMemo(() => {
    if (!p.fecha_devolucion) return null;
    const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
    return Math.round((new Date(`${p.fecha_devolucion}T12:00:00`).getTime() - new Date(`${hoy}T12:00:00`).getTime()) / 86400e3);
  }, [p.fecha_devolucion]);

  async function devolver() {
    const cant = forma === 'OTRA' ? p.pendiente : leerMonto(cantidad);
    if (!Number.isFinite(cant) || cant <= 0) return setError('Escriba una cantidad mayor que cero.');
    if (cant > p.pendiente) return setError(`Solo quedan ${numero.format(p.pendiente)} pendientes.`);
    if (forma === 'OTRA' && !nota.trim()) return setError('Explique cómo se saldó (por ejemplo: "lo pagaron", "nos dieron otro producto").');
    setTrabajando(true);
    setError(null);
    const { error } = await supabase.rpc('devolver_prestamo', {
      p_prestamo_id: p.id,
      p_cantidad: cant,
      p_forma: forma,
      p_nota: nota.trim() || null,
      p_ubicacion_id: forma === 'PRODUCTO' ? Number(bodega) : null,
    });
    setTrabajando(false);
    if (error) return setError(error.message);
    setAbierto(false);
    await onCambio();
  }

  return (
    <li className={`rounded-lg border-2 bg-white ${p.vencido ? 'border-alerta' : 'border-linea'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="font-bold">
            {p.empresa}
            {p.contacto && <span className="font-normal text-acero"> · {p.contacto}</span>}
          </p>
          <p className="text-sm">
            <span className="font-mono text-xs">{p.sku}</span> {p.producto}: <b>{numero.format(p.pendiente)}</b> {und(p.unidad_medida)} pendientes
            {p.devuelto > 0 && <span className="text-acero"> (de {numero.format(p.cantidad)}; ya {numero.format(p.devuelto)} devueltos)</span>}
          </p>
          <p className="text-xs text-acero">
            {fechaCorta(p.fecha)}
            {p.ubicacion ? ` · ${p.ubicacion}` : ''}
            {p.autorizo ? ` · autorizó ${p.autorizo}` : ''}
            {p.registrado_por ? ` · registró ${p.registrado_por}` : ''}
            {p.nota ? ` · ${p.nota}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-semibold ${p.vencido ? 'text-alerta' : 'text-acero'}`}>
            {dias == null ? 'Sin fecha de devolución' : dias < 0 ? `Vencido hace ${-dias} días` : dias === 0 ? 'Vence hoy' : `Vence en ${dias} días`}
          </span>
          <button onClick={() => actaDe(p)} className="rounded-lg border border-linea px-3 py-2 text-sm font-semibold hover:border-tinta" title="Descargar el acta en PDF">
            📄 Acta{p.tiene_firma ? ' ✍' : ''}
          </button>
          {!p.tiene_firma && (
            <button onClick={() => setFirmando((v) => !v)} className="rounded-lg border border-linea px-3 py-2 text-sm font-semibold hover:border-tinta" aria-expanded={firmando}>
              ✍ Firmar
            </button>
          )}
          <button onClick={() => setAbierto((v) => !v)} className={BOTON_SECUNDARIO} aria-expanded={abierto}>
            {TEXTO[p.sentido].devolver}
          </button>
        </div>
      </div>

      {firmando && (
        <div className="grid gap-3 border-t border-linea bg-concreto/50 px-4 py-3 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-xs font-semibold text-acero">{p.sentido === 'SALIDA' ? 'Firma de quien recibe' : 'Firma de quien entrega'}</span>
            <FirmaPad onCambio={setFirma} />
          </div>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-acero">Nombre de quien firma *</span>
              <input value={firmo} onChange={(e) => setFirmo(e.target.value)} className={CONTROL} />
            </label>
            <div className="flex items-center gap-3">
              <button onClick={guardarFirma} disabled={trabajando} className={BOTON_PRINCIPAL}>
                Guardar firma
              </button>
              <button onClick={() => setFirmando(false)} className="font-semibold underline">
                Cancelar
              </button>
            </div>
            {error && !abierto && <p className="rounded bg-alerta-suave px-3 py-2 text-sm font-medium text-alerta">{error}</p>}
          </div>
        </div>
      )}

      {abierto && (
        <div className="space-y-3 border-t border-linea bg-concreto/50 px-4 py-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={forma === 'PRODUCTO'} onChange={() => setForma('PRODUCTO')} />
              Con el mismo producto {p.sentido === 'SALIDA' ? '(vuelve al inventario)' : '(sale del inventario)'}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={forma === 'OTRA'} onChange={() => setForma('OTRA')} />
              Saldado de otra forma (no mueve inventario)
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {forma === 'PRODUCTO' && (
              <>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-acero">Cantidad (pendiente {numero.format(p.pendiente)})</span>
                  <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" className={`${CONTROL} text-right tabular-nums`} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-acero">{p.sentido === 'SALIDA' ? 'Entra a la bodega' : 'Sale de la bodega'}</span>
                  <select value={bodega} onChange={(e) => setBodega(e.target.value)} className={CONTROL}>
                    {ubicaciones.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className={`block ${forma === 'OTRA' ? 'sm:col-span-3' : ''}`}>
              <span className="mb-1 block text-xs font-semibold text-acero">{forma === 'OTRA' ? 'Cómo se saldó *' : 'Nota'}</span>
              <input value={nota} onChange={(e) => setNota(e.target.value)} className={CONTROL} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={devolver} disabled={trabajando} className={BOTON_PRINCIPAL}>
              {trabajando ? 'Guardando…' : forma === 'OTRA' ? 'Cerrar como saldado' : 'Registrar devolución'}
            </button>
            <button onClick={() => setAbierto(false)} className="font-semibold underline">
              Cancelar
            </button>
            {error && <p className="flex-1 rounded bg-alerta-suave px-3 py-2 text-sm font-medium text-alerta">{error}</p>}
          </div>
        </div>
      )}
    </li>
  );
}
