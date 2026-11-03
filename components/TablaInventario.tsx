import type { ItemInventario, UnidadMedida } from '@/lib/tipos';

const UNIDADES: Record<UnidadMedida, string> = {
  UND: 'und',
  M: 'm',
  M2: 'm²',
  KG: 'kg',
  ROLLO: 'rollos',
};

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const pesos = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

// Barra de nivel: la rayita del centro es el stock mínimo.
// Llena a la derecha = el doble del mínimo o más.
function NivelStock({ cantidad, minimo, bajo }: { cantidad: number; minimo: number; bajo: boolean }) {
  const tope = minimo > 0 ? minimo * 2 : Math.max(cantidad, 1);
  const porcentaje = Math.min(cantidad / tope, 1) * 100;

  return (
    <div
      className="relative mt-2 h-1.5 w-28 rounded-full bg-linea"
      role="img"
      aria-label={`Existencia ${numero.format(cantidad)}, mínimo ${numero.format(minimo)}`}
    >
      <div
        className={`h-full rounded-full ${bajo ? 'bg-alerta' : 'bg-poli'}`}
        style={{ width: `${porcentaje}%` }}
      />
      {minimo > 0 && (
        <span aria-hidden className="absolute -top-1 left-1/2 h-3.5 w-0.5 bg-tinta/70" />
      )}
    </div>
  );
}

function EtiquetaBajoMinimo() {
  return (
    <span className="inline-flex items-center rounded bg-alerta px-2 py-0.5 text-xs font-semibold text-white">
      Bajo mínimo
    </span>
  );
}

function clave(item: ItemInventario) {
  return `${item.producto_id}-${item.ubicacion_id ?? 'sin-ubicacion'}`;
}

export type Transito = Record<string, { cantidad: number; llega: string | null }>;

// verCostos: solo el administrador ve costo y valor. transito: lo que viene en camino (solo administrador)
export default function TablaInventario({ items, verCostos = false, transito }: { items: ItemInventario[]; verCostos?: boolean; transito?: Transito }) {
  // "En tránsito" se muestra una sola vez por producto (en su primera fila)
  const primeras = new Set<string>();
  const vistos = new Set<string>();
  items.forEach((i) => {
    if (!vistos.has(i.producto_id)) {
      vistos.add(i.producto_id);
      primeras.add(clave(i));
    }
  });
  const llega = (f: string | null) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '');
  const verTransito = !!transito;
  return (
    <>
      {/* Escritorio / tablet: tabla */}
      <table className="hidden w-full border-collapse text-left md:table">
        <thead>
          <tr className="border-b-2 border-tinta text-sm text-acero">
            <th scope="col" className="py-3 pl-4 pr-4 font-medium">Producto</th>
            <th scope="col" className="py-3 pr-4 font-medium">Categoría</th>
            <th scope="col" className="py-3 pr-4 font-medium">Ubicación</th>
            <th scope="col" className="py-3 pr-4 text-right font-medium">Existencia</th>
            <th scope="col" className="py-3 pr-4 text-right font-medium">Mínimo</th>
            {verTransito && <th scope="col" className="py-3 pr-4 text-right font-medium">En tránsito</th>}
            {verCostos && <th scope="col" className="py-3 pr-4 text-right font-medium">Costo unitario</th>}
            {verCostos && <th scope="col" className="py-3 pr-4 text-right font-medium">Valor total</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={clave(item)}
              className={`border-b border-linea align-top ${item.bajo_minimo ? 'bg-alerta-suave' : 'bg-white'}`}
            >
              <td
                className={`py-3 pl-3 pr-4 border-l-4 ${item.bajo_minimo ? 'border-alerta' : 'border-transparent'}`}
              >
                <div className="font-semibold leading-snug">{item.nombre}</div>
                <div className="text-sm text-acero tabular-nums">
                  {item.sku} <span className="text-linea">|</span> {item.codigo_barras}
                </div>
              </td>
              <td className="py-3 pr-4 text-acero">{item.categoria ?? 'Sin categoría'}</td>
              <td className="py-3 pr-4 text-acero">{item.ubicacion ?? 'Sin movimientos'}</td>
              <td className="py-3 pr-4">
                <div className="flex flex-col items-end">
                  <span className="text-lg font-semibold tabular-nums">
                    {numero.format(item.cantidad)}{' '}
                    <span className="text-sm font-normal text-acero">{UNIDADES[item.unidad_medida]}</span>
                  </span>
                  <NivelStock cantidad={item.cantidad} minimo={item.stock_minimo} bajo={item.bajo_minimo} />
                  {item.bajo_minimo && <div className="mt-2"><EtiquetaBajoMinimo /></div>}
                </div>
              </td>
              <td className="py-3 pr-4 text-right tabular-nums text-acero">
                {numero.format(item.stock_minimo)} {UNIDADES[item.unidad_medida]}
              </td>
              {verTransito && (
                <td className="py-3 pr-4 text-right tabular-nums">
                  {primeras.has(clave(item)) && transito?.[item.producto_id] ? (
                    <>
                      <span className="font-semibold text-oro-oscuro">{numero.format(transito[item.producto_id].cantidad)}</span>
                      {transito[item.producto_id].llega && (
                        <span className="block text-xs text-acero">llega {llega(transito[item.producto_id].llega)}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-linea">—</span>
                  )}
                </td>
              )}
              {verCostos && <td className="py-3 pr-4 text-right tabular-nums text-acero">{pesos.format(item.costo_unitario)}</td>}
              {verCostos && <td className="py-3 pr-4 text-right font-semibold tabular-nums">{pesos.format(item.valor_total)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Celular: lista */}
      <ul className="divide-y divide-linea border-y border-linea md:hidden">
        {items.map((item) => (
          <li
            key={clave(item)}
            className={`flex items-start justify-between gap-4 border-l-4 px-3 py-3 ${
              item.bajo_minimo ? 'border-alerta bg-alerta-suave' : 'border-transparent bg-white'
            }`}
          >
            <div className="min-w-0">
              <div className="font-semibold leading-snug">{item.nombre}</div>
              <div className="text-sm text-acero">{item.sku}</div>
              <div className="text-sm text-acero">{item.ubicacion ?? 'Sin movimientos'}</div>
              {item.bajo_minimo && <div className="mt-1.5"><EtiquetaBajoMinimo /></div>}
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <span className="text-lg font-semibold tabular-nums">
                {numero.format(item.cantidad)}{' '}
                <span className="text-sm font-normal text-acero">{UNIDADES[item.unidad_medida]}</span>
              </span>
              <span className="text-xs text-acero tabular-nums">
                mín. {numero.format(item.stock_minimo)}
              </span>
              {verCostos && (
                <span className="text-xs tabular-nums">
                  {pesos.format(item.costo_unitario)} c/u, total <strong>{pesos.format(item.valor_total)}</strong>
                </span>
              )}
              {verTransito && primeras.has(clave(item)) && transito?.[item.producto_id] && (
                <span className="text-xs font-semibold text-oro-oscuro tabular-nums">
                  {numero.format(transito[item.producto_id].cantidad)} en tránsito
                </span>
              )}
              <NivelStock cantidad={item.cantidad} minimo={item.stock_minimo} bajo={item.bajo_minimo} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
