'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Encabezado, { BOTON_ACENTO, BOTON_PRINCIPAL, BOTON_SECUNDARIO, CONTROL } from '@/components/Encabezado';
import BuscadorProducto from '@/components/BuscadorProducto';
import SelectorUbicacion from '@/components/SelectorUbicacion';
import { supabase } from '@/lib/supabase';
import { cargarCatalogo, porCodigo, type ProductoBasico } from '@/lib/catalogo';
import { exportarExcel, exportarPdf, type Columna } from '@/lib/exportar';
import { leerMonto, numero, pesos, UNIDADES } from '@/lib/formato';
import { useSesion } from '@/lib/sesion';
import { decirAlAsistente, useOrdenVoz } from '@/lib/voz/bus';

/* Conteo físico: se cuenta la bodega, se comparan las diferencias y el
   administrador aprueba los ajustes. */

interface Conteo {
  id: number;
  ubicacion_id: number;
  estado: 'ABIERTO' | 'APROBADO' | 'ANULADO';
  nota: string | null;
  creado: string;
  cerrado: string | null;
  ajustes: number | null;
}
interface Linea {
  producto: ProductoBasico;
  sistema: number;
  contado: number;
  diferencia: number;
  valor: number;
}

const fecha = (iso: string) => new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' });

export default function ConteoFisico() {
  const sesion = useSesion();
  const [conteos, setConteos] = useState<Conteo[]>([]);
  const [ubicaciones, setUbicaciones] = useState<{ id: number; nombre: string }[]>([]);
  const [actual, setActual] = useState<Conteo | null>(null);
  const [catalogo, setCatalogo] = useState<ProductoBasico[]>([]);
  const [contados, setContados] = useState<Record<string, number>>({});
  const [sistema, setSistema] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Formulario de nuevo conteo
  const [nuevaUbic, setNuevaUbic] = useState('');
  const [nuevaNota, setNuevaNota] = useState('');

  // Captura
  const [sumarUno, setSumarUno] = useState(false);
  const [elegido, setElegido] = useState<ProductoBasico | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [confirmar, setConfirmar] = useState<'' | 'aprobar' | 'anular'>('');
  const [trabajando, setTrabajando] = useState(false);

  const cargarLista = useCallback(async () => {
    const [c, u] = await Promise.all([
      supabase.from('conteos').select('id, ubicacion_id, estado, nota, creado, cerrado, ajustes').order('creado', { ascending: false }).limit(30),
      supabase.from('ubicaciones').select('id, nombre').eq('activo', true).order('nombre'),
    ]);
    if (c.error) setError(`No se pudieron leer los conteos: ${c.error.message}`);
    setConteos((c.data ?? []) as Conteo[]);
    setUbicaciones((u.data ?? []) as { id: number; nombre: string }[]);
    const primera = u.data?.[0];
    if (primera) setNuevaUbic((v) => v || String(primera.id));
  }, []);

  const cargarConteo = useCallback(async (c: Conteo) => {
    const [items, st, cat] = await Promise.all([
      supabase.from('conteo_items').select('producto_id, cantidad').eq('conteo_id', c.id),
      supabase.from('stock').select('producto_id, cantidad').eq('ubicacion_id', c.ubicacion_id),
      cargarCatalogo(true),
    ]);
    setCatalogo(cat);
    setContados(Object.fromEntries((items.data ?? []).map((i) => [i.producto_id, Number(i.cantidad)])));
    setSistema(Object.fromEntries((st.data ?? []).map((i) => [i.producto_id, Number(i.cantidad)])));
  }, []);

  useEffect(() => {
    if (sesion.listo) cargarLista();
  }, [sesion.listo, cargarLista]);

  // Varias personas pueden contar a la vez: se actualiza en vivo
  useEffect(() => {
    if (!actual) return;
    cargarConteo(actual);
    const canal = supabase
      .channel(`conteo-${actual.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conteo_items', filter: `conteo_id=eq.${actual.id}` }, () =>
        cargarConteo(actual)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [actual, cargarConteo]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2500);
    return () => clearTimeout(t);
  }, [aviso]);

  const nombreUbic = (id: number) => ubicaciones.find((u) => u.id === id)?.nombre ?? `Ubicación ${id}`;

  const lineas = useMemo<Linea[]>(() => {
    const porId = new Map(catalogo.map((p) => [p.id, p]));
    return Object.entries(contados)
      .map(([id, contado]) => {
        const producto = porId.get(id);
        if (!producto) return null;
        const sis = sistema[id] ?? 0;
        const diferencia = Math.round((contado - sis) * 1000) / 1000;
        return { producto, sistema: sis, contado, diferencia, valor: diferencia * producto.costo_unitario };
      })
      .filter((x): x is Linea => !!x)
      .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia) || a.producto.nombre.localeCompare(b.producto.nombre));
  }, [contados, sistema, catalogo]);

  const conDiferencia = lineas.filter((l) => l.diferencia !== 0);
  const sinContar = catalogo.filter((p) => contados[p.id] === undefined && (sistema[p.id] ?? 0) > 0);

  async function crear() {
    setTrabajando(true);
    const { data, error } = await supabase
      .from('conteos')
      .insert({ ubicacion_id: Number(nuevaUbic), nota: nuevaNota.trim() || null })
      .select('id, ubicacion_id, estado, nota, creado, cerrado, ajustes')
      .single();
    setTrabajando(false);
    if (error) return setError(`No se pudo crear el conteo: ${error.message}`);
    setNuevaNota('');
    setActual(data as Conteo);
    cargarLista();
  }

  async function guardar(p: ProductoBasico, valor: number) {
    if (!actual) return;
    const { error } = await supabase
      .from('conteo_items')
      .upsert({ conteo_id: actual.id, producto_id: p.id, cantidad: valor, contado_por: sesion.id, actualizado: new Date().toISOString() });
    if (error) return setError(`No se pudo guardar: ${error.message}`);
    setContados((c) => ({ ...c, [p.id]: valor }));
    setAviso(`${p.nombre}: ${numero.format(valor)} ${UNIDADES[p.unidad_medida] ?? ''}`);
  }

  function alLeer(p: ProductoBasico) {
    setError(null);
    if (sumarUno) {
      guardar(p, (contados[p.id] ?? 0) + 1);
      return;
    }
    setElegido(p);
    setCantidad(contados[p.id] !== undefined ? String(contados[p.id]) : '');
  }

  async function confirmarCantidad() {
    if (!elegido) return;
    const v = leerMonto(cantidad);
    if (!Number.isFinite(v) || v < 0) return setError('Escriba la cantidad contada (cero o más).');
    await guardar(elegido, v);
    setElegido(null);
    setCantidad('');
  }

  async function quitar(p: ProductoBasico) {
    if (!actual) return;
    await supabase.from('conteo_items').delete().eq('conteo_id', actual.id).eq('producto_id', p.id);
    setContados((c) => {
      const n = { ...c };
      delete n[p.id];
      return n;
    });
  }

  async function cerrar(accion: 'aprobar' | 'anular') {
    if (!actual) return;
    setTrabajando(true);
    setError(null);
    if (accion === 'aprobar') {
      const { data, error } = await supabase.rpc('aprobar_conteo', { p_conteo_id: actual.id });
      if (error) setError(error.message);
      else setAviso(`Conteo aprobado: ${data} ajustes aplicados al inventario`);
    } else {
      const { error } = await supabase.from('conteos').update({ estado: 'ANULADO', cerrado: new Date().toISOString(), cerrado_por: sesion.id }).eq('id', actual.id);
      if (error) setError(error.message);
      else setAviso('Conteo anulado: el inventario no se modificó');
    }
    setTrabajando(false);
    setConfirmar('');
    setActual(null);
    cargarLista();
  }

  /* ---------- Conteo por voz (asistente Blaster): "pistón Destroyer 4" ---------- */
  useOrdenVoz(['conteo'], sesion.listo, async (_t, datos) => {
    const d = datos as { sku: string; cantidad: number; sumar: boolean };
    // Si no hay un conteo abierto en pantalla, se usa el último conteo abierto
    let conteo = actual;
    if (!conteo) {
      const { data } = await supabase
        .from('conteos')
        .select('id, ubicacion_id, estado, nota, creado, cerrado, ajustes')
        .eq('estado', 'ABIERTO')
        .order('creado', { ascending: false })
        .limit(1);
      conteo = (data?.[0] as Conteo | undefined) ?? null;
      if (!conteo) return decirAlAsistente('No hay un conteo abierto. Escoja la bodega, presione «Iniciar» y luego dígame lo que va contando.', false);
      setActual(conteo);
    }
    const p = porCodigo(await cargarCatalogo(), d.sku);
    if (!p) return decirAlAsistente('No encontré ese producto en el catálogo.', false);
    let valor = d.cantidad;
    if (d.sumar) {
      const { data } = await supabase.from('conteo_items').select('cantidad').eq('conteo_id', conteo.id).eq('producto_id', p.id).maybeSingle();
      valor = Number(data?.cantidad ?? 0) + d.cantidad;
    }
    const { error } = await supabase
      .from('conteo_items')
      .upsert({ conteo_id: conteo.id, producto_id: p.id, cantidad: valor, contado_por: sesion.id, actualizado: new Date().toISOString() });
    if (error) return decirAlAsistente(`No se pudo guardar: ${error.message}`, false);
    setContados((c) => ({ ...c, [p.id]: valor }));
    setAviso(`${p.nombre}: ${numero.format(valor)} ${UNIDADES[p.unidad_medida] ?? ''}`);
    decirAlAsistente(`${p.nombre}: ${numero.format(valor)}${d.sumar ? ' en total' : ''}.`);
  });

  async function exportar(formato: 'excel' | 'pdf') {
    if (!actual) return;
    const columnas: Columna<Linea>[] = [
      { titulo: 'SKU', ancho: 22, tipo: 'texto', valor: (l) => l.producto.sku },
      { titulo: 'Producto', ancho: 40, tipo: 'texto', valor: (l) => l.producto.nombre },
      { titulo: 'Sistema', ancho: 11, tipo: 'numero', valor: (l) => l.sistema },
      { titulo: 'Contado', ancho: 11, tipo: 'numero', valor: (l) => l.contado },
      { titulo: 'Diferencia', ancho: 11, tipo: 'numero', valor: (l) => l.diferencia },
      { titulo: 'Unidad', ancho: 8, tipo: 'texto', valor: (l) => UNIDADES[l.producto.unidad_medida] ?? l.producto.unidad_medida },
      { titulo: 'Valor diferencia', ancho: 16, tipo: 'moneda', valor: (l) => l.valor },
    ];
    const inf = {
      titulo: `Conteo físico #${actual.id}`,
      archivo: `conteo_${actual.id}`,
      detalle: [
        `${nombreUbic(actual.ubicacion_id)}. Iniciado el ${fecha(actual.creado)}. Estado: ${actual.estado.toLowerCase()}`,
        `Generado por ${sesion.nombre}${actual.nota ? `. Nota: ${actual.nota}` : ''}`,
      ],
      // Los valores en pesos solo los ve el administrador
      columnas: (sesion.esAdmin ? columnas : columnas.filter((c) => c.tipo !== 'moneda')) as Columna<unknown>[],
      filas: lineas as unknown[],
      totales: [
        { etiqueta: 'Productos contados', valor: String(lineas.length) },
        { etiqueta: 'Con diferencia', valor: String(conDiferencia.length) },
        ...(sesion.esAdmin ? [{ etiqueta: 'Valor neto de diferencias', valor: pesos.format(conDiferencia.reduce((s, l) => s + l.valor, 0)) }] : []),
      ],
    };
    if (formato === 'excel') await exportarExcel(inf);
    else await exportarPdf(inf);
  }

  if (!sesion.listo) return <p className="py-24 text-center text-acero">Cargando…</p>;

  /* ---------------------------- Conteo abierto ---------------------------- */
  if (actual) {
    const abierto = actual.estado === 'ABIERTO' && sesion.puedeEditar;
    return (
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
        <Encabezado titulo={`Conteo #${actual.id}`}>
          <button onClick={() => setActual(null)} className="rounded border border-tinta px-3 py-1.5 font-medium hover:bg-tinta hover:text-white">
            Todos los conteos
          </button>
        </Encabezado>
        <p className="mt-3 text-acero">
          {nombreUbic(actual.ubicacion_id)}, iniciado el {fecha(actual.creado)}. {actual.nota}
        </p>

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          {abierto && (
            <section aria-label="Contar" className="space-y-3">
              <label className="flex items-center gap-3 rounded-lg border border-linea bg-white p-3">
                <input type="checkbox" checked={sumarUno} onChange={(e) => setSumarUno(e.target.checked)} className="h-5 w-5 accent-[#17191C]" />
                <span>
                  <span className="block font-semibold">Cada lectura suma 1</span>
                  <span className="block text-sm text-acero">Útil con la pistola: se lee cada pieza una por una.</span>
                </span>
              </label>

              {!elegido ? (
                <BuscadorProducto activo={!elegido} onElegir={alLeer} />
              ) : (
                <div className="rounded-lg border-2 border-tinta bg-white p-4">
                  <p className="text-sm text-acero">{elegido.sku}</p>
                  <p className="text-lg font-bold leading-snug">{elegido.nombre}</p>
                  <label className="mt-3 block">
                    <span className="mb-1 block text-sm font-medium">Cantidad contada ({UNIDADES[elegido.unidad_medida] ?? elegido.unidad_medida})</span>
                    <input
                      id="contada"
                      autoFocus
                      inputMode="decimal"
                      value={cantidad}
                      onChange={(e) => setCantidad(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && confirmarCantidad()}
                      className={`${CONTROL} text-center text-2xl font-semibold tabular-nums`}
                    />
                  </label>
                  <div className="mt-3 flex gap-2">
                    <button onClick={confirmarCantidad} className={BOTON_PRINCIPAL}>
                      Guardar
                    </button>
                    <button onClick={() => setElegido(null)} className={BOTON_SECUNDARIO}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          <section aria-label="Resultado del conteo" className={abierto ? '' : 'lg:col-span-2'}>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-lg bg-white p-3">
                <dt className="text-acero">Contados</dt>
                <dd className="text-xl font-bold tabular-nums">{lineas.length}</dd>
              </div>
              <div className="rounded-lg bg-white p-3">
                <dt className="text-acero">Con diferencia</dt>
                <dd className={`text-xl font-bold tabular-nums ${conDiferencia.length ? 'text-alerta' : ''}`}>{conDiferencia.length}</dd>
              </div>
              <div className={`rounded-lg bg-white p-3 ${sesion.esAdmin ? '' : 'hidden'}`}>
                <dt className="text-acero">Valor diferencias</dt>
                <dd className="text-xl font-bold tabular-nums">{pesos.format(conDiferencia.reduce((s, l) => s + l.valor, 0))}</dd>
              </div>
            </dl>

            {sinContar.length > 0 && abierto && (
              <p className="mt-2 text-sm text-acero">
                Faltan por contar {sinContar.length} productos que según el sistema tienen existencia en esta ubicación.
              </p>
            )}

            <div className="mt-3 overflow-x-auto rounded-lg border border-linea bg-white">
              {lineas.length === 0 ? (
                <p className="px-4 py-8 text-center text-acero">Lea o busque el primer producto para empezar a contar.</p>
              ) : (
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-tinta text-white">
                    <tr>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2 text-right">Sistema</th>
                      <th className="px-3 py-2 text-right">Contado</th>
                      <th className="px-3 py-2 text-right">Diferencia</th>
                      {abierto && <th className="px-3 py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l) => (
                      <tr key={l.producto.id} className="border-t border-linea">
                        <td className="px-3 py-2">
                          <span className="block font-semibold leading-snug">{l.producto.nombre}</span>
                          <span className="text-xs text-acero">{l.producto.sku}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{numero.format(l.sistema)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{numero.format(l.contado)}</td>
                        <td className={`px-3 py-2 text-right font-bold tabular-nums ${l.diferencia < 0 ? 'text-alerta' : l.diferencia > 0 ? 'text-oro-oscuro' : 'text-acero'}`}>
                          {l.diferencia > 0 ? '+' : ''}
                          {numero.format(l.diferencia)}
                        </td>
                        {abierto && (
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => {
                                setElegido(l.producto);
                                setCantidad(String(l.contado));
                              }}
                              className="text-xs font-semibold underline"
                            >
                              Corregir
                            </button>{' '}
                            <button onClick={() => quitar(l.producto)} className="ml-2 text-xs font-semibold text-alerta underline">
                              Quitar
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => exportar('excel')} disabled={!lineas.length} className={BOTON_SECUNDARIO}>
                Descargar Excel
              </button>
              <button onClick={() => exportar('pdf')} disabled={!lineas.length} className={BOTON_SECUNDARIO}>
                Descargar PDF
              </button>
            </div>

            {abierto && (
              <div className="mt-6 rounded-lg border border-linea bg-white p-4">
                <p className="font-bold">Cerrar el conteo</p>
                {confirmar ? (
                  <div className="mt-2">
                    <p className="text-sm">
                      {confirmar === 'aprobar'
                        ? `Se ajustará el inventario en ${conDiferencia.length} productos para que quede igual a lo contado. Queda registrado a su nombre. ¿Continuar?`
                        : 'El conteo se anulará y el inventario no cambiará. ¿Continuar?'}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => cerrar(confirmar)} disabled={trabajando} className={confirmar === 'aprobar' ? BOTON_ACENTO : BOTON_PRINCIPAL}>
                        {trabajando ? 'Procesando…' : confirmar === 'aprobar' ? 'Sí, aprobar y ajustar' : 'Sí, anular'}
                      </button>
                      <button onClick={() => setConfirmar('')} className={BOTON_SECUNDARIO}>
                        No, volver
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {sesion.esAdmin ? (
                      <button onClick={() => setConfirmar('aprobar')} disabled={!lineas.length} className={BOTON_ACENTO}>
                        Aprobar y ajustar inventario
                      </button>
                    ) : (
                      <p className="text-sm text-acero">Cuando termine, el administrador revisa las diferencias y aprueba el ajuste.</p>
                    )}
                    <button onClick={() => setConfirmar('anular')} className={BOTON_SECUNDARIO}>
                      Anular conteo
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {error && <p role="alert" className="mt-4 rounded border border-alerta bg-alerta-suave px-4 py-3 text-sm font-medium text-alerta">{error}</p>}
        {aviso && (
          <div role="status" className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[min(92vw,480px)] -translate-x-1/2 rounded-lg bg-poli px-4 py-3 text-center font-semibold text-tinta shadow-lg">
            {aviso}
          </div>
        )}
      </main>
    );
  }

  /* ---------------------------- Lista de conteos ---------------------------- */
  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-6 sm:px-6">
      <Encabezado titulo="Conteo físico" />
      <p className="mt-4 max-w-3xl text-acero">
        Cuente lo que hay en la bodega con la pistola o el celular. La app compara contra el sistema y muestra las diferencias. Al final, el
        administrador aprueba y el inventario queda igual a lo contado, con constancia de quién ajustó.
      </p>

      {sesion.puedeEditar && (
        <section className="mt-5 rounded-lg border border-linea bg-white p-4" aria-label="Nuevo conteo">
          <h2 className="font-bold">Iniciar un conteo</h2>
          <div className="mt-3 grid items-start gap-3 sm:grid-cols-[280px_1fr_auto]">
            <SelectorUbicacion
              id="nueva-ubic"
              ubicaciones={ubicaciones}
              valor={nuevaUbic}
              onCambio={setNuevaUbic}
              onCreada={(u) => setUbicaciones((l) => [...l, { id: Number(u.id), nombre: u.nombre }])}
              puedeCrear={sesion.puedeEditar}
            />
            <input id="nueva-nota" value={nuevaNota} onChange={(e) => setNuevaNota(e.target.value)} placeholder="Nota (opcional). Ej: Conteo de cierre de mes" className={CONTROL} />
            <button onClick={crear} disabled={!nuevaUbic || trabajando} className={BOTON_ACENTO}>
              Iniciar
            </button>
          </div>
        </section>
      )}

      {error && <p className="mt-4 rounded border border-alerta bg-alerta-suave px-4 py-3 text-sm font-medium text-alerta">{error}</p>}

      <section className="mt-6" aria-label="Conteos">
        {conteos.length === 0 ? (
          <p className="py-8 text-center text-acero">Todavía no se ha hecho ningún conteo.</p>
        ) : (
          <ul className="divide-y divide-linea rounded-lg border border-linea bg-white">
            {conteos.map((c) => (
              <li key={c.id}>
                <button onClick={() => setActual(c)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-concreto">
                  <span>
                    <span className="block font-semibold">
                      Conteo #{c.id}, {nombreUbic(c.ubicacion_id)}
                    </span>
                    <span className="block text-sm text-acero">
                      {fecha(c.creado)}
                      {c.nota ? `. ${c.nota}` : ''}
                    </span>
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold ${
                      c.estado === 'ABIERTO' ? 'bg-poli text-tinta' : c.estado === 'APROBADO' ? 'bg-tinta text-white' : 'border border-linea text-acero'
                    }`}
                  >
                    {c.estado === 'ABIERTO' ? 'En curso' : c.estado === 'APROBADO' ? `Aprobado, ${c.ajustes ?? 0} ajustes` : 'Anulado'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {aviso && (
        <div role="status" className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[min(92vw,480px)] -translate-x-1/2 rounded-lg bg-poli px-4 py-3 text-center font-semibold text-tinta shadow-lg">
          {aviso}
        </div>
      )}
    </main>
  );
}
