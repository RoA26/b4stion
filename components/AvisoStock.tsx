'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { numero, UNIDADES } from '@/lib/formato';

/* Aviso al abrir la app: productos en el stock mínimo o agotados.
   Sale una vez cada vez que se abre la app (o se inicia sesión);
   se cierra con "Entendido" y se sigue trabajando. */

const CLAVE = 'poliway.aviso-stock-cerrado';

interface Alerta {
  sku: string;
  nombre: string;
  cantidad: number;
  minimo: number;
  unidad: string;
}

function yaCerrado() {
  try {
    return sessionStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}
function marcarCerrado(valor: boolean) {
  try {
    if (valor) sessionStorage.setItem(CLAVE, '1');
    else sessionStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento: el aviso puede volver a salir, no pasa nada */
  }
}

export default function AvisoStock() {
  const ruta = usePathname();
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [otros, setOtros] = useState<{ texto: string; enlace: string }[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (ruta === '/login') return;
    let vivo = true;

    async function revisar() {
      if (yaCerrado()) return;
      const { data: s } = await supabase.auth.getSession();
      if (!s.session || !vivo) return;
      const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
      // Tránsito atrasado (solo lo ve el administrador) y préstamos vencidos (admin y almacén):
      // los permisos de la base de datos devuelven vacío a quien no le corresponde.
      const [{ data }, tr, pr] = await Promise.all([
        supabase.from('v_inventario').select('sku, nombre, cantidad, stock_minimo, unidad_medida'),
        supabase.from('transitos').select('numero, eta').lt('eta', hoy).not('estado', 'in', '(NACIONALIZADO,ANULADO)'),
        supabase.from('v_prestamos').select('empresa, sentido').eq('vencido', true),
      ]);
      if (!vivo || !data) return;
      const extra: { texto: string; enlace: string }[] = [];
      (tr.data ?? []).forEach((t) => extra.push({ texto: `Pedido ${t.numero} de Brasil atrasado: debía llegar el ${t.eta}`, enlace: '/admin?pestana=transito' }));
      (pr.data ?? []).forEach((x) =>
        extra.push({ texto: x.sentido === 'SALIDA' ? `${x.empresa} no ha devuelto un préstamo vencido` : `Debemos devolver un préstamo vencido a ${x.empresa}`, enlace: `/prestamos?sentido=${x.sentido}` })
      );
      setOtros(extra);
      const porSku = new Map<string, Alerta>();
      data.forEach((f) => {
        const x = porSku.get(f.sku) ?? { sku: f.sku, nombre: f.nombre, cantidad: 0, minimo: Number(f.stock_minimo ?? 0), unidad: f.unidad_medida };
        x.cantidad += Number(f.cantidad ?? 0);
        porSku.set(f.sku, x);
      });
      const lista = [...porSku.values()]
        .filter((x) => x.minimo > 0 && x.cantidad <= x.minimo)
        .sort((a, b) => a.cantidad / a.minimo - b.cantidad / b.minimo);
      if (lista.length || extra.length) {
        setAlertas(lista);
        setVisible(true);
      }
    }

    revisar();
    // Al iniciar sesión de nuevo, el aviso vuelve a salir
    const { data: escucha } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_IN') {
        marcarCerrado(false);
        revisar();
      }
      if (evento === 'SIGNED_OUT') marcarCerrado(false);
    });
    return () => {
      vivo = false;
      escucha.subscription.unsubscribe();
    };
  }, [ruta]);

  useEffect(() => {
    if (!visible) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && cerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [visible]);

  function cerrar() {
    marcarCerrado(true);
    setVisible(false);
  }

  if (!visible || ruta === '/login') return null;
  const agotados = alertas.filter((a) => a.cantidad <= 0).length;
  const MAX = 8;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="presentation">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="aviso-titulo"
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-w-lg sm:rounded-xl"
      >
        <div className="rounded-t-xl bg-alerta px-5 py-4 text-white">
          <h2 id="aviso-titulo" className="text-lg font-bold">
            {alertas.length
              ? `${alertas.length} ${alertas.length === 1 ? 'producto está' : 'productos están'} en el stock mínimo`
              : `${otros.length} ${otros.length === 1 ? 'pendiente vencido' : 'pendientes vencidos'}`}
          </h2>
          {agotados > 0 && (
            <p className="text-sm text-white/90">
              {agotados} {agotados === 1 ? 'está agotado' : 'están agotados'}
            </p>
          )}
        </div>
        <ul className="divide-y divide-linea px-5">
          {alertas.slice(0, MAX).map((a) => (
            <li key={a.sku} className="flex items-start justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block font-semibold leading-snug">{a.nombre}</span>
                <span className="block text-xs text-acero">{a.sku}</span>
              </span>
              <span className={`shrink-0 text-right text-sm tabular-nums ${a.cantidad <= 0 ? 'font-bold text-alerta' : ''}`}>
                {a.cantidad <= 0 ? 'Agotado' : `Hay ${numero.format(a.cantidad)} ${UNIDADES[a.unidad] ?? a.unidad}`}
                <span className="block text-xs font-normal text-acero">Mínimo {numero.format(a.minimo)}</span>
              </span>
            </li>
          ))}
        </ul>
        {alertas.length > MAX && <p className="px-5 text-sm text-acero">Y {alertas.length - MAX} más.</p>}
        {otros.length > 0 && (
          <ul className="mx-5 mt-3 space-y-1 rounded-lg border border-alerta bg-alerta-suave p-3 text-sm">
            {otros.slice(0, 6).map((o, i) => (
              <li key={i}>
                <Link href={o.enlace} onClick={cerrar} className="font-semibold text-alerta underline">
                  ⏰ {o.texto}
                </Link>
              </li>
            ))}
            {otros.length > 6 && <li className="text-acero">Y {otros.length - 6} más.</li>}
          </ul>
        )}
        <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
          <Link href="/informes?vista=compras" onClick={cerrar} className="rounded-lg border border-tinta px-4 py-2.5 text-center font-semibold hover:bg-tinta hover:text-white">
            Ver compras sugeridas
          </Link>
          <button autoFocus onClick={cerrar} className="rounded-lg bg-tinta px-5 py-2.5 font-semibold text-white hover:bg-poli hover:text-tinta">
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
