'use client';

import { useEffect, useRef, useState } from 'react';

// Recuadro para firmar con el dedo (celular) o con el mouse (computador).
// Entrega la firma como imagen PNG (data URL) o null si está vacía.
export default function FirmaPad({ onCambio }: { onCambio: (firma: string | null) => void }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  const [vacia, setVacia] = useState(true);

  useEffect(() => {
    const c = lienzo.current;
    if (!c) return;
    const ajustar = () => {
      const r = c.getBoundingClientRect();
      c.width = Math.round(r.width * 1.5);
      c.height = Math.round(r.height * 1.5);
      const ctx = c.getContext('2d')!;
      ctx.scale(1.5, 1.5);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111111';
    };
    ajustar();
  }, []);

  function punto(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function bajar(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dibujando.current = true;
    ultimo.current = punto(e);
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current || !ultimo.current) return;
    const ctx = e.currentTarget.getContext('2d')!;
    const p = punto(e);
    ctx.beginPath();
    ctx.moveTo(ultimo.current.x, ultimo.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ultimo.current = p;
    if (vacia) setVacia(false);
  }

  function subir() {
    if (!dibujando.current) return;
    dibujando.current = false;
    ultimo.current = null;
    if (!vacia && lienzo.current) onCambio(lienzo.current.toDataURL('image/png'));
  }

  function borrar() {
    const c = lienzo.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    setVacia(true);
    onCambio(null);
  }

  return (
    <div>
      <div className="relative">
        <canvas
          ref={lienzo}
          aria-label="Recuadro para firmar"
          className="h-36 w-full touch-none rounded-lg border-2 border-dashed border-linea bg-white"
          onPointerDown={bajar}
          onPointerMove={mover}
          onPointerUp={subir}
          onPointerCancel={subir}
          onPointerLeave={subir}
        />
        {vacia && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-acero">
            Firme aquí con el dedo o el mouse
          </span>
        )}
        <span aria-hidden className="pointer-events-none absolute bottom-6 left-6 right-6 border-b border-linea" />
      </div>
      {!vacia && (
        <button type="button" onClick={borrar} className="mt-1 text-sm font-semibold text-acero underline">
          Borrar firma
        </button>
      )}
    </div>
  );
}
