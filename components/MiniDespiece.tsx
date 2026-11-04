'use client';

import { CANONES } from '@/lib/canones';

/* Dibujo pequeño del despiece dentro del panel del asistente Blaster:
   muestra el cañón y, si se está hablando de una pieza, hace zoom sobre ella
   y la resalta. Al tocarlo se abre la pantalla Cañones con esa pieza. */

export type ClaveCanon = keyof typeof CANONES;
export interface Ver {
  modelo?: ClaveCanon;
  sku?: string;
  n?: number;
}

export function resolverVer(v: Ver): { c: ClaveCanon; n: number | null } | null {
  const claves = Object.keys(CANONES) as ClaveCanon[];
  const tiene = (c: ClaveCanon, sku: string) => CANONES[c].zonas.some((z) => z.piezas.some((p) => p.sku === sku));
  const c = v.modelo && (!v.sku || tiene(v.modelo, v.sku)) ? v.modelo : v.sku ? claves.find((k) => tiene(k, v.sku!)) : v.modelo;
  if (!c) return null;
  let n = v.n ?? null;
  if (n == null && v.sku) n = CANONES[c].zonas.flatMap((z) => z.piezas).find((p) => p.sku === v.sku)?.n ?? null;
  return { c, n };
}

export default function MiniDespiece({ ver, onAbrir }: { ver: Ver; onAbrir: (c: ClaveCanon, n: number | null) => void }) {
  const r = resolverVer(ver);
  if (!r) return null;
  const d = CANONES[r.c];
  const W = d.ancho;
  const H = d.alto;
  const zonas = r.n != null ? d.zonas.filter((z) => z.piezas.some((p) => p.n === r.n)) : [];
  const globos = r.n != null ? d.globos.filter((g) => g.n === r.n) : [];
  const nombre = r.n != null ? d.zonas.flatMap((z) => z.piezas).find((p) => p.n === r.n)?.nombre : null;

  // Zona visible: todo el cañón, o un acercamiento alrededor de la pieza
  let vb = { x: 0, y: 0, w: W, h: H };
  if (zonas.length) {
    const xs = zonas.flatMap((z) => [z.x, z.x + z.w]).map((v) => (v / 100) * W);
    const ys = zonas.flatMap((z) => [z.y, z.y + z.h]).map((v) => (v / 100) * H);
    const x1 = Math.min(...xs);
    const x2 = Math.max(...xs);
    const y1 = Math.min(...ys);
    const y2 = Math.max(...ys);
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    let w = Math.max((x2 - x1) * 2.2, W * 0.45);
    let h = Math.max((y2 - y1) * 2.4, H * 0.18);
    // proporción del recuadro (aprox. 16:9)
    if (w / h < 1.6) w = h * 1.6;
    else h = w / 1.6;
    w = Math.min(w, W);
    h = Math.min(h, H);
    vb = { x: Math.min(Math.max(cx - w / 2, 0), W - w), y: Math.min(Math.max(cy - h / 2, 0), H - h), w, h };
  }

  return (
    <button
      type="button"
      onClick={() => onAbrir(r.c, r.n)}
      className="mt-3 block w-full overflow-hidden rounded-lg border border-linea bg-white text-left hover:border-tinta"
      title="Abrir en el despiece"
    >
      <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="block h-44 w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Despiece del ${d.nombre}${nombre ? `: ${nombre}` : ''}`}>
        <image href={d.imagen} x={0} y={0} width={W} height={H} opacity={zonas.length ? 0.55 : 1} />
        {zonas.map((z, i) => (
          <rect
            key={i}
            x={(z.x / 100) * W}
            y={(z.y / 100) * H}
            width={(z.w / 100) * W}
            height={(z.h / 100) * H}
            rx={4}
            fill="rgba(255,106,0,0.35)"
            stroke="#FF6A00"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {globos.map((g, i) => (
          <circle key={i} cx={(g.x / 100) * W} cy={(g.y / 100) * H} r={Math.max(W, H) * 0.018} fill="rgba(255,106,0,0.55)" stroke="#17191C" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <span className="flex items-center justify-between gap-2 border-t border-linea px-3 py-1.5 text-xs">
        <span className="font-semibold">
          {d.nombre}
          {r.n != null && nombre ? ` · pieza ${r.n}: ${nombre}` : ''}
        </span>
        <span className="shrink-0 font-semibold text-oro-oscuro">Ver en el despiece →</span>
      </span>
    </button>
  );
}
