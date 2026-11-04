import Link from 'next/link';
import type { ReactNode } from 'react';
import Campana from '@/components/Campana';
import Buscador from '@/components/Buscador';
import Marca from '@/components/Marca';

// Encabezado común de las pantallas: logo, título y regreso al inventario
export default function Encabezado({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-tinta pb-4">
      <div>
        <Marca />
        <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{titulo}</h1>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {children}
        <Buscador />
        <Campana />
        <Link href="/" className="rounded border border-tinta px-3 py-1.5 font-medium hover:bg-tinta hover:text-white">
          Inicio
        </Link>
      </div>
    </header>
  );
}

// Clases comunes de los formularios
export const CONTROL =
  'w-full rounded-lg border border-linea bg-white px-3 py-2.5 text-base focus:border-poli focus:outline-none focus:ring-2 focus:ring-poli/40';
export const BOTON_PRINCIPAL =
  'rounded-lg bg-tinta px-5 py-2.5 font-semibold text-white hover:bg-poli hover:text-tinta disabled:opacity-50';
export const BOTON_ACENTO =
  'rounded-lg bg-poli px-5 py-2.5 font-semibold text-tinta hover:bg-tinta hover:text-white disabled:opacity-50';
export const BOTON_SECUNDARIO =
  'rounded-lg border border-tinta px-4 py-2 font-semibold text-tinta hover:bg-tinta hover:text-white disabled:opacity-50';
