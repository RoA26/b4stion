'use client';

import { useEffect, useRef, useState } from 'react';
import LectorCamara from '@/components/LectorCamara';
import { cargarCatalogo, porCodigo, porTexto, type ProductoBasico } from '@/lib/catalogo';

type Modo = 'pistola' | 'camara';
const CLAVE_MODO = 'poliway.modo-lectura';

function leerModo(): Modo {
  try {
    return localStorage.getItem(CLAVE_MODO) === 'camara' ? 'camara' : 'pistola';
  } catch {
    return 'pistola';
  }
}

// Buscador único para Escanear y Conteo:
// - Pistola lectora: "escribe" el código y pulsa Enter en el campo
// - Cámara del celular: lee QR o código de barras
// - Escribir a mano: código, SKU o parte del nombre (muestra coincidencias)
export default function BuscadorProducto({
  activo,
  onElegir,
  ayuda,
}: {
  activo: boolean;
  onElegir: (p: ProductoBasico) => void;
  ayuda?: string;
}) {
  const [modo, setModo] = useState<Modo>('pistola');
  const [texto, setTexto] = useState('');
  const [catalogo, setCatalogo] = useState<ProductoBasico[]>([]);
  const [noEncontrado, setNoEncontrado] = useState<string | null>(null);
  const [verLista, setVerLista] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setModo(leerModo());
    cargarCatalogo().then(setCatalogo);
  }, []);

  // Con la pistola, el campo debe tener el foco para recibir la lectura
  useEffect(() => {
    if (activo) setTimeout(() => campo.current?.focus(), 50);
  }, [activo, modo]);

  // Si la pistola "escribe" mientras el foco está en otro lado (un botón, una casilla),
  // se lleva el foco al campo para no perder la lectura.
  useEffect(() => {
    if (!activo) return;
    const alTeclear = (e: KeyboardEvent) => {
      const t = e.target as HTMLInputElement | null;
      const escribible = t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(t.type)));
      if (escribible || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.key.length === 1 || e.key === 'Enter') && document.activeElement !== campo.current) campo.current?.focus();
    };
    window.addEventListener('keydown', alTeclear, true);
    return () => window.removeEventListener('keydown', alTeclear, true);
  }, [activo]);

  const sugerencias = texto.trim().length >= 2 ? porTexto(catalogo, texto) : [];

  function elegir(p: ProductoBasico) {
    setTexto('');
    setVerLista(false);
    setNoEncontrado(null);
    navigator.vibrate?.(60);
    onElegir(p);
  }

  async function resolver(entrada: string) {
    const t = entrada.trim();
    if (!t) return;
    let lista = catalogo;
    let exacto = porCodigo(lista, t);
    if (!exacto) {
      // Puede ser un producto creado hace un momento en otro equipo
      lista = await cargarCatalogo(true);
      setCatalogo(lista);
      exacto = porCodigo(lista, t);
    }
    if (exacto) return elegir(exacto);
    const coincidencias = porTexto(lista, t);
    if (coincidencias.length === 1) return elegir(coincidencias[0]);
    if (coincidencias.length > 1) {
      setVerLista(true);
      setNoEncontrado(null);
      return;
    }
    setNoEncontrado(t);
    setVerLista(false);
  }

  function cambiarModo(m: Modo) {
    setModo(m);
    try {
      localStorage.setItem(CLAVE_MODO, m);
    } catch {
      /* sin almacenamiento */
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-linea bg-white p-1" role="radiogroup" aria-label="Forma de leer el código">
        {(
          [
            ['pistola', 'Pistola lectora'],
            ['camara', 'Cámara del celular'],
          ] as const
        ).map(([m, t]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={modo === m}
            onClick={() => cambiarModo(m)}
            className={`rounded-md py-2.5 font-bold ${modo === m ? 'bg-tinta text-white' : 'text-acero hover:text-tinta'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {modo === 'pistola' ? (
        <p className="flex items-center gap-2 rounded-lg bg-poli/25 px-3 py-2 text-sm font-medium">
          <span aria-hidden className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-tinta" />
          Listo para leer: apunte la pistola a la etiqueta. {ayuda}
        </p>
      ) : (
        <LectorCamara activo={activo} onCodigo={resolver} />
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          resolver(texto);
        }}
        className="relative flex gap-2"
      >
        <label className="flex-1">
          <span className="sr-only">Código, SKU o nombre del producto</span>
          <input
            ref={campo}
            id="codigo-manual"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setNoEncontrado(null);
              setVerLista(true);
            }}
            placeholder={modo === 'pistola' ? 'Lea con la pistola o escriba código o nombre' : 'O escriba código o nombre'}
            autoComplete="off"
            enterKeyHint="search"
            className="w-full rounded-lg border border-linea bg-white px-3 py-3 text-base focus:border-poli focus:outline-none focus:ring-2 focus:ring-poli/40"
          />
        </label>
        <button type="submit" disabled={!texto.trim()} className="rounded-lg bg-poli px-5 font-semibold text-tinta disabled:opacity-40">
          Buscar
        </button>
      </form>

      {verLista && sugerencias.length > 0 && (
        <ul className="divide-y divide-linea overflow-hidden rounded-lg border border-linea bg-white" aria-label="Coincidencias">
          {sugerencias.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => elegir(p)} className="w-full px-4 py-2.5 text-left hover:bg-poli/20">
                <span className="block font-semibold leading-snug">{p.nombre}</span>
                <span className="block text-sm text-acero">{p.sku}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {noEncontrado && (
        <div role="alert" className="rounded-lg border border-alerta bg-alerta-suave p-4">
          <p className="font-semibold text-alerta">No se encontró &quot;{noEncontrado}&quot;.</p>
          <p className="mt-1 text-sm">
            No coincide con ningún código ni nombre del catálogo. Revise la etiqueta, pruebe con otra palabra o regístrelo primero en el inventario.
          </p>
        </div>
      )}
    </div>
  );
}
