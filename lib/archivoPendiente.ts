// Pasa un archivo de una pantalla a otra (por ejemplo, de ➕ Registrar a Importar)
// sin volver a pedirlo. Vive solo mientras la app está abierta.
let pendiente: File | null = null;

export function dejarArchivoPendiente(f: File) {
  pendiente = f;
}

export function tomarArchivoPendiente(): File | null {
  const f = pendiente;
  pendiente = null;
  return f;
}

// Pedido armado desde Compras sugeridas que se abre en ➕ Registrar
export interface LineaPedido {
  codigo: string;
  descripcion: string;
  cantidad: number;
  valor: number | null;
}
let pedido: LineaPedido[] | null = null;

export function dejarPedidoPendiente(lineas: LineaPedido[]) {
  pedido = lineas;
}

export function tomarPedidoPendiente(): LineaPedido[] | null {
  const p = pedido;
  pedido = null;
  return p;
}
