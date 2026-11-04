'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decirAlAsistente, useOrdenVoz } from '@/lib/voz/bus';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { exportarExcel, exportarPdf, textoCelda, type Columna, type Informe } from '@/lib/exportar';
import { cargarCatalogo } from '@/lib/catalogo';
import { dejarPedidoPendiente } from '@/lib/archivoPendiente';
import { tokenSesion, useSesion } from '@/lib/sesion';
import Marca from '@/components/Marca';

/* ----------------------------- Tipos ----------------------------- */

type Vista = 'movimientos' | 'inventario' | 'compras' | 'consumo';

interface FilaInventario {
  sku: string;
  nombre: string;
  categoria: string | null;
  ubicacion: string | null;
  cantidad: number;
  unidad_medida: string;
  stock_minimo: number;
  bajo_minimo: boolean;
  valor_total: number;
  costo_unitario: number | null;
  producto_id?: string;
}

interface FilaMovimiento {
  id: string;
  fecha: string;
  tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
  sku: string;
  producto: string;
  categoria: string | null;
  unidad_medida: string;
  cantidad: number;
  saldo_resultante: number;
  valor: number;
  ubicacion: string | null;
  destino: 'FUNCIONARIO' | 'CLIENTE' | null;
  funcionario: string | null;
  area: string | null;
  cliente: string | null;
  proveedor: string | null;
  documento_ref: string | null;
  nota: string | null;
  registrado_por: string | null;
  equipo: string | null;
  tiene_firma: boolean;
}

interface FilaCompra {
  sku: string;
  nombre: string;
  categoria: string | null;
  unidad_medida: string;
  existencia: number;
  minimo: number;
  sugerido: number;
  costo: number;
  valor: number;
  enCamino?: number;
}

interface FilaConsumo {
  sku: string;
  producto: string;
  unidad_medida: string;
  despachos: number;
  cantidad: number;
  valor: number;
}

const UNIDADES: Record<string, string> = { UND: 'und', M: 'm', M2: 'm²', KG: 'kg', ROLLO: 'rollos' };
const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });

const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const haceDias = (d: number) => {
  const f = new Date();
  f.setDate(f.getDate() - d);
  return f.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
};
const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

function estadoDe(f: FilaInventario) {
  if (f.cantidad <= 0) return 'Sin existencia';
  if (f.bajo_minimo) return 'Bajo mínimo';
  return 'Normal';
}

function entregadoA(m: FilaMovimiento) {
  const firma = m.tiene_firma ? ' (firmó)' : '';
  if (m.tipo === 'ENTRADA') return m.proveedor ? `Proveedor: ${m.proveedor}` : '';
  if (m.tipo === 'AJUSTE') return m.nota ?? 'Ajuste';
  if (m.destino === 'FUNCIONARIO') return `${m.funcionario ?? ''}${firma}`;
  if (m.destino === 'CLIENTE') return m.cliente ? `Cliente: ${m.cliente}${m.equipo ? `, equipo ${m.equipo}` : ''}${firma}` : '';
  return '';
}

const TIPO_TEXTO = { ENTRADA: 'Entrada', SALIDA: 'Salida', AJUSTE: 'Ajuste' } as const;

/* Columnas de cada informe: las mismas para la pantalla, Excel y PDF */
const COL_INVENTARIO: Columna<FilaInventario>[] = [
  { titulo: 'SKU', ancho: 22, tipo: 'texto', valor: (f) => f.sku },
  { titulo: 'Producto', ancho: 38, tipo: 'texto', valor: (f) => f.nombre },
  { titulo: 'Categoría', ancho: 22, tipo: 'texto', valor: (f) => f.categoria ?? '' },
  { titulo: 'Ubicación', ancho: 18, tipo: 'texto', valor: (f) => f.ubicacion ?? 'Sin movimientos' },
  { titulo: 'Existencia', ancho: 11, tipo: 'numero', valor: (f) => f.cantidad },
  { titulo: 'Unidad', ancho: 8, tipo: 'texto', valor: (f) => UNIDADES[f.unidad_medida] ?? f.unidad_medida },
  { titulo: 'Mínimo', ancho: 9, tipo: 'numero', valor: (f) => f.stock_minimo },
  { titulo: 'Estado', ancho: 14, tipo: 'texto', valor: (f) => estadoDe(f) },
  { titulo: 'Costo unitario', ancho: 14, tipo: 'moneda', valor: (f) => f.costo_unitario ?? (f.cantidad > 0 ? f.valor_total / f.cantidad : 0) },
  { titulo: 'Valor total', ancho: 15, tipo: 'moneda', valor: (f) => f.valor_total },
];

const COL_COMPRAS: Columna<FilaCompra>[] = [
  { titulo: 'SKU', ancho: 20, tipo: 'texto', valor: (f) => f.sku },
  { titulo: 'Producto', ancho: 38, tipo: 'texto', valor: (f) => f.nombre },
  { titulo: 'Categoría', ancho: 20, tipo: 'texto', valor: (f) => f.categoria ?? '' },
  { titulo: 'Existencia', ancho: 11, tipo: 'numero', valor: (f) => f.existencia },
  { titulo: 'Mínimo', ancho: 9, tipo: 'numero', valor: (f) => f.minimo },
  { titulo: 'Pedir', ancho: 9, tipo: 'numero', valor: (f) => f.sugerido },
  { titulo: 'Unidad', ancho: 8, tipo: 'texto', valor: (f) => UNIDADES[f.unidad_medida] ?? f.unidad_medida },
  { titulo: 'Costo unitario', ancho: 14, tipo: 'moneda', valor: (f) => f.costo },
  { titulo: 'Valor estimado', ancho: 15, tipo: 'moneda', valor: (f) => f.valor },
];

// Lo que ya viene en camino desde Brasil (solo administrador)
const COL_EN_CAMINO: Columna<FilaCompra> = { titulo: 'En camino', ancho: 10, tipo: 'numero', valor: (f) => f.enCamino ?? 0 };

const COL_CONSUMO: Columna<FilaConsumo>[] = [
  { titulo: 'SKU', ancho: 22, tipo: 'texto', valor: (f) => f.sku },
  { titulo: 'Producto', ancho: 42, tipo: 'texto', valor: (f) => f.producto },
  { titulo: 'Despachos', ancho: 11, tipo: 'numero', valor: (f) => f.despachos },
  { titulo: 'Cantidad', ancho: 11, tipo: 'numero', valor: (f) => f.cantidad },
  { titulo: 'Unidad', ancho: 8, tipo: 'texto', valor: (f) => UNIDADES[f.unidad_medida] ?? f.unidad_medida },
  { titulo: 'Valor', ancho: 15, tipo: 'moneda', valor: (f) => f.valor },
];

const COL_MOVIMIENTOS: Columna<FilaMovimiento>[] = [
  { titulo: 'Fecha', ancho: 16, tipo: 'fecha', valor: (m) => m.fecha },
  { titulo: 'Tipo', ancho: 9, tipo: 'texto', valor: (m) => TIPO_TEXTO[m.tipo] },
  { titulo: 'SKU', ancho: 18, tipo: 'texto', valor: (m) => m.sku },
  { titulo: 'Producto', ancho: 30, tipo: 'texto', valor: (m) => m.producto },
  { titulo: 'Cantidad', ancho: 10, tipo: 'numero', valor: (m) => (m.tipo === 'SALIDA' ? -m.cantidad : m.cantidad) },
  { titulo: 'Unidad', ancho: 8, tipo: 'texto', valor: (m) => UNIDADES[m.unidad_medida] ?? m.unidad_medida },
  { titulo: 'Saldo', ancho: 9, tipo: 'numero', valor: (m) => m.saldo_resultante },
  { titulo: 'Entregado a / origen', ancho: 26, tipo: 'texto', valor: (m) => entregadoA(m) },
  { titulo: 'Área', ancho: 16, tipo: 'texto', valor: (m) => m.area ?? '' },
  { titulo: 'Documento', ancho: 12, tipo: 'texto', valor: (m) => m.documento_ref ?? '' },
  { titulo: 'Entregó / registró', ancho: 20, tipo: 'texto', valor: (m) => m.registrado_por ?? '' },
];

/* ============================== Página ============================== */

export default function Informes() {
  const router = useRouter();
  const [usuario, setUsuario] = useState('');
  const [vista, setVista] = useState<Vista>('movimientos');
  // Permite abrir una pestaña directo, por ejemplo desde el aviso de stock: /informes?vista=compras
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('vista');
    if (v === 'compras' || v === 'inventario' || v === 'consumo' || v === 'movimientos') setVista(v);
  }, []);
  const [cargando, setCargando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const ultimaCarga = useRef(0);
  const [cargadas, setCargadas] = useState(0);
  const [descargaPendiente, setDescargaPendiente] = useState<'pdf' | 'excel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState<'' | 'excel' | 'pdf'>('');
  const sesion = useSesion();
  const [correo, setCorreo] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);

  async function enviarAlerta() {
    setEnviandoCorreo(true);
    setCorreo(null);
    try {
      const r = await fetch('/api/alertas', { method: 'POST', headers: { Authorization: `Bearer ${await tokenSesion()}` } });
      const d = await r.json().catch(() => ({}));
      setCorreo(
        r.ok
          ? { ok: true, texto: `Correo enviado a ${(d.destinos ?? []).join(', ')} con ${d.productos} productos.` }
          : { ok: false, texto: d.error ?? 'No se pudo enviar el correo.' }
      );
    } catch {
      setCorreo({ ok: false, texto: 'No se pudo conectar con el servidor.' });
    }
    setEnviandoCorreo(false);
  }

  const [inventario, setInventario] = useState<FilaInventario[]>([]);
  const [costos, setCostos] = useState<Record<string, number>>({});
  const [movimientos, setMovimientos] = useState<FilaMovimiento[]>([]);

  // Filtros
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(hoyISO());
  const [tipo, setTipo] = useState<'' | 'ENTRADA' | 'SALIDA'>('');
  const [area, setArea] = useState('');
  const [funcionario, setFuncionario] = useState('');
  const [cliente, setCliente] = useState('');
  const [texto, setTexto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [estado, setEstado] = useState<'' | 'alerta' | 'con'>('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login');
      else setUsuario(data.session.user.email ?? '');
    });
  }, [router]);

  const cargar = useCallback(async () => {
    const turno = ++ultimaCarga.current; // si llega una carga más nueva, esta se descarta
    setCargando(true);
    setError(null);
    if (vista === 'inventario' || vista === 'compras') {
      const catalogo = await cargarCatalogo(true);
      setCostos(Object.fromEntries(catalogo.map((p) => [p.sku, p.costo_unitario])));
      const { data, error } = await supabase.from('v_inventario').select('*').order('nombre');
      if (turno !== ultimaCarga.current) return;
      if (error) setError(`No se pudo leer el inventario: ${error.message}`);
      setInventario(
        (data ?? []).map((f) => ({
          ...f,
          cantidad: Number(f.cantidad ?? 0),
          stock_minimo: Number(f.stock_minimo ?? 0),
          valor_total: Number(f.valor_total ?? 0),
        }))
      );
    } else {
      // El rango de fechas va en hora de Colombia (UTC-5)
      const { data, error } = await supabase
        .from('v_movimientos')
        .select('*')
        .gte('fecha', `${desde}T00:00:00-05:00`)
        .lte('fecha', `${hasta}T23:59:59-05:00`)
        .order('fecha', { ascending: false })
        .limit(5000);
      if (turno !== ultimaCarga.current) return;
      if (error) setError(`No se pudieron leer los movimientos: ${error.message}`);
      setMovimientos(
        (data ?? []).map((m) => ({
          ...m,
          cantidad: Number(m.cantidad ?? 0),
          saldo_resultante: Number(m.saldo_resultante ?? 0),
          valor: Number(m.valor ?? 0),
          tiene_firma: !!m.tiene_firma,
        }))
      );
    }
    setCargando(false);
    setCargadas((n) => n + 1);
  }, [vista, desde, hasta, recarga]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cargar();
  }, [cargar]);

  /* ---------- Informes por voz (asistente Blaster) ---------- */
  useOrdenVoz(['informe'], true, (_t, datos) => {
    const d = datos as {
      vista: Vista;
      formato: 'pdf' | 'excel' | null;
      categoria: string | null;
      desde: string | null;
      hasta: string | null;
      tipo: 'ENTRADA' | 'SALIDA' | null;
      funcionario: string | null;
      area: string | null;
      cliente: string | null;
      estado: '' | 'alerta' | 'con';
    };
    setVista(d.vista);
    setCategoria(d.categoria ?? '');
    if (d.desde) setDesde(d.desde);
    if (d.hasta) setHasta(d.hasta);
    setTipo(d.vista === 'movimientos' ? d.tipo ?? '' : '');
    setFuncionario(d.funcionario ?? '');
    setArea(d.area ?? '');
    setCliente(d.cliente ?? '');
    setEstado(d.estado ?? '');
    setTexto('');
    setDescargaPendiente(d.formato);
    setRecarga((n) => n + 1); // vuelve a leer los datos con los filtros nuevos
  });

  /* ------------------------- Filtros locales ------------------------- */

  const q = texto.trim().toLowerCase();
  const movFiltrados = useMemo(
    () =>
      movimientos.filter(
        (m) =>
          (!tipo || m.tipo === tipo) &&
          (!area || m.area === area) &&
          (!funcionario || m.funcionario === funcionario) &&
          (!cliente || m.cliente === cliente) &&
          (!categoria || (m.categoria ?? 'Sin categoría') === categoria) &&
          (!q || `${m.sku} ${m.producto}`.toLowerCase().includes(q))
      ),
    [movimientos, tipo, area, funcionario, cliente, categoria, q]
  );
  const invFiltrado = useMemo(
    () =>
      inventario.filter(
        (f) =>
          (!categoria || (f.categoria ?? 'Sin categoría') === categoria) &&
          (estado !== 'alerta' || f.bajo_minimo || f.cantidad <= 0) &&
          (estado !== 'con' || f.cantidad > 0) &&
          (!q || `${f.sku} ${f.nombre}`.toLowerCase().includes(q))
      ),
    [inventario, categoria, estado, q]
  );

  const opciones = (lista: (string | null)[]) => [...new Set(lista.filter((x): x is string => !!x))].sort();
  const areas = useMemo(() => opciones(movimientos.map((m) => m.area)), [movimientos]);
  const funcionarios = useMemo(() => opciones(movimientos.map((m) => m.funcionario)), [movimientos]);
  const clientes = useMemo(() => opciones(movimientos.map((m) => m.cliente)), [movimientos]);
  // Las categorías salen del catálogo, para que estén disponibles en todas las pestañas
  const [categorias, setCategorias] = useState<string[]>([]);
  useEffect(() => {
    supabase
      .from('categorias')
      .select('nombre')
      .order('nombre')
      .then(({ data }) => setCategorias([...(data ?? []).map((c) => c.nombre as string), 'Sin categoría']));
  }, []);
  const textoCategoria = categoria ? `Categoría: ${categoria}` : 'Todas las categorías';

  // Compras sugeridas: productos con mínimo definido cuya existencia total llegó al mínimo.
  // Se sugiere pedir hasta completar el doble del mínimo.
  // Mercancía en tránsito por producto (solo la recibe el administrador)
  const [enCamino, setEnCamino] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!sesion.esAdmin) return;
    supabase
      .from('v_transito_producto')
      .select('producto_id, en_transito')
      .then(({ data }) => setEnCamino(Object.fromEntries((data ?? []).map((t) => [t.producto_id, Number(t.en_transito)]))));
  }, [sesion.esAdmin]);

  const compras = useMemo<FilaCompra[]>(() => {
    const porSku = new Map<string, FilaCompra>();
    inventario.forEach((f) => {
      const x = porSku.get(f.sku) ?? {
        sku: f.sku, nombre: f.nombre, categoria: f.categoria, unidad_medida: f.unidad_medida,
        existencia: 0, minimo: f.stock_minimo, sugerido: 0, costo: costos[f.sku] ?? 0, valor: 0,
        enCamino: f.producto_id ? enCamino[f.producto_id] ?? 0 : 0,
      };
      x.existencia += f.cantidad;
      porSku.set(f.sku, x);
    });
    return [...porSku.values()]
      .filter((x) => x.minimo > 0 && x.existencia <= x.minimo && (!categoria || (x.categoria ?? 'Sin categoría') === categoria))
      .map((x) => {
        // Lo que ya viene en camino se descuenta para no pedirlo dos veces
        const bruto = Math.max(0, x.minimo * 2 - x.existencia - (x.enCamino ?? 0));
        const sugerido = ['M', 'M2', 'KG'].includes(x.unidad_medida) ? Math.round(bruto * 100) / 100 : Math.ceil(bruto);
        return { ...x, sugerido, valor: sugerido * x.costo };
      })
      .sort((a, b) => a.existencia / a.minimo - b.existencia / b.minimo);
  }, [inventario, costos, categoria, enCamino]);

  // Consumo: solo salidas del período
  const salidas = useMemo(() => movFiltrados.filter((m) => m.tipo === 'SALIDA'), [movFiltrados]);
  const consumo = useMemo<FilaConsumo[]>(() => {
    const porSku = new Map<string, FilaConsumo>();
    salidas.forEach((m) => {
      const x = porSku.get(m.sku) ?? { sku: m.sku, producto: m.producto, unidad_medida: m.unidad_medida, despachos: 0, cantidad: 0, valor: 0 };
      x.despachos += 1;
      x.cantidad += m.cantidad;
      x.valor += m.valor;
      porSku.set(m.sku, x);
    });
    return [...porSku.values()].sort((a, b) => b.valor - a.valor || b.cantidad - a.cantidad);
  }, [salidas]);

  // Los valores en pesos solo los ve el administrador
  const verPlata = sesion.esAdmin;
  const resumen = useMemo(() => {
    const filas = calcularResumen();
    return verPlata ? filas : filas.filter((r) => !/valor/i.test(r.etiqueta)).map((r) => ({ ...r, valor: r.valor.replace(/\s*\(.*\)$/, '') }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, invFiltrado, movFiltrados, compras, consumo, salidas, verPlata]);
  function calcularResumen() {
    if (vista === 'compras') {
      return [
        { etiqueta: 'Productos por pedir', valor: String(compras.length) },
        { etiqueta: 'Unidades sugeridas', valor: numero.format(compras.reduce((s, c) => s + c.sugerido, 0)) },
        { etiqueta: 'Valor estimado sin IVA', valor: pesos.format(compras.reduce((s, c) => s + c.valor, 0)) },
      ];
    }
    if (vista === 'consumo') {
      return [
        { etiqueta: 'Despachos', valor: String(salidas.length) },
        { etiqueta: 'Productos distintos', valor: String(consumo.length) },
        { etiqueta: 'Valor consumido', valor: pesos.format(salidas.reduce((s, m) => s + m.valor, 0)) },
      ];
    }
    if (vista === 'inventario') {
      const refs = new Set(invFiltrado.map((f) => f.sku)).size;
      return [
        { etiqueta: 'Referencias', valor: String(refs) },
        { etiqueta: 'Con alerta', valor: String(new Set(invFiltrado.filter((f) => f.bajo_minimo || f.cantidad <= 0).map((f) => f.sku)).size) },
        { etiqueta: 'Valor en bodega', valor: pesos.format(invFiltrado.reduce((s, f) => s + f.valor_total, 0)) },
      ];
    }
    const ent = movFiltrados.filter((m) => m.tipo === 'ENTRADA');
    const sal = movFiltrados.filter((m) => m.tipo === 'SALIDA');
    return [
      { etiqueta: 'Movimientos', valor: String(movFiltrados.length) },
      { etiqueta: 'Entradas', valor: `${ent.length} (${pesos.format(ent.reduce((s, m) => s + m.valor, 0))})` },
      { etiqueta: 'Salidas', valor: `${sal.length} (${pesos.format(sal.reduce((s, m) => s + m.valor, 0))})` },
    ];
  }
  // Columnas según quién mira: sin pesos para almacén y consulta; "En camino" en compras para el administrador
  function columnasDe(v: Vista): Columna<unknown>[] {
    const base = (v === 'inventario' ? COL_INVENTARIO : v === 'compras' ? COL_COMPRAS : v === 'consumo' ? COL_CONSUMO : COL_MOVIMIENTOS) as Columna<unknown>[];
    let cols = verPlata ? base : base.filter((c) => c.tipo !== 'moneda');
    if (v === 'compras' && verPlata) {
      const i = cols.findIndex((c) => c.titulo === 'Pedir');
      cols = [...cols.slice(0, i), COL_EN_CAMINO as Columna<unknown>, ...cols.slice(i)];
    }
    return cols;
  }

  /* ---------------------------- Exportar ---------------------------- */

  function armarInforme(): Informe<unknown> {
    const generado = `Generado el ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })} por ${usuario}`;
    if (vista === 'compras') {
      return {
        titulo: 'Compras sugeridas',
        archivo: 'compras_sugeridas_poliway',
        detalle: [textoCategoria, generado, `Productos en o por debajo del mínimo. Se sugiere pedir hasta completar el doble del mínimo.${verPlata ? ' Se descuenta lo que ya viene en camino. Valores sin IVA.' : ''}`],
        columnas: columnasDe('compras'),
        filas: compras,
        totales: resumen,
      };
    }
    if (vista === 'consumo') {
      const filtros = [area && `Área: ${area}`, funcionario && `Funcionario: ${funcionario}`, cliente && `Cliente: ${cliente}`].filter(Boolean);
      return {
        titulo: 'Consumo de repuestos',
        archivo: 'consumo_poliway',
        detalle: [`${textoCategoria}. Del ${fechaLarga(desde)} al ${fechaLarga(hasta)}`, generado, ...(filtros.length ? [`Filtros: ${filtros.join(', ')}`] : [])],
        columnas: columnasDe('consumo'),
        filas: consumo,
        totales: resumen,
      };
    }
    if (vista === 'inventario') {
      const filtros = [estado === 'alerta' && 'Solo con alerta', estado === 'con' && 'Solo con existencia', q && `Búsqueda: "${texto.trim()}"`].filter(Boolean);
      return {
        titulo: 'Informe de inventario',
        archivo: 'inventario_poliway',
        detalle: [textoCategoria, generado, ...(filtros.length ? [`Filtros: ${filtros.join(', ')}`] : [])],
        columnas: columnasDe('inventario'),
        filas: invFiltrado,
        totales: resumen,
      };
    }
    const filtros = [tipo && (tipo === 'ENTRADA' ? 'Solo entradas' : 'Solo salidas'), area && `Área: ${area}`, funcionario && `Funcionario: ${funcionario}`, cliente && `Cliente: ${cliente}`, q && `Búsqueda: "${texto.trim()}"`].filter(Boolean);
    return {
      titulo: 'Informe de movimientos',
      archivo: 'movimientos_poliway',
      detalle: [
        `${textoCategoria}. Del ${fechaLarga(desde)} al ${fechaLarga(hasta)}`,
        generado,
        ...(filtros.length ? [`Filtros: ${filtros.join(', ')}`] : []),
      ],
      columnas: columnasDe('movimientos'),
      filas: movFiltrados,
      totales: resumen,
    };
  }

  async function exportar(formato: 'excel' | 'pdf') {
    setExportando(formato);
    try {
      const inf = armarInforme();
      if (formato === 'excel') await exportarExcel(inf);
      else await exportarPdf(inf);
    } catch (e) {
      setError(`No se pudo generar el archivo: ${(e as Error).message}`);
    }
    setExportando('');
  }

  // Descarga pedida por voz: se hace cuando terminan de cargar los datos con los filtros nuevos
  useEffect(() => {
    if (!descargaPendiente || cargando) return;
    const formato = descargaPendiente;
    setDescargaPendiente(null);
    exportar(formato).then(() => decirAlAsistente(`Listo, el informe en ${formato === 'excel' ? 'Excel' : 'PDF'} quedó en Descargas.`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargadas]);

  /* ------------------------------ Vista ------------------------------ */

  const columnas = columnasDe(vista);
  const filas = (
    vista === 'inventario' ? invFiltrado : vista === 'compras' ? compras : vista === 'consumo' ? consumo : movFiltrados
  ) as unknown[];
  const conFechas = vista === 'movimientos' || vista === 'consumo';
  const MAX = 300;
  const control = 'w-full rounded-lg border border-linea bg-white px-3 py-2.5 text-base focus:border-poli focus:outline-none focus:ring-2 focus:ring-poli/40';

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-tinta pb-4">
        <div>
          <Marca />
          <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">Informes</h1>
        </div>
        <Link href="/" className="rounded border border-tinta px-3 py-1.5 text-sm font-medium hover:bg-tinta hover:text-white">
          Inicio
        </Link>
      </header>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-linea bg-white p-1" role="tablist">
          {(
            [
              ['movimientos', 'Movimientos'],
              ['inventario', 'Inventario actual'],
              ['compras', 'Compras sugeridas'],
              ['consumo', 'Consumo y gráficas'],
            ] as const
          ).map(([v, t]) => (
            <button
              key={v}
              role="tab"
              aria-selected={vista === v}
              onClick={() => {
                setVista(v);
                if (v === 'consumo') setTipo('');
              }}
              className={`rounded-md px-4 py-2 font-bold ${vista === v ? 'bg-tinta text-white' : 'text-acero hover:text-tinta'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportar('excel')}
            disabled={!!exportando || cargando || filas.length === 0}
            className="rounded-lg bg-poli px-4 py-2.5 font-bold text-tinta hover:bg-tinta hover:text-white disabled:opacity-40"
          >
            {exportando === 'excel' ? 'Generando…' : 'Descargar Excel'}
          </button>
          <button
            onClick={() => exportar('pdf')}
            disabled={!!exportando || cargando || filas.length === 0}
            className="rounded-lg bg-tinta px-4 py-2.5 font-bold text-white hover:bg-poli hover:text-tinta disabled:opacity-40"
          >
            {exportando === 'pdf' ? 'Generando…' : 'Descargar PDF'}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <section className="mt-4 grid gap-3 rounded-lg border border-linea bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filtros">
        {/* La categoría aplica a todos los informes */}
        <label>
          <span className="mb-1 block text-sm font-medium">Categoría</span>
          <select id="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={control}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {conFechas ? (
          <>
            <label>
              <span className="mb-1 block text-sm font-medium">Desde</span>
              <input id="desde" type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className={control} />
            </label>
            <label>
              <span className="mb-1 block text-sm font-medium">Hasta</span>
              <input id="hasta" type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className={control} />
            </label>
{vista === 'movimientos' && (
            <label>
              <span className="mb-1 block text-sm font-medium">Tipo</span>
              <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as '' | 'ENTRADA' | 'SALIDA')} className={control}>
                <option value="">Entradas y salidas</option>
                <option value="ENTRADA">Solo entradas</option>
                <option value="SALIDA">Solo salidas</option>
              </select>
            </label>
            )}
            <label>
              <span className="mb-1 block text-sm font-medium">Área</span>
              <select id="area" value={area} onChange={(e) => setArea(e.target.value)} className={control}>
                <option value="">Todas las áreas</option>
                {areas.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-sm font-medium">Funcionario</span>
              <select id="funcionario" value={funcionario} onChange={(e) => setFuncionario(e.target.value)} className={control}>
                <option value="">Todos los funcionarios</option>
                {funcionarios.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-sm font-medium">Cliente</span>
              <select id="cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} className={control}>
                <option value="">Todos los clientes</option>
                {clientes.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
{vista === 'inventario' && (
            <label>
              <span className="mb-1 block text-sm font-medium">Estado</span>
              <select id="estado" value={estado} onChange={(e) => setEstado(e.target.value as '' | 'alerta' | 'con')} className={control}>
                <option value="">Todos</option>
                <option value="con">Solo con existencia</option>
                <option value="alerta">Bajo mínimo o sin existencia</option>
              </select>
            </label>
            )}
          </>
        )}
        {vista !== 'compras' && (
        <label className="sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">Producto</span>
          <input
            id="texto"
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Nombre o SKU"
            className={control}
          />
        </label>
        )}
      </section>

      {/* Resumen */}
      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {resumen.map((r) => (
          <div key={r.etiqueta} className="rounded-lg border-l-4 border-poli bg-white px-4 py-3">
            <dt className="text-sm text-acero">{r.etiqueta}</dt>
            <dd className="text-xl font-bold tabular-nums">{r.valor}</dd>
          </div>
        ))}
      </dl>

      {error && <p className="mt-4 rounded border border-alerta bg-alerta-suave px-4 py-3 text-sm font-medium text-alerta">{error}</p>}

      {vista === 'consumo' && !cargando && salidas.length > 0 && <GraficasConsumo salidas={salidas} verPlata={verPlata} />}

      {vista === 'compras' && sesion.esAdmin && compras.some((c) => c.sugerido > 0) && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border-2 border-poli bg-white p-4">
          <div className="min-w-0 flex-1">
            <p className="font-bold">Armar pedido a Brasil</p>
            <p className="text-sm text-acero">
              Pasa estas {compras.filter((c) => c.sugerido > 0).length} referencias a ➕ Registrar con las cantidades sugeridas. Allí las ajusta, descarga el pedido en Excel o PDF
              para enviarlo y lo deja registrado como pedido en tránsito.
            </p>
          </div>
          <button
            onClick={() => {
              dejarPedidoPendiente(
                compras.filter((c) => c.sugerido > 0).map((c) => ({ codigo: c.sku, descripcion: c.nombre, cantidad: c.sugerido, valor: c.costo > 0 ? c.costo : null }))
              );
              router.push('/admin');
            }}
            className="rounded-lg bg-tinta px-4 py-2 font-semibold text-white hover:bg-poli hover:text-tinta"
          >
            Armar pedido →
          </button>
        </div>
      )}

      {vista === 'compras' && sesion.esAdmin && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-linea bg-white p-4">
          <div className="min-w-0 flex-1">
            <p className="font-bold">Alerta automática por correo</p>
            <p className="text-sm text-acero">
              Cuando la app esté publicada, cada mañana (lunes a sábado) se envía esta lista por correo si hay productos en el mínimo.
            </p>
          </div>
          <button
            onClick={enviarAlerta}
            disabled={enviandoCorreo}
            className="rounded-lg border border-tinta px-4 py-2 font-semibold hover:bg-tinta hover:text-white disabled:opacity-50"
          >
            {enviandoCorreo ? 'Enviando…' : 'Enviar ahora'}
          </button>
          {correo && <p className={`w-full text-sm font-medium ${correo.ok ? 'text-oro-oscuro' : 'text-alerta'}`}>{correo.texto}</p>}
        </div>
      )}

      {/* Vista previa */}
      <section className="mt-4 overflow-x-auto rounded-lg border border-linea bg-white" aria-label="Vista previa del informe">
        {cargando ? (
          <p className="py-12 text-center text-acero">Cargando…</p>
        ) : filas.length === 0 ? (
          <p className="py-12 text-center text-acero">
            {vista === 'movimientos'
              ? 'No hay movimientos con estos filtros. Pruebe ampliando el rango de fechas.'
              : 'No hay productos con estos filtros.'}
          </p>
        ) : (
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-tinta text-white">
                {columnas.map((c) => (
                  <th key={c.titulo} scope="col" className={`px-3 py-2.5 font-semibold ${c.tipo === 'numero' || c.tipo === 'moneda' ? 'text-right' : ''}`}>
                    {c.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.slice(0, MAX).map((f, i) => (
                <tr key={i} className="border-t border-linea even:bg-concreto">
                  {columnas.map((c) => {
                    const v = c.valor(f);
                    const salida = c.titulo === 'Cantidad' && typeof v === 'number' && v < 0;
                    return (
                      <td
                        key={c.titulo}
                        className={`px-3 py-2 align-top ${c.tipo === 'numero' || c.tipo === 'moneda' ? 'text-right tabular-nums' : ''} ${salida ? 'font-semibold' : ''}`}
                      >
                        {textoCelda(c.tipo, v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {filas.length > MAX && (
        <p className="mt-2 text-sm text-acero">
          En pantalla se muestran los primeros {MAX} de {numero.format(filas.length)} registros. Los archivos de Excel y PDF los incluyen todos.
        </p>
      )}
    </main>
  );
}

/* ------------------------- Gráficas de consumo ------------------------- */

function Barras({ titulo, datos, moneda }: { titulo: string; datos: { etiqueta: string; valor: number }[]; moneda: boolean }) {
  const max = Math.max(...datos.map((d) => d.valor), 1);
  return (
    <figure className="rounded-lg border border-linea bg-white p-4">
      <figcaption className="mb-3 font-bold">{titulo}</figcaption>
      <ul className="space-y-2">
        {datos.map((d) => (
          <li key={d.etiqueta} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate" title={d.etiqueta}>
              {d.etiqueta}
            </span>
            <span className="h-3 rounded-sm bg-concreto">
              <span className="block h-3 rounded-sm bg-poli" style={{ width: `${(d.valor / max) * 100}%` }} />
            </span>
            <span className="text-right font-semibold tabular-nums">{moneda ? pesos.format(d.valor) : numero.format(d.valor)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function GraficasConsumo({ salidas, verPlata }: { salidas: FilaMovimiento[]; verPlata: boolean }) {
  // Si los productos aún no tienen costo, se grafica por número de despachos
  const conValor = salidas.some((m) => m.valor > 0);
  const medida = (m: FilaMovimiento) => (conValor ? m.valor : 1);
  const agrupar = (clave: (m: FilaMovimiento) => string, max = 8) => {
    const mapa = new Map<string, number>();
    salidas.forEach((m) => mapa.set(clave(m), (mapa.get(clave(m)) ?? 0) + medida(m)));
    return [...mapa.entries()]
      .map(([etiqueta, valor]) => ({ etiqueta, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, max);
  };
  const porArea = agrupar((m) => (m.destino === 'CLIENTE' ? `Cliente: ${m.cliente ?? ''}` : m.area ?? 'Sin área'));
  const porProducto = agrupar((m) => m.producto);
  // Por mes en orden cronológico (clave AAAA-MM, etiqueta "octubre de 2026")
  const porMes = agrupar((m) => new Date(m.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).slice(0, 7), 12)
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta))
    .map((d) => ({
      ...d,
      etiqueta: new Date(`${d.etiqueta}-15T12:00:00`).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }),
    }));
  const unidad = conValor ? 'valor' : 'despachos';
  return (
    <section className="mt-4 grid gap-4 lg:grid-cols-2" aria-label="Gráficas de consumo">
      <Barras titulo={`Consumo por área o cliente (${unidad})`} datos={porArea} moneda={conValor} />
      <Barras titulo={`Repuestos más despachados (${unidad})`} datos={porProducto} moneda={conValor} />
      <Barras titulo={`Consumo por mes (${unidad})`} datos={porMes} moneda={conValor} />
      {!conValor && verPlata && (
        <p className="self-center rounded-lg bg-poli/20 p-4 text-sm">
          Los productos todavía no tienen costo, por eso las gráficas cuentan despachos. Cuando registre entradas con costo o
          importe el Excel con costos, las gráficas mostrarán el valor en pesos.
        </p>
      )}
    </section>
  );
}
