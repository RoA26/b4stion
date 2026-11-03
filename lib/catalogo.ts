import { supabase } from '@/lib/supabase';

// Catálogo de productos activos, para buscar por código o por nombre sin
// consultar la base de datos en cada letra (son pocos cientos de productos).
export interface ProductoBasico {
  id: string;
  sku: string;
  codigo_barras: string;
  nombre: string;
  unidad_medida: string;
  stock_minimo: number;
  costo_unitario: number;
}

let cache: ProductoBasico[] | null = null;

export async function cargarCatalogo(forzar = false): Promise<ProductoBasico[]> {
  if (cache && !forzar) return cache;
  // El costo está protegido: solo el administrador lo recibe (función costos_productos)
  const [{ data }, { data: costos }] = await Promise.all([
    supabase.from('productos').select('id, sku, codigo_barras, nombre, unidad_medida, stock_minimo').eq('activo', true).order('nombre'),
    supabase.rpc('costos_productos'),
  ]);
  const costo = new Map(((costos ?? []) as { id: string; costo_unitario: number }[]).map((c) => [c.id, Number(c.costo_unitario ?? 0)]));
  cache = (data ?? []).map((p) => ({
    ...p,
    stock_minimo: Number(p.stock_minimo ?? 0),
    costo_unitario: costo.get(p.id) ?? 0,
  }));
  return cache;
}

export const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const compacto = (s: string) => sinTildes(s).replace(/[^a-z0-9]/g, '');

// Código exacto (código de barras o SKU), sin importar mayúsculas
export function porCodigo(lista: ProductoBasico[], codigo: string): ProductoBasico | null {
  const c = codigo.trim().toUpperCase();
  if (!c) return null;
  return lista.find((p) => p.codigo_barras.toUpperCase() === c || p.sku.toUpperCase() === c) ?? null;
}

// Búsqueda por palabras: "tornillo 5/8" encuentra "Tornillo galvanizado de 5/8"..."
export function porTexto(lista: ProductoBasico[], texto: string, max = 8): ProductoBasico[] {
  const palabras = sinTildes(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  return lista
    .filter((p) => {
      const base = sinTildes(`${p.nombre} ${p.sku} ${p.codigo_barras}`);
      const baseCompacta = compacto(`${p.sku} ${p.codigo_barras}`);
      return palabras.every((w) => base.includes(w) || (w.length > 2 && baseCompacta.includes(compacto(w))));
    })
    .slice(0, max);
}
