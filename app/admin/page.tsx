'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Encabezado, { BOTON_ACENTO, BOTON_PRINCIPAL, BOTON_SECUNDARIO, CONTROL } from '@/components/Encabezado';
import { supabase } from '@/lib/supabase';
import { useSesion } from '@/lib/sesion';
import { cargarCatalogo, type ProductoBasico } from '@/lib/catalogo';
import { leerMonto, numero, pesos } from '@/lib/formato';
import { leerDocumento, leerImagenPegada, leerTextoPegado, type Lectura, type LineaLeida, type TipoDocumento } from '@/lib/registrar';
import { dejarArchivoPendiente, tomarPedidoPendiente } from '@/lib/archivoPendiente';
import { exportarExcel, exportarPdf, type Informe } from '@/lib/exportar';
import { useOrdenVoz } from '@/lib/voz/bus';

/* =====================================================================
   ADMINISTRACIÓN (solo el administrador)
   - ➕ Registrar: una sola puerta para PDF, Excel, CSV, fotos y texto pegado.
     Reconoce el documento, muestra lo leído para revisar y confirma.
   - Mercancía en tránsito: pedidos de Brasil por etapas; al nacionalizar
     pasan solos al inventario.
   - Archivo: los documentos originales, guardados en la nube.
   ===================================================================== */

type Pestana = 'registrar' | 'transito' | 'archivo';
type Estado = 'PEDIDO' | 'SALIO' | 'TRANSITO' | 'ADUANA' | 'NACIONALIZADO' | 'ANULADO';
interface Opcion {
  id: number;
  nombre: string;
}

const ETAPAS: { e: Estado; t: string }[] = [
  { e: 'PEDIDO', t: 'Pedido' },
  { e: 'SALIO', t: 'Salió de Brasil' },
  { e: 'TRANSITO', t: 'En tránsito' },
  { e: 'ADUANA', t: 'En aduana' },
  { e: 'NACIONALIZADO', t: 'Nacionalizado' },
];
const NOMBRE_ESTADO: Record<Estado, string> = {
  PEDIDO: 'Pedido',
  SALIO: 'Salió de Brasil',
  TRANSITO: 'En tránsito',
  ADUANA: 'En aduana',
  NACIONALIZADO: 'Nacionalizado',
  ANULADO: 'Anulado',
};
const TRANSPORTES = { MARITIMO: 'Marítimo', TERRESTRE: 'Terrestre', AEREO: 'Aéreo' } as const;
// Días aproximados de viaje desde Brasil, para calcular la llegada estimada (se pueden ajustar aquí)
const DIAS_VIAJE: Record<keyof typeof TRANSPORTES, number> = { MARITIMO: 35, TERRESTRE: 15, AEREO: 5 };
const sumarDias = (f: string, n: number) => {
  const d = new Date(`${f}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
// Llegada estimada: desde la salida de Brasil (o desde hoy) más los días del transporte
const etaCalculada = (transporte: string, salida: string | null | undefined) =>
  transporte in DIAS_VIAJE ? sumarDias(salida || hoyISO(), DIAS_VIAJE[transporte as keyof typeof TRANSPORTES]) : '';
const NOMBRE_TIPO: Record<TipoDocumento, string> = {
  TRANSITO: 'Pedido de Brasil (mercancía en tránsito)',
  LISTA: 'Lista de productos',
  CONTEO: 'Hoja de conteo físico',
  DESCONOCIDO: 'Sin identificar',
};

const hoyISO = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const diasHasta = (f: string | null) => (f ? Math.round((new Date(`${f}T12:00:00`).getTime() - new Date(`${hoyISO()}T12:00:00`).getTime()) / 86400e3) : null);
const fechaCorta = (f: string | null) => (f ? new Date(f.length === 10 ? `${f}T12:00:00` : f).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const compacto = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const nombreSeguro = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);

export default function Administracion() {
  const sesion = useSesion();
  const [pestana, setPestana] = useState<Pestana>('registrar');
  const [catalogo, setCatalogo] = useState<ProductoBasico[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Opcion[]>([]);
  const [foco, setFoco] = useState<Foco | null>(null);

  // Blaster: "nacionaliza el pedido 4521" o un cambio de etapa dicho por voz
  useOrdenVoz(['transito'], sesion.esAdmin, (_t, datos) => {
    setPestana('transito');
    setFoco({ ...(datos as Foco), vez: Date.now() });
  });

  useEffect(() => {
    if (!sesion.esAdmin) return;
    cargarCatalogo(true).then(setCatalogo);
    supabase
      .from('ubicaciones')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setUbicaciones((data ?? []) as Opcion[]));
    const v = new URLSearchParams(window.location.search).get('pestana');
    if (v === 'transito' || v === 'archivo') setPestana(v);
  }, [sesion.esAdmin]);

  if (!sesion.listo) return <p className="py-24 text-center text-acero">Cargando…</p>;
  if (!sesion.esAdmin)
    return (
      <main className="mx-auto max-w-3xl px-4 pt-6">
        <Encabezado titulo="Administración" />
        <p className="mt-6 rounded border border-alerta bg-alerta-suave px-4 py-3 font-medium text-alerta">Esta sección es solo para el administrador.</p>
      </main>
    );

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <Encabezado titulo="Administración" />
      <p className="mt-3 text-sm text-acero">Solo la ve el administrador. Aquí entra la información y se controla la mercancía que viene de Brasil.</p>

      <div className="mt-4 flex flex-wrap gap-1 rounded-lg border border-linea bg-white p-1" role="tablist">
        {(
          [
            ['registrar', '➕ Registrar'],
            ['transito', 'Mercancía en tránsito'],
            ['archivo', 'Archivo de documentos'],
          ] as const
        ).map(([k, t]) => (
          <button
            key={k}
            role="tab"
            aria-selected={pestana === k}
            onClick={() => setPestana(k)}
            className={`flex-1 rounded-md px-4 py-2 font-bold ${pestana === k ? 'bg-tinta text-white' : 'text-acero hover:text-tinta'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {pestana === 'registrar' && (
        <Registrar
          catalogo={catalogo}
          ubicaciones={ubicaciones}
          onCatalogo={() => cargarCatalogo(true).then(setCatalogo)}
          onVerTransito={() => setPestana('transito')}
        />
      )}
      {pestana === 'transito' && <Transito ubicaciones={ubicaciones} catalogo={catalogo} foco={foco} />}
      {pestana === 'archivo' && <Archivo />}
    </main>
  );
}

interface Foco {
  id: number;
  nacionalizar?: boolean;
  vez?: number;
}

/* ============================== ➕ REGISTRAR ============================== */

interface Tarjeta {
  id: number;
  lectura: Lectura;
  archivo: File | null;
  tipo: TipoDocumento;
  numero: string;
  proveedor: string;
  fechaPedido: string;
  fechaSalida: string;
  transporte: '' | keyof typeof TRANSPORTES;
  guia: string;
  transportador: string;
  eta: string;
  etaAuto: boolean;
  nota: string;
  ubicacion: string;
  lineas: LineaLeida[];
  duplicado: string | null;
  estado: 'revisar' | 'guardando' | 'listo';
  mensaje: { ok: boolean; texto: string } | null;
}

let secuencia = 0;

function Registrar({
  catalogo,
  ubicaciones,
  onCatalogo,
  onVerTransito,
}: {
  catalogo: ProductoBasico[];
  ubicaciones: Opcion[];
  onCatalogo: () => void;
  onVerTransito: () => void;
}) {
  const router = useRouter();
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [leyendo, setLeyendo] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [pegado, setPegado] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recientes, setRecientes] = useState<{ id: number; carpeta: string; numero: string | null; nombre_archivo: string; creado: string }[]>([]);
  const entrada = useRef<HTMLInputElement>(null);

  const cargarRecientes = useCallback(() => {
    supabase
      .from('documentos')
      .select('id, carpeta, numero, nombre_archivo, creado')
      .order('creado', { ascending: false })
      .limit(8)
      .then(({ data }) => setRecientes(data ?? []));
  }, []);
  useEffect(cargarRecientes, [cargarRecientes]);

  const porCodigo = useMemo(() => {
    const m = new Map<string, ProductoBasico>();
    catalogo.forEach((p) => {
      m.set(compacto(p.sku), p);
      m.set(compacto(p.codigo_barras), p);
    });
    return m;
  }, [catalogo]);

  // Revisa si el documento ya se había registrado (no duplicar)
  async function buscarDuplicado(l: Lectura, archivo: File | null): Promise<string | null> {
    if (archivo) {
      const { data } = await supabase.from('documentos').select('id, creado').eq('nombre_archivo', archivo.name).eq('tamano', archivo.size).limit(1);
      if (data?.length) return `Este archivo ya se registró el ${fechaCorta(data[0].creado)}.`;
    }
    if (l.tipo === 'TRANSITO' && l.encabezado.numero) {
      const { data } = await supabase.from('transitos').select('id, estado').ilike('numero', l.encabezado.numero).limit(1);
      if (data?.length) return `El pedido ${l.encabezado.numero} ya está registrado (${NOMBRE_ESTADO[data[0].estado as Estado].toLowerCase()}).`;
    }
    return null;
  }

  // Pedido armado desde Compras sugeridas (botón "Armar pedido a Brasil" en Informes)
  useEffect(() => {
    const lineas = tomarPedidoPendiente();
    if (!lineas?.length) return;
    agregar(
      {
        nombre: 'Pedido armado desde Compras sugeridas',
        tamano: 0,
        texto: lineas.map((l) => `${l.codigo}\t${l.descripcion}\t${l.cantidad}`).join('\n'),
        tipo: 'TRANSITO',
        encabezado: { numero: `PED-${hoyISO().replace(/-/g, '')}`, fecha: hoyISO() },
        lineas: lineas.map((l) => ({ codigo: l.codigo, descripcion: l.descripcion, cantidad: l.cantidad, valor: l.valor })),
        porOcr: false,
        avisos: ['Revise las cantidades, descargue el pedido en Excel o PDF para enviarlo a Brasil y luego regístrelo.'],
      },
      null
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function agregar(l: Lectura, archivo: File | null) {
    const duplicado = await buscarDuplicado(l, archivo);
    setTarjetas((t) => [
      {
        id: ++secuencia,
        lectura: l,
        archivo,
        tipo: l.tipo,
        numero: l.encabezado.numero ?? '',
        proveedor: 'Poliway Brasil',
        fechaPedido: l.encabezado.fecha ?? '',
        fechaSalida: '',
        transporte: '',
        guia: l.encabezado.guia ?? '',
        transportador: l.encabezado.transportador ?? '',
        eta: '',
        etaAuto: false,
        nota: '',
        ubicacion: ubicaciones[0] ? String(ubicaciones[0].id) : '',
        lineas: l.lineas,
        duplicado,
        estado: 'revisar',
        mensaje: null,
      },
      ...t,
    ]);
  }

  async function procesar(archivos: FileList | File[]) {
    setError(null);
    for (const f of Array.from(archivos)) {
      setLeyendo(`Leyendo ${f.name}…`);
      try {
        const l = await leerDocumento(f, catalogo, (t) => setLeyendo(`${f.name}: ${t}`));
        await agregar(l, f);
      } catch (e) {
        setError(`${f.name}: ${(e as Error).message}`);
      }
    }
    setLeyendo(null);
  }

  // Pegar con Ctrl+V: un pantallazo (se lee con OCR) o un texto o tabla
  useEffect(() => {
    const alPegar = async (e: ClipboardEvent) => {
      const destino = e.target as HTMLElement | null;
      if (destino && (destino.tagName === 'INPUT' || destino.tagName === 'TEXTAREA')) return;
      const img = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      if (img) {
        e.preventDefault();
        const blob = img.getAsFile();
        if (!blob) return;
        setLeyendo('Leyendo el pantallazo…');
        try {
          await agregar(await leerImagenPegada(blob, catalogo, (t) => setLeyendo(t)), new File([blob], `pantallazo-${Date.now()}.png`, { type: blob.type }));
        } catch (er) {
          setError((er as Error).message);
        }
        setLeyendo(null);
        return;
      }
      const texto = e.clipboardData?.getData('text') ?? '';
      if (texto.trim()) {
        e.preventDefault();
        await agregar(leerTextoPegado(texto, catalogo), null);
      }
    };
    window.addEventListener('paste', alPegar);
    return () => window.removeEventListener('paste', alPegar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogo, ubicaciones]);

  function cambiar(id: number, cambios: Partial<Tarjeta>) {
    setTarjetas((t) => t.map((x) => (x.id === id ? { ...x, ...cambios } : x)));
  }
  function cambiarLinea(id: number, i: number, cambios: Partial<LineaLeida>) {
    setTarjetas((t) => t.map((x) => (x.id === id ? { ...x, lineas: x.lineas.map((l, j) => (j === i ? { ...l, ...cambios } : l)) } : x)));
  }

  // Guarda el original en el archivo de la nube y deja su ficha
  async function archivar(t: Tarjeta, carpeta: 'TRANSITO' | 'LISTA' | 'CONTEO', numeroDoc: string | null, transitoId: number | null) {
    const contenido = t.archivo ?? new Blob([t.lectura.texto], { type: 'text/plain' });
    const nombre = t.archivo?.name ?? `texto-pegado-${Date.now()}.txt`;
    const ruta = `${carpeta}/${hoyISO().slice(0, 7)}/${Date.now()}-${nombreSeguro(nombre)}`;
    const subida = await supabase.storage.from('documentos').upload(ruta, contenido, { upsert: false });
    if (subida.error) return `No se pudo guardar el documento original (${subida.error.message}); el registro sí quedó.`;
    const { error } = await supabase.from('documentos').insert({
      carpeta,
      numero: numeroDoc,
      tercero: carpeta === 'TRANSITO' ? t.proveedor : null,
      nombre_archivo: nombre,
      tamano: contenido.size,
      ruta,
      transito_id: transitoId,
    });
    if (error && error.code !== '23505') return `El documento se subió, pero no se pudo fichar: ${error.message}`;
    return null;
  }

  async function registrarTransito(t: Tarjeta) {
    const numeroDoc = t.numero.trim().toUpperCase();
    const lineas = t.lineas.filter((l) => l.codigo.trim() && (l.cantidad ?? 0) > 0);
    if (!numeroDoc) return cambiar(t.id, { mensaje: { ok: false, texto: 'Escriba el número de la factura, remisión o pedido.' } });
    if (!lineas.length) return cambiar(t.id, { mensaje: { ok: false, texto: 'No hay líneas con código y cantidad.' } });
    cambiar(t.id, { estado: 'guardando', mensaje: null });
    try {
      const { data: rep } = await supabase.from('transitos').select('id').ilike('numero', numeroDoc).ilike('proveedor', t.proveedor.trim() || 'Poliway Brasil').limit(1);
      if (rep?.length) throw new Error(`El pedido ${numeroDoc} ya está registrado.`);
      // Los códigos que no existen se crean como productos nuevos
      const ids = new Map<string, string>();
      for (const l of lineas) {
        const c = l.codigo.trim().toUpperCase();
        const p = porCodigo.get(compacto(c));
        if (p) ids.set(c, p.id);
        else if (!ids.has(c)) {
          const { data, error } = await supabase.rpc('guardar_producto', { p_sku: c, p_nombre: l.descripcion.trim() || c });
          if (error) throw new Error(`No se pudo crear el producto ${c}: ${error.message}`);
          ids.set(c, data as string);
        }
      }
      const { data: tr, error } = await supabase
        .from('transitos')
        .insert({
          numero: numeroDoc,
          proveedor: t.proveedor.trim() || 'Poliway Brasil',
          fecha_pedido: t.fechaPedido || null,
          fecha_salida: t.fechaSalida || null,
          transporte: t.transporte || null,
          guia: t.guia.trim() || null,
          transportador: t.transportador.trim() || null,
          eta: t.eta || null,
          nota: t.nota.trim() || null,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.code === '23505' ? `El pedido ${numeroDoc} ya está registrado.` : error.message);
      const { error: e2 } = await supabase.from('transito_items').insert(
        lineas.map((l) => ({
          transito_id: tr.id,
          producto_id: ids.get(l.codigo.trim().toUpperCase()),
          codigo: l.codigo.trim().toUpperCase(),
          descripcion: l.descripcion.trim() || null,
          cantidad: l.cantidad,
          valor_unitario: l.valor ?? null,
        }))
      );
      if (e2) throw new Error(e2.message);
      await supabase.from('transito_historial').insert({ transito_id: tr.id, estado: 'PEDIDO', nota: `Registrado desde ${t.lectura.nombre}` });
      const aviso = await archivar(t, 'TRANSITO', numeroDoc, tr.id);
      const nuevos = lineas.filter((l) => !porCodigo.get(compacto(l.codigo))).length;
      cambiar(t.id, {
        estado: 'listo',
        mensaje: {
          ok: true,
          texto: `Pedido ${numeroDoc} registrado en tránsito con ${lineas.length} productos${nuevos ? ` (${nuevos} productos nuevos creados)` : ''}.${aviso ? ` ${aviso}` : ''}`,
        },
      });
      if (nuevos) onCatalogo();
      cargarRecientes();
    } catch (e) {
      cambiar(t.id, { estado: 'revisar', mensaje: { ok: false, texto: (e as Error).message } });
    }
  }

  async function crearConteo(t: Tarjeta) {
    if (!t.ubicacion) return cambiar(t.id, { mensaje: { ok: false, texto: 'Escoja la bodega.' } });
    const validas = t.lineas.filter((l) => porCodigo.get(compacto(l.codigo)) && l.cantidad != null && l.cantidad >= 0);
    if (!validas.length) return cambiar(t.id, { mensaje: { ok: false, texto: 'Ningún código coincide con el inventario.' } });
    cambiar(t.id, { estado: 'guardando', mensaje: null });
    const { data: c, error } = await supabase
      .from('conteos')
      .insert({ ubicacion_id: Number(t.ubicacion), nota: `Desde ➕ Registrar: ${t.lectura.nombre}` })
      .select('id')
      .single();
    if (error) return cambiar(t.id, { estado: 'revisar', mensaje: { ok: false, texto: error.message } });
    const unicos = new Map<string, number>();
    validas.forEach((l) => unicos.set(porCodigo.get(compacto(l.codigo))!.id, l.cantidad!));
    const { error: e2 } = await supabase
      .from('conteo_items')
      .upsert([...unicos].map(([producto_id, cantidad]) => ({ conteo_id: c.id, producto_id, cantidad, actualizado: new Date().toISOString() })));
    if (e2) return cambiar(t.id, { estado: 'revisar', mensaje: { ok: false, texto: e2.message } });
    const aviso = await archivar(t, 'CONTEO', null, null);
    const omitidos = t.lineas.length - validas.length;
    cambiar(t.id, {
      estado: 'listo',
      mensaje: { ok: true, texto: `Conteo #${c.id} creado con ${unicos.size} productos${omitidos ? `; ${omitidos} líneas omitidas porque el código no existe` : ''}. Revíselo y apruébelo en Conteo físico.${aviso ? ` ${aviso}` : ''}` },
    });
    cargarRecientes();
  }

  function abrirEnImportar(t: Tarjeta) {
    if (!t.archivo) return cambiar(t.id, { mensaje: { ok: false, texto: 'Para cargar una lista de productos, súbala como Excel o PDF.' } });
    archivar(t, 'LISTA', null, null).then(cargarRecientes);
    dejarArchivoPendiente(t.archivo);
    router.push('/importar');
  }

  function nuevoAMano() {
    agregar(
      { nombre: 'Pedido a mano', tamano: 0, texto: '', tipo: 'TRANSITO', encabezado: {}, lineas: [{ codigo: '', descripcion: '', cantidad: null, valor: null }], porOcr: false, avisos: [] },
      null
    );
  }

  return (
    <div className="mt-5 space-y-5">
      {/* Puerta única */}
      <section
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          if (e.dataTransfer.files.length) procesar(e.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed p-6 text-center transition ${arrastrando ? 'border-poli bg-poli/15' : 'border-linea bg-white'}`}
      >
        <p className="text-lg font-bold">Arrastre aquí facturas, remisiones, packing list, listas o conteos</p>
        <p className="mt-1 text-sm text-acero">PDF, Excel, CSV o fotos (varios a la vez). También puede pegar con Ctrl+V un pantallazo o una tabla copiada.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button onClick={() => entrada.current?.click()} className={BOTON_PRINCIPAL}>
            Escoger archivos
          </button>
          <button onClick={nuevoAMano} className={BOTON_SECUNDARIO}>
            + Pedido de Brasil a mano
          </button>
        </div>
        <input
          ref={entrada}
          type="file"
          multiple
          accept=".pdf,.xlsx,.xlsm,.csv,.txt,image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) procesar(e.target.files);
            e.target.value = '';
          }}
        />
        {leyendo && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-concreto px-4 py-2 text-sm font-semibold" role="status">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-poli" aria-hidden />
            {leyendo}
          </p>
        )}
        {error && <p className="mt-3 rounded bg-alerta-suave px-3 py-2 text-sm font-medium text-alerta">{error}</p>}
      </section>

      <details className="rounded-lg border border-linea bg-white p-4">
        <summary className="cursor-pointer font-semibold">📋 Pegar texto de un correo o de WhatsApp</summary>
        <textarea
          value={pegado}
          onChange={(e) => setPegado(e.target.value)}
          rows={5}
          placeholder={'Ej: Pedido 4522 de Poliway Brasil:\n392 pistón con uretano 4\n391 diafragma 6'}
          className={`${CONTROL} mt-3 font-mono text-sm`}
        />
        <button
          onClick={() => {
            if (pegado.trim()) agregar(leerTextoPegado(pegado, catalogo), null);
            setPegado('');
          }}
          className={`${BOTON_ACENTO} mt-2`}
        >
          Leer el texto
        </button>
      </details>

      {/* Lo leído, para revisar y confirmar */}
      {tarjetas.map((t) => (
        <section key={t.id} className={`rounded-xl border-2 bg-white ${t.estado === 'listo' ? 'border-linea opacity-90' : 'border-tinta'}`}>
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-linea px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-bold">📄 {t.lectura.nombre}</p>
              <p className="text-sm text-acero">
                {t.lineas.length} líneas leídas{t.lectura.porOcr ? ' con lector de imágenes (OCR)' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm">
                <span className="sr-only">¿Qué es este documento?</span>
                <select
                  value={t.tipo}
                  disabled={t.estado !== 'revisar'}
                  onChange={(e) => cambiar(t.id, { tipo: e.target.value as TipoDocumento, mensaje: null })}
                  className="rounded-lg border border-linea bg-white px-2 py-1.5 font-semibold"
                >
                  {(['TRANSITO', 'LISTA', 'CONTEO', 'DESCONOCIDO'] as const).map((k) => (
                    <option key={k} value={k}>
                      {NOMBRE_TIPO[k]}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => setTarjetas((x) => x.filter((y) => y.id !== t.id))} aria-label="Descartar" className="rounded px-2 text-xl leading-none text-acero hover:bg-concreto">
                ×
              </button>
            </div>
          </header>

          <div className="space-y-3 p-4">
            {t.duplicado && <p className="rounded bg-alerta-suave px-3 py-2 text-sm font-semibold text-alerta">✖ {t.duplicado}</p>}
            {t.lectura.avisos.map((a) => (
              <p key={a} className="rounded bg-poli/20 px-3 py-2 text-sm">
                ⚠ {a}
              </p>
            ))}

            {t.tipo === 'DESCONOCIDO' && (
              <div>
                <p className="font-semibold">¿Qué es este archivo?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(['TRANSITO', 'LISTA', 'CONTEO'] as const).map((k) => (
                    <button key={k} onClick={() => cambiar(t.id, { tipo: k })} className={BOTON_SECUNDARIO}>
                      {NOMBRE_TIPO[k]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {t.tipo === 'TRANSITO' && (
              <>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Campo etiqueta="Número de factura / remisión *">
                    <input value={t.numero} onChange={(e) => cambiar(t.id, { numero: e.target.value })} className={CONTROL} />
                  </Campo>
                  <Campo etiqueta="Proveedor">
                    <input value={t.proveedor} onChange={(e) => cambiar(t.id, { proveedor: e.target.value })} className={CONTROL} />
                  </Campo>
                  <Campo etiqueta="Fecha del documento">
                    <input type="date" value={t.fechaPedido} onChange={(e) => cambiar(t.id, { fechaPedido: e.target.value })} className={CONTROL} />
                  </Campo>
                  <Campo etiqueta="Salió de Brasil">
                    <input
                      type="date"
                      value={t.fechaSalida}
                      onChange={(e) =>
                        cambiar(t.id, {
                          fechaSalida: e.target.value,
                          ...(t.transporte && (t.etaAuto || !t.eta) ? { eta: etaCalculada(t.transporte, e.target.value), etaAuto: true } : {}),
                        })
                      }
                      className={CONTROL}
                    />
                  </Campo>
                  <Campo etiqueta={t.etaAuto && t.transporte ? `Llegada estimada (calculada: ${DIAS_VIAJE[t.transporte]} días)` : 'Llegada estimada'}>
                    <input type="date" value={t.eta} onChange={(e) => cambiar(t.id, { eta: e.target.value, etaAuto: false })} className={CONTROL} />
                  </Campo>
                  <Campo etiqueta="Transporte">
                    <select
                      value={t.transporte}
                      onChange={(e) => {
                        const tr = e.target.value as Tarjeta['transporte'];
                        cambiar(t.id, { transporte: tr, ...(tr && (t.etaAuto || !t.eta) ? { eta: etaCalculada(tr, t.fechaSalida), etaAuto: true } : {}) });
                      }}
                      className={CONTROL}
                    >
                      <option value="">—</option>
                      {Object.entries(TRANSPORTES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo etiqueta="Guía, BL o CRT">
                    <input value={t.guia} onChange={(e) => cambiar(t.id, { guia: e.target.value })} className={CONTROL} />
                  </Campo>
                  <Campo etiqueta="Transportador">
                    <input value={t.transportador} onChange={(e) => cambiar(t.id, { transportador: e.target.value })} className={CONTROL} />
                  </Campo>
                  <Campo etiqueta="Nota">
                    <input value={t.nota} onChange={(e) => cambiar(t.id, { nota: e.target.value })} className={CONTROL} />
                  </Campo>
                </div>
                <TablaLineas t={t} porCodigo={porCodigo} cambiarLinea={cambiarLinea} setTarjetas={setTarjetas} conValor modo="transito" />
                <Pie t={t}>
                  <button onClick={() => descargarPedido(t, porCodigo, 'excel')} className={BOTON_SECUNDARIO}>
                    📊 Pedido en Excel
                  </button>
                  <button onClick={() => descargarPedido(t, porCodigo, 'pdf')} className={BOTON_SECUNDARIO}>
                    📄 Pedido en PDF
                  </button>
                  {t.estado === 'listo' ? (
                    <button onClick={onVerTransito} className={BOTON_SECUNDARIO}>
                      Ver en Mercancía en tránsito →
                    </button>
                  ) : (
                    <button onClick={() => registrarTransito(t)} disabled={t.estado === 'guardando' || !!t.duplicado} className={BOTON_PRINCIPAL}>
                      {t.estado === 'guardando' ? 'Registrando…' : 'Registrar pedido en tránsito'}
                    </button>
                  )}
                </Pie>
              </>
            )}

            {t.tipo === 'CONTEO' && (
              <>
                <Campo etiqueta="Bodega que se contó">
                  <select value={t.ubicacion} onChange={(e) => cambiar(t.id, { ubicacion: e.target.value })} className={`${CONTROL} sm:w-72`}>
                    {ubicaciones.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </select>
                </Campo>
                <TablaLineas t={t} porCodigo={porCodigo} cambiarLinea={cambiarLinea} setTarjetas={setTarjetas} modo="conteo" />
                <Pie t={t}>
                  {t.estado === 'listo' ? (
                    <Link href="/conteo" className={BOTON_SECUNDARIO}>
                      Abrir Conteo físico →
                    </Link>
                  ) : (
                    <button onClick={() => crearConteo(t)} disabled={t.estado === 'guardando' || !!t.duplicado} className={BOTON_PRINCIPAL}>
                      {t.estado === 'guardando' ? 'Creando…' : 'Crear conteo con estas cantidades'}
                    </button>
                  )}
                </Pie>
              </>
            )}

            {t.tipo === 'LISTA' && (
              <>
                <p className="text-sm">
                  Es una lista de productos ({t.lineas.length} líneas). Se carga en <b>Importar</b>, donde se revisan códigos, existencias, costos y mínimos antes de
                  guardar.
                </p>
                <Pie t={t}>
                  <button onClick={() => abrirEnImportar(t)} disabled={!!t.duplicado} className={BOTON_PRINCIPAL}>
                    Abrir en Importar →
                  </button>
                </Pie>
              </>
            )}
          </div>
        </section>
      ))}

      {/* Últimos registros */}
      {recientes.length > 0 && (
        <section className="rounded-lg border border-linea bg-white">
          <h2 className="border-b border-linea px-4 py-3 font-bold">Últimos registros</h2>
          <ul className="divide-y divide-linea text-sm">
            {recientes.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>
                  <b>{r.carpeta === 'TRANSITO' ? 'Pedido de Brasil' : r.carpeta === 'CONTEO' ? 'Conteo' : 'Lista'}</b>
                  {r.numero ? ` ${r.numero}` : ''} · {r.nombre_archivo}
                </span>
                <span className="text-acero">{fechaCorta(r.creado)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// El pedido para enviar a Brasil: código, descripción y cantidad (sin valores en pesos)
async function descargarPedido(t: Tarjeta, porCodigo: Map<string, ProductoBasico>, formato: 'excel' | 'pdf') {
  type Fila = { codigo: string; descripcion: string; unidad: string; cantidad: number };
  const filas: Fila[] = t.lineas
    .filter((l) => l.codigo.trim() && (l.cantidad ?? 0) > 0)
    .map((l) => {
      const p = porCodigo.get(compacto(l.codigo));
      return { codigo: l.codigo.trim().toUpperCase(), descripcion: l.descripcion || p?.nombre || '', unidad: p?.unidad_medida ?? 'UND', cantidad: l.cantidad! };
    });
  const inf: Informe<Fila> = {
    titulo: `Pedido ${t.numero || ''} a ${t.proveedor || 'Poliway Brasil'}`.replace(/\s+/g, ' '),
    archivo: `pedido_${(t.numero || 'nuevo').replace(/[^\w-]+/g, '_')}`,
    detalle: [
      `Fecha: ${fechaCorta(t.fechaPedido || hoyISO())}`,
      t.transporte ? `Transporte: ${TRANSPORTES[t.transporte]}` : '',
      `${filas.length} referencias, ${numero.format(filas.reduce((s, f) => s + f.cantidad, 0))} unidades`,
    ].filter(Boolean),
    columnas: [
      { titulo: 'Código', ancho: 18, tipo: 'texto', valor: (f) => f.codigo },
      { titulo: 'Descripción', ancho: 50, tipo: 'texto', valor: (f) => f.descripcion },
      { titulo: 'Unidad', ancho: 8, tipo: 'texto', valor: (f) => f.unidad },
      { titulo: 'Cantidad', ancho: 10, tipo: 'numero', valor: (f) => f.cantidad },
    ],
    filas,
  };
  if (formato === 'excel') await exportarExcel(inf);
  else await exportarPdf(inf);
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-acero">{etiqueta}</span>
      {children}
    </label>
  );
}

function Pie({ t, children }: { t: Tarjeta; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-linea pt-3">
      {children}
      {t.mensaje && (
        <p className={`flex-1 rounded px-3 py-2 text-sm font-medium ${t.mensaje.ok ? 'bg-poli/20' : 'bg-alerta-suave text-alerta'}`} role="status">
          {t.mensaje.ok ? '✅ ' : '✖ '}
          {t.mensaje.texto}
        </p>
      )}
    </div>
  );
}

function TablaLineas({
  t,
  porCodigo,
  cambiarLinea,
  setTarjetas,
  conValor = false,
  modo,
}: {
  t: Tarjeta;
  porCodigo: Map<string, ProductoBasico>;
  cambiarLinea: (id: number, i: number, c: Partial<LineaLeida>) => void;
  setTarjetas: React.Dispatch<React.SetStateAction<Tarjeta[]>>;
  conValor?: boolean;
  modo: 'transito' | 'conteo';
}) {
  const bloqueado = t.estado !== 'revisar';
  const celda = 'w-full rounded border border-linea px-2 py-1.5 text-sm';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b-2 border-tinta text-left text-xs text-acero">
            <th className="py-2 pr-2 font-semibold">Código</th>
            <th className="py-2 pr-2 font-semibold">Descripción</th>
            <th className="w-24 py-2 pr-2 text-right font-semibold">{modo === 'conteo' ? 'Contado' : 'Cantidad'}</th>
            {conValor && <th className="w-32 py-2 pr-2 text-right font-semibold">Valor unitario</th>}
            <th className="py-2 pr-2 font-semibold">En el inventario</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {t.lineas.map((l, i) => {
            const p = porCodigo.get(compacto(l.codigo));
            return (
              <tr key={i} className="border-b border-linea align-top">
                <td className="py-1.5 pr-2">
                  <input value={l.codigo} disabled={bloqueado} onChange={(e) => cambiarLinea(t.id, i, { codigo: e.target.value })} className={`${celda} font-mono`} />
                </td>
                <td className="py-1.5 pr-2">
                  <input value={l.descripcion} disabled={bloqueado} onChange={(e) => cambiarLinea(t.id, i, { descripcion: e.target.value })} className={celda} />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    value={l.cantidad ?? ''}
                    disabled={bloqueado}
                    inputMode="decimal"
                    onChange={(e) => cambiarLinea(t.id, i, { cantidad: e.target.value.trim() ? leerMonto(e.target.value) : null })}
                    className={`${celda} text-right tabular-nums ${l.cantidad == null || !Number.isFinite(l.cantidad) ? 'border-alerta' : ''}`}
                  />
                </td>
                {conValor && (
                  <td className="py-1.5 pr-2">
                    <input
                      value={l.valor ?? ''}
                      disabled={bloqueado}
                      inputMode="decimal"
                      placeholder="opcional"
                      onChange={(e) => cambiarLinea(t.id, i, { valor: e.target.value.trim() ? leerMonto(e.target.value) : null })}
                      className={`${celda} text-right tabular-nums`}
                    />
                  </td>
                )}
                <td className="py-1.5 pr-2 text-xs">
                  {!l.codigo.trim() ? (
                    <span className="text-acero">—</span>
                  ) : p ? (
                    <span className="text-oro-oscuro">✔ {p.nombre}</span>
                  ) : modo === 'transito' ? (
                    <span className="font-semibold text-alerta">✖ No existe: se creará como producto nuevo</span>
                  ) : (
                    <span className="font-semibold text-alerta">✖ No existe: se omite</span>
                  )}
                </td>
                <td className="py-1.5">
                  {!bloqueado && (
                    <button
                      onClick={() => setTarjetas((x) => x.map((y) => (y.id === t.id ? { ...y, lineas: y.lineas.filter((_, j) => j !== i) } : y)))}
                      aria-label="Quitar línea"
                      className="px-1 text-lg leading-none text-acero hover:text-alerta"
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!bloqueado && (
        <button
          onClick={() => setTarjetas((x) => x.map((y) => (y.id === t.id ? { ...y, lineas: [...y.lineas, { codigo: '', descripcion: '', cantidad: null, valor: null }] } : y)))}
          className="mt-2 text-sm font-semibold text-oro-oscuro underline"
        >
          + Agregar línea
        </button>
      )}
      {conValor && t.lineas.some((l) => l.valor) && (
        <p className="mt-2 text-right text-sm">
          Valor del pedido: <b>{pesos.format(t.lineas.reduce((s, l) => s + (l.cantidad ?? 0) * (l.valor ?? 0), 0))}</b>
        </p>
      )}
    </div>
  );
}

/* ========================== MERCANCÍA EN TRÁNSITO ========================== */

interface ItemTransito {
  id: number;
  producto_id: string | null;
  codigo: string;
  descripcion: string | null;
  cantidad: number;
  valor_unitario: number | null;
  recibido: number | null;
  novedad: string | null;
}
interface Pedido {
  id: number;
  numero: string;
  proveedor: string;
  fecha_pedido: string | null;
  fecha_salida: string | null;
  transporte: keyof typeof TRANSPORTES | null;
  guia: string | null;
  transportador: string | null;
  eta: string | null;
  estado: Estado;
  nacionalizado: string | null;
  nota: string | null;
  creado: string;
  transito_items: ItemTransito[];
  transito_historial: { id: number; estado: string; fecha: string; nota: string | null }[];
}

function Transito({ ubicaciones, catalogo, foco }: { ubicaciones: Opcion[]; catalogo: ProductoBasico[]; foco: Foco | null }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [docs, setDocs] = useState<Record<number, string>>({});
  const [filtro, setFiltro] = useState<'activos' | 'cerrados' | 'todos'>('activos');
  const [abierto, setAbierto] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [{ data, error }, d] = await Promise.all([
      supabase.from('transitos').select('*, transito_items(*), transito_historial(*)').order('creado', { ascending: false }),
      supabase.from('documentos').select('transito_id, ruta').not('transito_id', 'is', null),
    ]);
    if (error) setError(error.message);
    setPedidos(
      ((data ?? []) as Pedido[]).map((p) => ({
        ...p,
        transito_items: [...p.transito_items].sort((a, b) => a.id - b.id).map((i) => ({ ...i, cantidad: Number(i.cantidad), valor_unitario: i.valor_unitario == null ? null : Number(i.valor_unitario), recibido: i.recibido == null ? null : Number(i.recibido) })),
        transito_historial: [...p.transito_historial].sort((a, b) => a.id - b.id),
      }))
    );
    setDocs(Object.fromEntries((d.data ?? []).map((x) => [x.transito_id, x.ruta])));
    setCargando(false);
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);
  // Lo que pida Blaster: abrir un pedido (y su nacionalización) y recargar
  useEffect(() => {
    if (!foco) return;
    cargar().then(() => {
      setAbierto(foco.id);
      setTimeout(() => document.getElementById(`pedido-${foco.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    });
  }, [foco, cargar]);

  const activos = pedidos.filter((p) => !['NACIONALIZADO', 'ANULADO'].includes(p.estado));
  const lista = filtro === 'activos' ? activos : filtro === 'cerrados' ? pedidos.filter((p) => ['NACIONALIZADO', 'ANULADO'].includes(p.estado)) : pedidos;
  const atrasados = activos.filter((p) => (diasHasta(p.eta) ?? 1) < 0);
  const unidades = activos.reduce((s, p) => s + p.transito_items.reduce((a, i) => a + i.cantidad, 0), 0);
  const proximo = [...activos].filter((p) => p.eta).sort((a, b) => a.eta!.localeCompare(b.eta!))[0];
  const nombreProducto = (id: string | null) => catalogo.find((p) => p.id === id)?.nombre;

  return (
    <div className="mt-5 space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato titulo="Pedidos en camino" valor={String(activos.length)} />
        <Dato titulo="Unidades en camino" valor={numero.format(unidades)} />
        <Dato titulo="Atrasados" valor={String(atrasados.length)} alerta={atrasados.length > 0} />
        <Dato titulo="Próxima llegada" valor={proximo ? `${proximo.numero} · ${fechaCorta(proximo.eta)}` : '—'} />
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border border-linea bg-white p-1 text-sm">
          {(
            [
              ['activos', `En camino (${activos.length})`],
              ['cerrados', 'Nacionalizados y anulados'],
              ['todos', 'Todos'],
            ] as const
          ).map(([k, t]) => (
            <button key={k} onClick={() => setFiltro(k)} className={`rounded-md px-3 py-1.5 font-semibold ${filtro === k ? 'bg-tinta text-white' : 'text-acero'}`}>
              {t}
            </button>
          ))}
        </div>
        <p className="text-sm text-acero">Para registrar un pedido nuevo, use ➕ Registrar.</p>
      </div>

      {error && <p className="rounded bg-alerta-suave px-3 py-2 text-sm text-alerta">{error}</p>}
      {cargando ? (
        <p className="py-8 text-center text-acero">Cargando…</p>
      ) : !lista.length ? (
        <p className="rounded-lg border border-linea bg-white p-6 text-center text-acero">{filtro === 'activos' ? 'No hay mercancía en camino.' : 'No hay pedidos.'}</p>
      ) : (
        lista.map((p) => (
          <PedidoTarjeta
            key={p.id}
            p={p}
            abierto={abierto === p.id}
            onAbrir={() => setAbierto(abierto === p.id ? null : p.id)}
            ubicaciones={ubicaciones}
            ruta={docs[p.id]}
            nombreProducto={nombreProducto}
            onCambio={cargar}
            nacionalizarYa={foco?.id === p.id && !!foco.nacionalizar ? foco.vez : undefined}
          />
        ))
      )}
    </div>
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

function PedidoTarjeta({
  p,
  abierto,
  onAbrir,
  ubicaciones,
  ruta,
  nombreProducto,
  onCambio,
  nacionalizarYa,
}: {
  p: Pedido;
  nacionalizarYa?: number;
  abierto: boolean;
  onAbrir: () => void;
  ubicaciones: Opcion[];
  ruta: string | undefined;
  nombreProducto: (id: string | null) => string | undefined;
  onCambio: () => Promise<void>;
}) {
  const [trabajando, setTrabajando] = useState(false);
  useEffect(() => {
    if (nacionalizarYa) setNacionalizar(true);
  }, [nacionalizarYa]);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [nacionalizar, setNacionalizar] = useState(false);
  const [bodega, setBodega] = useState(ubicaciones[0] ? String(ubicaciones[0].id) : '');
  const [recibidos, setRecibidos] = useState<Record<number, { recibido: string; novedad: string }>>({});
  const [anular, setAnular] = useState(false);
  const [edicion, setEdicion] = useState({ eta: p.eta ?? '', guia: p.guia ?? '', transportador: p.transportador ?? '', transporte: p.transporte ?? '' });

  const cerrado = p.estado === 'NACIONALIZADO' || p.estado === 'ANULADO';
  const dias = diasHasta(p.eta);
  const atrasado = !cerrado && dias != null && dias < 0;
  const unidades = p.transito_items.reduce((s, i) => s + i.cantidad, 0);
  const iActual = ETAPAS.findIndex((x) => x.e === p.estado);
  const siguiente = !cerrado && iActual >= 0 && iActual < 3 ? ETAPAS[iActual + 1] : null;
  const fechaDe = (e: string) => p.transito_historial.filter((h) => h.estado === e).at(-1)?.fecha ?? (e === 'PEDIDO' ? p.creado : null);

  async function avanzar(estado: Estado) {
    setTrabajando(true);
    setMensaje(null);
    const { error } = await supabase.rpc('avanzar_transito', { p_transito_id: p.id, p_estado: estado });
    if (!error && estado === 'SALIO' && !p.eta && p.transporte) {
      // Al salir de Brasil se calcula la llegada estimada si no la tenía
      await supabase.from('transitos').update({ eta: etaCalculada(p.transporte, hoyISO()) }).eq('id', p.id);
    }
    setTrabajando(false);
    if (error) return setMensaje({ ok: false, texto: error.message });
    setAnular(false);
    await onCambio();
  }

  async function guardarDatos() {
    setTrabajando(true);
    const { error } = await supabase
      .from('transitos')
      .update({ eta: edicion.eta || null, guia: edicion.guia.trim() || null, transportador: edicion.transportador.trim() || null, transporte: edicion.transporte || null })
      .eq('id', p.id);
    setTrabajando(false);
    setMensaje(error ? { ok: false, texto: error.message } : { ok: true, texto: 'Datos guardados.' });
    if (!error) await onCambio();
  }

  async function confirmarNacionalizacion() {
    if (!bodega) return setMensaje({ ok: false, texto: 'Escoja la bodega donde entra la mercancía.' });
    const datos: Record<string, { recibido: number; novedad: string }> = {};
    for (const it of p.transito_items) {
      const r = recibidos[it.id];
      const cant = r?.recibido?.trim() ? leerMonto(r.recibido) : it.cantidad;
      if (!Number.isFinite(cant) || cant < 0) return setMensaje({ ok: false, texto: `Revise la cantidad recibida de ${it.codigo}.` });
      datos[it.id] = { recibido: cant, novedad: r?.novedad ?? '' };
    }
    setTrabajando(true);
    setMensaje(null);
    const { data, error } = await supabase.rpc('nacionalizar_transito', { p_transito_id: p.id, p_ubicacion_id: Number(bodega), p_recibidos: datos });
    setTrabajando(false);
    if (error) return setMensaje({ ok: false, texto: error.message });
    setNacionalizar(false);
    setMensaje({ ok: true, texto: `Nacionalizado: ${data} productos pasaron al inventario.` });
    await onCambio();
  }

  async function verDocumento() {
    if (!ruta) return;
    const { data, error } = await supabase.storage.from('documentos').createSignedUrl(ruta, 120);
    if (error || !data) return setMensaje({ ok: false, texto: 'No se pudo abrir el documento.' });
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  return (
    <section id={`pedido-${p.id}`} className={`scroll-mt-4 rounded-xl border-2 bg-white ${atrasado ? 'border-alerta' : cerrado ? 'border-linea' : 'border-tinta'}`}>
      <button onClick={onAbrir} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={abierto}>
        <span className="min-w-0">
          <span className="block text-lg font-bold">
            {p.numero} <span className="text-sm font-normal text-acero">· {p.proveedor}</span>
          </span>
          <span className="text-sm text-acero">
            {p.transito_items.length} productos, {numero.format(unidades)} unidades
            {p.transporte ? ` · ${TRANSPORTES[p.transporte]}` : ''}
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className={`text-sm font-semibold ${atrasado ? 'text-alerta' : 'text-acero'}`}>
            {cerrado
              ? p.estado === 'NACIONALIZADO'
                ? `En inventario desde ${fechaCorta(p.nacionalizado)}`
                : 'Anulado'
              : dias == null
                ? 'Sin fecha de llegada'
                : dias < 0
                  ? `Atrasado ${-dias} días`
                  : dias === 0
                    ? 'Llega hoy'
                    : `Llega en ${dias} días (${fechaCorta(p.eta)})`}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              p.estado === 'NACIONALIZADO' ? 'bg-poli text-tinta' : p.estado === 'ANULADO' ? 'bg-linea text-acero' : 'bg-tinta text-white'
            }`}
          >
            {NOMBRE_ESTADO[p.estado]}
          </span>
        </span>
      </button>

      {/* Etapas */}
      <ol className="flex border-t border-linea px-2 py-3 text-center text-xs" aria-label="Etapas del pedido">
        {ETAPAS.map((x, i) => {
          const hecho = p.estado !== 'ANULADO' && i <= iActual;
          const f = fechaDe(x.e);
          return (
            <li key={x.e} className="relative flex-1 px-1">
              <span className={`mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-bold ${hecho ? 'border-tinta bg-tinta text-white' : 'border-linea bg-white text-acero'}`}>
                {hecho ? '✓' : i + 1}
              </span>
              <span className={hecho ? 'font-semibold' : 'text-acero'}>{x.t}</span>
              {hecho && f && <span className="block text-[11px] text-acero">{fechaCorta(f)}</span>}
            </li>
          );
        })}
      </ol>

      {abierto && (
        <div className="space-y-4 border-t border-linea p-4">
          {!cerrado && (
            <div className="flex flex-wrap gap-2">
              {siguiente && (
                <button onClick={() => avanzar(siguiente.e)} disabled={trabajando} className={BOTON_SECUNDARIO}>
                  Marcar: {siguiente.t.toLowerCase()}
                </button>
              )}
              <button onClick={() => setNacionalizar((v) => !v)} disabled={trabajando} className={BOTON_ACENTO}>
                Nacionalizar y pasar al inventario
              </button>
              {!anular ? (
                <button onClick={() => setAnular(true)} className="rounded-lg px-3 py-2 text-sm font-semibold text-alerta hover:bg-alerta-suave">
                  Anular pedido
                </button>
              ) : (
                <span className="flex items-center gap-2 text-sm">
                  ¿Seguro?
                  <button onClick={() => avanzar('ANULADO')} className="rounded bg-alerta px-3 py-1.5 font-semibold text-white">
                    Sí, anular
                  </button>
                  <button onClick={() => setAnular(false)} className="font-semibold underline">
                    No
                  </button>
                </span>
              )}
            </div>
          )}

          {nacionalizar && !cerrado && (
            <div className="rounded-lg border-2 border-poli bg-poli/10 p-3">
              <p className="font-bold">Nacionalizar: la mercancía pasa al inventario</p>
              <p className="text-sm text-acero">Revise cuánto llegó de cada producto. Si llegó de menos o con daños, cambie la cantidad y anote la novedad.</p>
              <label className="mt-2 block text-sm">
                <span className="font-semibold">Bodega donde entra: </span>
                <select value={bodega} onChange={(e) => setBodega(e.target.value)} className="rounded border border-linea bg-white px-2 py-1">
                  {ubicaciones.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-acero">
                    <th className="py-1">Producto</th>
                    <th className="py-1 text-right">Pedido</th>
                    <th className="w-24 py-1 text-right">Llegó</th>
                    <th className="py-1 pl-2">Novedad</th>
                  </tr>
                </thead>
                <tbody>
                  {p.transito_items.map((it) => (
                    <tr key={it.id} className="border-t border-linea/60">
                      <td className="py-1">
                        <span className="font-mono text-xs">{it.codigo}</span> {nombreProducto(it.producto_id) ?? it.descripcion}
                      </td>
                      <td className="py-1 text-right tabular-nums">{numero.format(it.cantidad)}</td>
                      <td className="py-1">
                        <input
                          value={recibidos[it.id]?.recibido ?? String(it.cantidad)}
                          onChange={(e) => setRecibidos((r) => ({ ...r, [it.id]: { recibido: e.target.value, novedad: r[it.id]?.novedad ?? '' } }))}
                          inputMode="decimal"
                          className="w-full rounded border border-linea bg-white px-2 py-1 text-right tabular-nums"
                          aria-label={`Cantidad que llegó de ${it.codigo}`}
                        />
                      </td>
                      <td className="py-1 pl-2">
                        <input
                          value={recibidos[it.id]?.novedad ?? ''}
                          onChange={(e) => setRecibidos((r) => ({ ...r, [it.id]: { recibido: r[it.id]?.recibido ?? String(it.cantidad), novedad: e.target.value } }))}
                          placeholder="Faltante, avería…"
                          className="w-full rounded border border-linea bg-white px-2 py-1"
                          aria-label={`Novedad de ${it.codigo}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex gap-2">
                <button onClick={confirmarNacionalizacion} disabled={trabajando} className={BOTON_PRINCIPAL}>
                  {trabajando ? 'Pasando al inventario…' : 'Confirmar nacionalización'}
                </button>
                <button onClick={() => setNacionalizar(false)} className={BOTON_SECUNDARIO}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {mensaje && (
            <p className={`rounded px-3 py-2 text-sm font-medium ${mensaje.ok ? 'bg-poli/20' : 'bg-alerta-suave text-alerta'}`} role="status">
              {mensaje.texto}
            </p>
          )}

          {/* Datos del envío */}
          <div className="grid gap-2 sm:grid-cols-4">
            <Campo etiqueta="Llegada estimada">
              <input type="date" value={edicion.eta} disabled={cerrado} onChange={(e) => setEdicion((x) => ({ ...x, eta: e.target.value }))} className={CONTROL} />
            </Campo>
            <Campo etiqueta="Transporte">
              <select
                value={edicion.transporte}
                disabled={cerrado}
                onChange={(e) => {
                  const tr = e.target.value as keyof typeof TRANSPORTES;
                  setEdicion((x) => ({ ...x, transporte: tr, eta: x.eta || (tr ? etaCalculada(tr, p.fecha_salida) : '') }));
                }}
                className={CONTROL}
              >
                <option value="">—</option>
                {Object.entries(TRANSPORTES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Guía, BL o CRT">
              <input value={edicion.guia} disabled={cerrado} onChange={(e) => setEdicion((x) => ({ ...x, guia: e.target.value }))} className={CONTROL} />
            </Campo>
            <Campo etiqueta="Transportador">
              <input value={edicion.transportador} disabled={cerrado} onChange={(e) => setEdicion((x) => ({ ...x, transportador: e.target.value }))} className={CONTROL} />
            </Campo>
          </div>
          {!cerrado && (
            <button onClick={guardarDatos} disabled={trabajando} className={BOTON_SECUNDARIO}>
              Guardar datos del envío
            </button>
          )}

          {/* Productos */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-tinta text-left text-xs text-acero">
                <th className="py-2">Código</th>
                <th className="py-2">Producto</th>
                <th className="py-2 text-right">Cantidad</th>
                <th className="py-2 text-right">Valor unitario</th>
                {p.estado === 'NACIONALIZADO' && <th className="py-2 text-right">Llegó</th>}
                {p.estado === 'NACIONALIZADO' && <th className="py-2 pl-2">Novedad</th>}
              </tr>
            </thead>
            <tbody>
              {p.transito_items.map((it) => (
                <tr key={it.id} className="border-b border-linea">
                  <td className="py-1.5 font-mono text-xs">{it.codigo}</td>
                  <td className="py-1.5">{nombreProducto(it.producto_id) ?? it.descripcion}</td>
                  <td className="py-1.5 text-right tabular-nums">{numero.format(it.cantidad)}</td>
                  <td className="py-1.5 text-right tabular-nums">{it.valor_unitario != null ? pesos.format(it.valor_unitario) : '—'}</td>
                  {p.estado === 'NACIONALIZADO' && (
                    <td className={`py-1.5 text-right tabular-nums ${it.recibido != null && it.recibido < it.cantidad ? 'font-bold text-alerta' : ''}`}>{numero.format(it.recibido ?? 0)}</td>
                  )}
                  {p.estado === 'NACIONALIZADO' && <td className="py-1.5 pl-2 text-acero">{it.novedad ?? ''}</td>}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
            <div>
              <p className="font-semibold">Historial</p>
              <ul className="text-acero">
                {p.transito_historial.map((h) => (
                  <li key={h.id}>
                    {fechaCorta(h.fecha)}: {NOMBRE_ESTADO[h.estado as Estado] ?? h.estado}
                    {h.nota ? ` · ${h.nota}` : ''}
                  </li>
                ))}
              </ul>
            </div>
            {ruta && (
              <button onClick={verDocumento} className={BOTON_SECUNDARIO}>
                📎 Ver documento original
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* ============================ ARCHIVO DE DOCUMENTOS ============================ */

function Archivo() {
  const [docs, setDocs] = useState<{ id: number; carpeta: string; numero: string | null; tercero: string | null; nombre_archivo: string; tamano: number; ruta: string; creado: string }[]>([]);
  const [carpeta, setCarpeta] = useState('');
  const [texto, setTexto] = useState('');
  const [quitar, setQuitar] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = useCallback(() => {
    supabase
      .from('documentos')
      .select('id, carpeta, numero, tercero, nombre_archivo, tamano, ruta, creado')
      .order('creado', { ascending: false })
      .then(({ data }) => setDocs(data ?? []));
  }, []);
  useEffect(cargar, [cargar]);

  const CARPETAS: Record<string, string> = { TRANSITO: 'Pedidos de Brasil', LISTA: 'Listas de productos', CONTEO: 'Conteos', OTRO: 'Otros' };
  const q = texto.trim().toLowerCase();
  const lista = docs.filter((d) => (!carpeta || d.carpeta === carpeta) && (!q || `${d.numero ?? ''} ${d.nombre_archivo} ${d.tercero ?? ''}`.toLowerCase().includes(q)));

  async function ver(ruta: string) {
    const { data, error } = await supabase.storage.from('documentos').createSignedUrl(ruta, 120);
    if (error || !data) return setMensaje('No se pudo abrir el documento.');
    window.open(data.signedUrl, '_blank', 'noopener');
  }
  async function borrar(id: number, ruta: string) {
    await supabase.storage.from('documentos').remove([ruta]);
    const { error } = await supabase.from('documentos').delete().eq('id', id);
    setQuitar(null);
    setMensaje(error ? error.message : 'Documento quitado del archivo.');
    cargar();
  }

  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap gap-2">
        <select value={carpeta} onChange={(e) => setCarpeta(e.target.value)} className={`${CONTROL} sm:w-60`} aria-label="Carpeta">
          <option value="">Todas las carpetas ({docs.length})</option>
          {Object.entries(CARPETAS).map(([k, v]) => (
            <option key={k} value={k}>
              {v} ({docs.filter((d) => d.carpeta === k).length})
            </option>
          ))}
        </select>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por número o nombre" className={`${CONTROL} sm:flex-1`} />
      </div>
      {mensaje && <p className="rounded bg-poli/20 px-3 py-2 text-sm">{mensaje}</p>}
      {!lista.length ? (
        <p className="rounded-lg border border-linea bg-white p-6 text-center text-acero">Todavía no hay documentos archivados. Se guardan solos al registrar en ➕ Registrar.</p>
      ) : (
        <ul className="divide-y divide-linea rounded-lg border border-linea bg-white">
          {lista.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold">
                  {CARPETAS[d.carpeta]}
                  {d.numero ? ` · ${d.numero}` : ''}
                </span>
                <span className="block truncate text-acero">
                  {d.nombre_archivo} · {(d.tamano / 1024).toFixed(0)} KB · {fechaCorta(d.creado)}
                </span>
              </span>
              <span className="flex gap-2">
                <button onClick={() => ver(d.ruta)} className="rounded border border-linea px-3 py-1.5 font-semibold hover:border-tinta">
                  Ver
                </button>
                {quitar === d.id ? (
                  <button onClick={() => borrar(d.id, d.ruta)} className="rounded bg-alerta px-3 py-1.5 font-semibold text-white">
                    Confirmar
                  </button>
                ) : (
                  <button onClick={() => setQuitar(d.id)} className="rounded px-3 py-1.5 font-semibold text-alerta hover:bg-alerta-suave">
                    Quitar
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
