'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cargarAlertas } from '@/lib/alertas';

// Campanita con el número de alertas: avisa sin interrumpir; al tocarla abre Alertas
export default function Campana() {
  const ruta = usePathname();
  const [n, setN] = useState<number | null>(null);
  const [urgentes, setUrgentes] = useState(0);

  useEffect(() => {
    let vivo = true;
    cargarAlertas()
      .then((a) => {
        if (!vivo) return;
        setN(a.length);
        setUrgentes(a.filter((x) => x.alta).length);
      })
      .catch(() => vivo && setN(null));
    return () => {
      vivo = false;
    };
  }, [ruta]);

  return (
    <Link
      href="/alertas"
      aria-label={n ? `${n} alertas` : 'Alertas'}
      title={n ? `${n} alertas${urgentes ? `, ${urgentes} urgentes` : ''}` : 'Alertas'}
      className="relative inline-flex items-center rounded border border-tinta px-3 py-1.5 font-medium hover:bg-tinta hover:text-white"
    >
      <span aria-hidden>🔔</span>
      {!!n && (
        <span
          className={`absolute -right-2 -top-2 min-w-5 rounded-full px-1.5 text-center text-xs font-bold leading-5 ${urgentes ? 'bg-alerta text-white' : 'bg-poli text-tinta'}`}
        >
          {n > 99 ? '99+' : n}
        </span>
      )}
    </Link>
  );
}
