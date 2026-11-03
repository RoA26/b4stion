'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Campana from '@/components/Campana';
import Buscador from '@/components/Buscador';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { normalizarItem, type ItemInventario } from '@/lib/tipos';
import TablaInventario, { type Transito } from '@/components/TablaInventario';
import Menu from '@/components/Menu';
import { NOMBRE_ROL, useSesion } from '@/lib/sesion';

const pesos = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export default function TableroInventario() {
  const router = useRouter();
  const sesion = useSesion();
  const [correo, setCorreo] = useState<string | null>(null);
  const [items, setItems] = useState<ItemInventario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [soloBajoMinimo, setSoloBajoMinimo] = useState(false);
  const [categoria, setCategoria] = useState('');
  const [enVivo, setEnVivo] = useState(false);
  const [transito, setTransito] = useState<Transito | undefined>(undefined);

  // Lee la vista v_inventario (RLS: solo funciona con sesión iniciada)
  const cargarInventario = useCallback(async () => {
    const { data, error } = await supabase
      .from('v_inventario')
      .select('*')
      .order('nombre', { ascending: true });

    if (error) {
      setError(`No se pudo cargar el inventario: ${error.message}`);
    } else {
      setError(null);
      setItems((data ?? []).map(normalizarItem));
    }
    setCargando(false);
  }, []);

  // 1. Verificar sesión; si no hay, enviar al login
  useEffect(() => {
    let montado = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!montado) return;
      if (!data.session) {
        router.replace('/login');
        return;
      }
      setCorreo(data.session.user.email ?? null);
      cargarInventario();
    });

    const { data: escucha } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      if (!sesion) router.replace('/login');
    });

    return () => {
      montado = false;
      escucha.subscription.unsubscribe();
    };
  }, [router, cargarInventario]);

  // Mercancía en tránsito (solo administrador)
  useEffect(() => {
    if (!sesion.esAdmin) return;
    supabase
      .from('v_transito_producto')
      .select('producto_id, en_transito, llega')
      .then(({ data }) =>
        setTransito(Object.fromEntries((data ?? []).map((t) => [t.producto_id, { cantidad: Number(t.en_transito), llega: t.llega }])))
      );
  }, [sesion.esAdmin, items]);

  // 2. Tiempo real: cuando cambia la tabla stock, recargar
  useEffect(() => {
    if (!correo) return;

    const canal = supabase
      .channel('tablero-stock')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock' }, () => {
        cargarInventario();
      })
      .subscribe((estado) => setEnVivo(estado === 'SUBSCRIBED'));

    return () => {
      supabase.removeChannel(canal);
    };
  }, [correo, cargarInventario]);

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return items.filter((item) => {
      if (categoria && (item.categoria ?? 'Sin categoría') !== categoria) return false;
      if (soloBajoMinimo && !item.bajo_minimo) return false;
      if (!texto) return true;
      return [item.nombre, item.sku, item.codigo_barras, item.categoria ?? '']
        .some((campo) => campo.toLowerCase().includes(texto));
    });
  }, [items, busqueda, soloBajoMinimo, categoria]);

  const categorias = useMemo(
    () => [...new Set(items.map((i) => i.categoria ?? 'Sin categoría'))].sort((a, b) => a.localeCompare(b, 'es')),
    [items]
  );

  // El resumen se recalcula según la categoría escogida
  const resumen = useMemo(() => {
    const base = categoria ? items.filter((i) => (i.categoria ?? 'Sin categoría') === categoria) : items;
    return {
      referencias: new Set(base.map((i) => i.producto_id)).size,
      bajoMinimo: base.filter((i) => i.bajo_minimo).length,
      valor: base.reduce((total, i) => total + i.valor_total, 0),
      enTransito: transito ? new Set(base.filter((i) => transito[i.producto_id]).map((i) => i.producto_id)).size : 0,
    };
  }, [items, categoria, transito]);

  async function cerrarSesion() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      {/* Encabezado */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-tinta pb-4">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-blaster.png" alt="Blaster by Poliway" className="h-9 w-auto" />
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">Inventario Poliway</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-acero sm:gap-4">
          <span className="flex items-center gap-1.5" title="Los cambios de stock aparecen solos">
            <span
              aria-hidden
              className={`inline-block h-2 w-2 rounded-full ${enVivo ? 'bg-poli' : 'bg-linea'}`}
            />
            {enVivo ? 'En vivo' : 'Conectando'}
          </span>
          {sesion.listo && (
            <span className="hidden sm:inline">
              {sesion.nombre} <span className="text-acero">({NOMBRE_ROL[sesion.rol]})</span>
            </span>
          )}
          <Buscador />
          <Campana />
          <button
            onClick={cerrarSesion}
            className="rounded border border-tinta px-3 py-1.5 font-medium text-tinta hover:bg-tinta hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {sesion.listo && <Menu rol={sesion.rol} />}

      {/* Resumen */}
      <dl className={`grid border-y border-linea py-4 text-sm ${sesion.esAdmin ? 'grid-cols-2 gap-y-3 sm:grid-cols-4' : 'grid-cols-2'}`}>
        <div>
          <dt className="text-acero">Referencias</dt>
          <dd className="text-2xl font-semibold tabular-nums">{resumen.referencias}</dd>
        </div>
        <div>
          <dt className="text-acero">Bajo el mínimo</dt>
          <dd className={`text-2xl font-semibold tabular-nums ${resumen.bajoMinimo > 0 ? 'text-alerta' : ''}`}>
            {resumen.bajoMinimo}
          </dd>
        </div>
        {sesion.esAdmin && (
          <div>
            <dt className="text-acero">Productos en tránsito</dt>
            <dd className="text-2xl font-semibold tabular-nums text-oro-oscuro">{resumen.enTransito}</dd>
          </div>
        )}
        {sesion.esAdmin && (
          <div>
            <dt className="text-acero">Valor total en bodega{categoria ? ` (${categoria})` : ''}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{pesos.format(resumen.valor)}</dd>
          </div>
        )}
      </dl>

      {/* Filtros */}
      <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
        <label className="flex-1">
          <span className="sr-only">Buscar producto</span>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, SKU o código"
            className="w-full rounded border border-linea bg-white px-3 py-2.5 text-base placeholder:text-acero/70 focus:border-poli focus:outline-none focus:ring-2 focus:ring-poli/30"
          />
        </label>
        <label>
          <span className="sr-only">Filtrar por categoría</span>
          <select
            id="filtro-categoria"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="w-full rounded border border-linea bg-white px-3 py-2.5 text-base focus:border-poli focus:outline-none focus:ring-2 focus:ring-poli/30 sm:w-56"
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => setSoloBajoMinimo((v) => !v)}
          aria-pressed={soloBajoMinimo}
          className={`rounded border px-4 py-2.5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta ${
            soloBajoMinimo
              ? 'border-alerta bg-alerta text-white'
              : 'border-linea bg-white text-tinta hover:border-alerta'
          }`}
        >
          Solo bajo el mínimo ({resumen.bajoMinimo})
        </button>
      </div>

      {/* Contenido */}
      {cargando ? (
        <p className="py-12 text-center text-acero">Cargando inventario…</p>
      ) : error ? (
        <div className="rounded border border-alerta bg-alerta-suave p-4">
          <p className="font-medium text-alerta">{error}</p>
          <button onClick={cargarInventario} className="mt-3 font-semibold text-tinta underline">
            Reintentar
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-acero">
          Aún no hay productos registrados. Agréguelos en Supabase o con la carga masiva desde Excel.
        </p>
      ) : filtrados.length === 0 ? (
        <p className="py-12 text-center text-acero">
          Ningún producto coincide con la búsqueda{categoria ? ` en ${categoria}` : ''}
          {soloBajoMinimo ? ' entre los que están bajo el mínimo' : ''}.
        </p>
      ) : (
        <TablaInventario items={filtrados} verCostos={sesion.esAdmin} transito={sesion.esAdmin ? transito : undefined} />
      )}
    </main>
  );
}
