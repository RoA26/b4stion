'use client';

import { useEffect, useMemo, useState } from 'react';
import Encabezado, { BOTON_ACENTO, CONTROL } from '@/components/Encabezado';
import { supabase } from '@/lib/supabase';
import { sinTildes } from '@/lib/catalogo';
import { useSesion } from '@/lib/sesion';
import { decirAlAsistente, useOrdenVoz } from '@/lib/voz/bus';

interface Item {
  id: string;
  sku: string;
  codigo: string;
  nombre: string;
  categoria: string;
}

type Formato = 'hoja' | 'rollo';
const FORMATOS: Record<Formato, { titulo: string; detalle: string }> = {
  hoja: { titulo: 'Hoja carta adhesiva', detalle: '30 etiquetas por hoja (3 × 10), de 6,7 × 2,5 cm. Para impresora normal.' },
  rollo: { titulo: 'Rollo de etiquetas', detalle: 'Una etiqueta de 5 × 2,5 cm por página. Para impresora de etiquetas.' },
};

export default function Etiquetas() {
  const sesion = useSesion();
  const [items, setItems] = useState<Item[]>([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [elegidos, setElegidos] = useState<Record<string, number>>({}); // id -> copias
  const [formato, setFormato] = useState<Formato>('hoja');
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sesion.listo) return;
    (async () => {
      const { data, error } = await supabase.from('v_inventario').select('producto_id, sku, codigo_barras, nombre, categoria').order('nombre');
      if (error) setError(`No se pudo leer el catálogo: ${error.message}`);
      const unicos = new Map<string, Item>();
      (data ?? []).forEach((f) =>
        unicos.set(f.producto_id, { id: f.producto_id, sku: f.sku, codigo: f.codigo_barras, nombre: f.nombre, categoria: f.categoria ?? 'Sin categoría' })
      );
      setItems([...unicos.values()]);
      setCargando(false);
    })();
  }, [sesion.listo]);

  const categorias = useMemo(() => [...new Set(items.map((i) => i.categoria))].sort(), [items]);
  const filtrados = useMemo(() => {
    const palabras = sinTildes(texto).split(/\s+/).filter(Boolean);
    return items.filter(
      (i) =>
        (!categoria || i.categoria === categoria) &&
        palabras.every((w) => sinTildes(`${i.nombre} ${i.sku} ${i.codigo}`).includes(w))
    );
  }, [items, texto, categoria]);

  const totalEtiquetas = Object.values(elegidos).reduce((a, b) => a + b, 0);
  const todosMarcados = filtrados.length > 0 && filtrados.every((i) => elegidos[i.id]);

  function marcarTodos() {
    setElegidos((e) => {
      const n = { ...e };
      if (todosMarcados) filtrados.forEach((i) => delete n[i.id]);
      else filtrados.forEach((i) => (n[i.id] = n[i.id] || 1));
      return n;
    });
  }

  async function generar() {
    setGenerando(true);
    setError(null);
    try {
      const QR = (await import('qrcode')).default;
      const { jsPDF } = await import('jspdf');
      const lista = items.filter((i) => elegidos[i.id]).flatMap((i) => Array(elegidos[i.id]).fill(i) as Item[]);
      const qrs = new Map<string, string>();
      for (const i of lista) {
        if (!qrs.has(i.codigo)) qrs.set(i.codigo, await QR.toDataURL(i.codigo, { margin: 0, width: 300, errorCorrectionLevel: 'M' }));
      }

      if (formato === 'hoja') {
        // Carta, 3 columnas × 10 filas (formato tipo 5160)
        const doc = new jsPDF({ unit: 'mm', format: 'letter' });
        const ancho = 66.7, alto = 25.4, paso = 69.85, izq = 4.8, arriba = 12.7;
        lista.forEach((i, n) => {
          const pos = n % 30;
          if (n > 0 && pos === 0) doc.addPage();
          const x = izq + (pos % 3) * paso;
          const y = arriba + Math.floor(pos / 3) * alto;
          dibujar(doc, i, qrs.get(i.codigo)!, x, y, ancho, alto);
        });
        doc.save(`etiquetas_poliway_${lista.length}.pdf`);
      } else {
        const doc = new jsPDF({ unit: 'mm', format: [50, 25], orientation: 'landscape' });
        lista.forEach((i, n) => {
          if (n > 0) doc.addPage([50, 25], 'landscape');
          dibujar(doc, i, qrs.get(i.codigo)!, 0, 0, 50, 25);
        });
        doc.save(`etiquetas_rollo_poliway_${lista.length}.pdf`);
      }
    } catch (e) {
      setError(`No se pudo generar el PDF: ${(e as Error).message}`);
    }
    setGenerando(false);
  }

  /* ---------- Etiquetas por voz (asistente Blaster) ---------- */
  const [porVoz, setPorVoz] = useState<{ categoria: string | null; sku: string | null; generar: boolean } | null>(null);
  const [generarVoz, setGenerarVoz] = useState(false);
  useOrdenVoz(['etiquetas'], sesion.listo, (_t, datos) => setPorVoz(datos as { categoria: string | null; sku: string | null; generar: boolean }));
  useEffect(() => {
    if (!porVoz || cargando) return;
    const lista = items.filter((i) => (porVoz.sku ? i.sku === porVoz.sku : !porVoz.categoria || i.categoria === porVoz.categoria));
    setCategoria(porVoz.categoria && !porVoz.sku ? porVoz.categoria : '');
    setTexto(porVoz.sku ?? '');
    setElegidos(Object.fromEntries(lista.map((i) => [i.id, 1])));
    if (!lista.length) decirAlAsistente('No encontré productos para esas etiquetas.', false);
    else if (porVoz.generar) setGenerarVoz(true);
    setPorVoz(null);
  }, [porVoz, cargando, items]);
  useEffect(() => {
    if (!generarVoz) return;
    setGenerarVoz(false);
    generar().then(() => decirAlAsistente(`Listo, el PDF con ${totalEtiquetas} ${totalEtiquetas === 1 ? 'etiqueta' : 'etiquetas'} quedó en Descargas.`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generarVoz]);

  if (!sesion.listo) return <p className="py-24 text-center text-acero">Cargando…</p>;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <Encabezado titulo="Etiquetas QR" />
      <p className="mt-4 max-w-3xl text-acero">
        Escoja los productos y cuántas etiquetas necesita de cada uno. Cada etiqueta lleva el código QR que leen la pistola y la cámara del celular.
      </p>

      <section className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="Formato">
        {(Object.keys(FORMATOS) as Formato[]).map((f) => (
          <label
            key={f}
            className={`cursor-pointer rounded-lg border-2 bg-white p-4 ${formato === f ? 'border-tinta' : 'border-linea'}`}
          >
            <input type="radio" name="formato" className="sr-only" checked={formato === f} onChange={() => setFormato(f)} />
            <span className="block font-bold">{FORMATOS[f].titulo}</span>
            <span className="block text-sm text-acero">{FORMATOS[f].detalle}</span>
          </label>
        ))}
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-[1fr_240px]">
        <input id="buscar" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre o código" className={CONTROL} />
        <select id="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={CONTROL}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button onClick={marcarTodos} className="text-sm font-semibold underline">
          {todosMarcados ? 'Quitar los que se ven' : `Marcar los ${filtrados.length} que se ven`}
        </button>
        <button onClick={generar} disabled={!totalEtiquetas || generando} className={BOTON_ACENTO}>
          {generando ? 'Generando…' : `Generar PDF con ${totalEtiquetas} etiqueta${totalEtiquetas === 1 ? '' : 's'}`}
        </button>
      </div>

      {error && <p className="mt-3 rounded border border-alerta bg-alerta-suave px-4 py-3 text-sm font-medium text-alerta">{error}</p>}

      <section className="mt-3">
        {cargando ? (
          <p className="py-8 text-center text-acero">Cargando…</p>
        ) : (
          <ul className="divide-y divide-linea rounded-lg border border-linea bg-white">
            {filtrados.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                <input
                  id={`e-${i.id}`}
                  type="checkbox"
                  checked={!!elegidos[i.id]}
                  onChange={(e) =>
                    setElegidos((x) => {
                      const n = { ...x };
                      if (e.target.checked) n[i.id] = 1;
                      else delete n[i.id];
                      return n;
                    })
                  }
                  className="h-5 w-5 accent-[#111111]"
                />
                <label htmlFor={`e-${i.id}`} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block font-semibold leading-snug">{i.nombre}</span>
                  <span className="block text-sm text-acero">
                    {i.codigo}, {i.categoria}
                  </span>
                </label>
                {elegidos[i.id] ? (
                  <label className="flex items-center gap-2 text-sm">
                    Copias
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={elegidos[i.id]}
                      onChange={(e) => setElegidos((x) => ({ ...x, [i.id]: Math.max(1, Math.min(200, Number(e.target.value) || 1)) }))}
                      className="w-16 rounded border border-linea px-2 py-1 text-center"
                    />
                  </label>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/* Dibuja una etiqueta: QR a la izquierda; nombre y código a la derecha */
function dibujar(
  doc: import('jspdf').jsPDF,
  i: Item,
  qr: string,
  x: number,
  y: number,
  ancho: number,
  alto: number
) {
  const m = 2;
  const lado = alto - m * 2;
  doc.addImage(qr, 'PNG', x + m, y + m, lado, lado);
  const tx = x + m + lado + 2.5;
  const tw = ancho - (tx - x) - m - 2.5; // deja espacio para la franja amarilla
  doc.setTextColor(17, 17, 17);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const lineas = doc.splitTextToSize(i.nombre, tw).slice(0, 3) as string[];
  doc.text(lineas, tx, y + m + 3);
  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.text(doc.splitTextToSize(i.codigo, tw)[0] as string, tx, y + alto - m - 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(87, 87, 87);
  doc.text('BLASTER by POLIWAY', tx, y + alto - m - 0.8);
  doc.setFillColor(255, 189, 89);
  doc.rect(x + ancho - m - 1.2, y + m, 1.2, alto - m * 2, 'F');
}
