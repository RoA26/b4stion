import Link from 'next/link';
import type { Rol } from '@/lib/sesion';

// Menú principal: cada rol ve solo lo que puede usar
const OPCIONES: { href: string; texto: string; roles: Rol[]; destacado?: boolean }[] = [
  { href: '/escanear', texto: 'Inventario', roles: ['admin', 'bodeguero', 'consulta'], destacado: true },
  { href: '/conteo', texto: 'Conteo físico', roles: ['admin', 'bodeguero'] },
  { href: '/canones', texto: 'Cañones', roles: ['admin', 'bodeguero', 'consulta'] },
  { href: '/equipos', texto: 'Equipos instalados', roles: ['admin', 'bodeguero', 'consulta'] },
  { href: '/inspecciones', texto: 'Inspección de cañones', roles: ['admin', 'bodeguero', 'consulta'] },
  { href: '/informes', texto: 'Informes', roles: ['admin', 'bodeguero', 'consulta'] },
  { href: '/etiquetas', texto: 'Etiquetas QR', roles: ['admin', 'bodeguero'] },
  { href: '/listas', texto: 'Listas', roles: ['admin', 'bodeguero'] },
  { href: '/prestamos', texto: 'Préstamos', roles: ['admin', 'bodeguero'] },
  { href: '/admin', texto: 'Administración', roles: ['admin'] },
  { href: '/importar', texto: 'Importar Excel', roles: ['admin'] },
  { href: '/usuarios', texto: 'Usuarios', roles: ['admin'] },
];

export default function Menu({ rol }: { rol: Rol }) {
  return (
    <nav aria-label="Menú principal" className="flex flex-wrap gap-2 py-3 text-sm">
      {OPCIONES.filter((o) => o.roles.includes(rol)).map((o) => (
        <Link
          key={o.href}
          href={o.href}
          className={`rounded px-3 py-1.5 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta ${
            o.destacado
              ? 'bg-poli text-tinta hover:bg-tinta hover:text-white'
              : 'border border-tinta text-tinta hover:bg-tinta hover:text-white'
          }`}
        >
          {o.texto}
        </Link>
      ))}
    </nav>
  );
}
