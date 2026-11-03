// Alertas de la app en un solo lugar: stock, tránsito, préstamos e inspecciones.
// Los permisos de la base de datos deciden qué ve cada usuario
// (por ejemplo, el tránsito solo le llega al administrador).
import { supabase } from '@/lib/supabase';
import { UNIDADES, numero } from '@/lib/formato';

export type GrupoAlerta = 'stock' | 'transito' | 'prestamos' | 'inspeccion';
export interface Alerta {
  grupo: GrupoAlerta;
  alta: boolean; // urgente (agotado, vencido, atrasado)
  texto: string;
  enlace: string;
}

export const ORDEN_GRUPO: GrupoAlerta[] = ['transito', 'prestamos', 'stock', 'inspeccion'];

export const NOMBRE_GRUPO: Record<GrupoAlerta, string> = {
  stock: 'Inventario en el mínimo',
  transito: 'Pedidos de Brasil atrasados',
  prestamos: 'Préstamos vencidos',
  inspeccion: 'Inspección de cañones',
};

const hoyISO = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const und = (u: string) => UNIDADES[u] ?? u.toLowerCase();
const fechaCorta = (f: string) => new Date(`${f.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

let cache: { hora: number; alertas: Alerta[] } | null = null;

export async function cargarAlertas(forzar = false): Promise<Alerta[]> {
  if (!forzar && cache && Date.now() - cache.hora < 60_000) return cache.alertas;
  const hoy = hoyISO();
  const [inv, tr, pr, ins, eqs, clis] = await Promise.all([
    supabase.from('v_inventario').select('sku, nombre, cantidad, stock_minimo, unidad_medida'),
    supabase.from('transitos').select('numero, eta').lt('eta', hoy).not('estado', 'in', '(NACIONALIZADO,ANULADO)'),
    supabase.from('v_prestamos').select('empresa, sentido, producto, pendiente, fecha_devolucion').eq('vencido', true),
    supabase.from('inspecciones').select('id, tipo, fecha, cliente_id, inspeccion_equipos(equipo_id, resultados, hallazgos)').order('fecha', { ascending: false }).limit(120),
    supabase.from('equipos').select('id, cliente_id, serial, planta').eq('activo', true),
    supabase.from('clientes').select('id, nombre'),
  ]);
  const alertas: Alerta[] = [];

  // 1. Inventario: agotados primero, luego los que están en el mínimo
  const porSku = new Map<string, { nombre: string; cantidad: number; minimo: number; unidad: string }>();
  (inv.data ?? []).forEach((f) => {
    const x = porSku.get(f.sku) ?? { nombre: f.nombre, cantidad: 0, minimo: Number(f.stock_minimo ?? 0), unidad: f.unidad_medida };
    x.cantidad += Number(f.cantidad ?? 0);
    porSku.set(f.sku, x);
  });
  [...porSku.values()]
    .filter((x) => x.minimo > 0 && x.cantidad <= x.minimo)
    .sort((a, b) => a.cantidad / a.minimo - b.cantidad / b.minimo)
    .forEach((x) =>
      alertas.push({
        grupo: 'stock',
        alta: x.cantidad <= 0,
        texto: `${x.nombre}: ${x.cantidad <= 0 ? 'agotado' : `quedan ${numero.format(x.cantidad)} ${und(x.unidad)}`} (mínimo ${numero.format(x.minimo)})`,
        enlace: '/informes?vista=compras',
      })
    );

  // 2. Pedidos de Brasil atrasados (solo administrador)
  (tr.data ?? []).forEach((t) =>
    alertas.push({ grupo: 'transito', alta: true, texto: `Pedido ${t.numero}: debía llegar el ${fechaCorta(t.eta)}`, enlace: '/admin?pestana=transito' })
  );

  // 3. Préstamos vencidos
  (pr.data ?? []).forEach((x) =>
    alertas.push({
      grupo: 'prestamos',
      alta: true,
      texto:
        x.sentido === 'SALIDA'
          ? `${x.empresa} no ha devuelto ${numero.format(Number(x.pendiente))} de ${x.producto}${x.fecha_devolucion ? ` (vencía el ${fechaCorta(x.fecha_devolucion)})` : ''}`
          : `Debemos devolver a ${x.empresa} ${numero.format(Number(x.pendiente))} de ${x.producto}${x.fecha_devolucion ? ` (vencía el ${fechaCorta(x.fecha_devolucion)})` : ''}`,
      enlace: `/prestamos?sentido=${x.sentido}`,
    })
  );

  // 4. Inspecciones: cañones que fallan seguido y plantas con cañones sin revisar en el último mes
  type Fila = { equipo_id: number; resultados: Record<string, string>; hallazgos: string[] };
  const insp = (ins.data ?? []) as { id: number; tipo: string; fecha: string; cliente_id: number; inspeccion_equipos: Fila[] }[];
  const equipos = (eqs.data ?? []) as { id: number; cliente_id: number; serial: string | null; planta: string | null }[];
  const nombreCliente = new Map(((clis.data ?? []) as { id: number; nombre: string }[]).map((c) => [c.id, c.nombre]));
  const falla = (f: Fila) => Object.values(f.resultados ?? {}).includes('FALLA') || (f.hallazgos ?? []).length > 0;
  const clientes = [...new Set(equipos.map((e) => e.cliente_id))];
  clientes.forEach((cid) => {
    const rondas = insp.filter((i) => i.cliente_id === cid && i.tipo === 'RONDA').slice(0, 5);
    const veces = new Map<number, number>();
    rondas.forEach((i) => i.inspeccion_equipos.filter(falla).forEach((f) => veces.set(f.equipo_id, (veces.get(f.equipo_id) ?? 0) + 1)));
    [...veces.entries()]
      .filter(([, n]) => n >= 2)
      .forEach(([id, n]) => {
        const e = equipos.find((x) => x.id === id);
        alertas.push({
          grupo: 'inspeccion',
          alta: false,
          texto: `Cañón ${e?.serial ?? id}${e?.planta ? ` (${e.planta})` : ''} falló en ${n} de las últimas ${rondas.length} rondas`,
          enlace: '/inspecciones',
        });
      });
    const desde = new Date(Date.now() - 35 * 86400e3).toISOString().slice(0, 10);
    const vistos = new Set(insp.filter((i) => i.cliente_id === cid && i.fecha >= desde).flatMap((i) => i.inspeccion_equipos.map((f) => f.equipo_id)));
    const faltan = equipos.filter((e) => e.cliente_id === cid && !vistos.has(e.id)).length;
    if (faltan)
      alertas.push({
        grupo: 'inspeccion',
        alta: false,
        texto: `${(nombreCliente.get(cid) ?? 'Planta').replace(/\s*\(demo\)/i, '')}: ${faltan} ${faltan === 1 ? 'cañón' : 'cañones'} sin inspeccionar en el último mes`,
        enlace: '/inspecciones',
      });
  });

  cache = { hora: Date.now(), alertas };
  return alertas;
}
