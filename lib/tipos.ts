export type UnidadMedida = 'UND' | 'M' | 'M2' | 'KG' | 'ROLLO';

// Una fila de la vista public.v_inventario
export type ItemInventario = {
  producto_id: string;
  sku: string;
  codigo_barras: string;
  nombre: string;
  categoria: string | null;
  unidad_medida: UnidadMedida;
  ubicacion_id: number | null;
  ubicacion: string | null;
  cantidad: number;
  stock_minimo: number;
  bajo_minimo: boolean;
  valor_total: number;
  actualizado: string | null;
  costo_unitario: number;
};

// PostgREST puede devolver columnas numeric como texto en algunos casos;
// convertirlas aquí evita sumas como "137.5" + "90" = "137.590".
export function normalizarItem(fila: Record<string, unknown>): ItemInventario {
  const item = fila as unknown as ItemInventario;
  return {
    ...item,
    cantidad: Number(item.cantidad ?? 0),
    stock_minimo: Number(item.stock_minimo ?? 0),
    valor_total: Number(item.valor_total ?? 0),
    // Si aún no se ejecutó el script 07, se calcula a partir del valor total
    costo_unitario:
      item.costo_unitario != null
        ? Number(item.costo_unitario)
        : Number(item.cantidad) > 0
          ? Number(item.valor_total ?? 0) / Number(item.cantidad)
          : 0,
  };
}
