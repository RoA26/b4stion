'use client';

import { useEffect, useState } from 'react';
import { tomarArchivoPendiente } from '@/lib/archivoPendiente';
import Encabezado, { BOTON_ACENTO, BOTON_SECUNDARIO } from '@/components/Encabezado';
import { supabase } from '@/lib/supabase';
import { cargarCatalogo, sinTildes } from '@/lib/catalogo';
import { leerMonto, numero, pesos } from '@/lib/formato';
import { tablaDesdeExcel, tablaDesdePdf } from '@/lib/leerTablas';
import { useSesion } from '@/lib/sesion';

/* Carga masiva de productos desde Excel (solo administrador) */

const UNIDADES_VALIDAS = ['UND', 'M', 'M2', 'KG', 'ROLLO'];
const SINONIMOS_UNIDAD: Record<string, string> = {
  UNIDAD: 'UND', UNIDADES: 'UND', UN: 'UND', U: 'UND', PZA: 'UND', PIEZA: 'UND', JUEGO: 'UND',
  METRO: 'M', METROS: 'M', MT: 'M', MTS: 'M', ML: 'M',
  M2: 'M2', 'M²': 'M2', METRO2: 'M2',
  KILO: 'KG', KILOS: 'KG', KILOGRAMO: 'KG', KILOGRAMOS: 'KG', KGS: 'KG',
  ROLLOS: 'ROLLO',
};

// Columnas de la plantilla y los nombres alternativos que se aceptan
const COLUMNAS = [
  { clave: 'codigo', titulo: 'Código', alias: ['codigo', 'cod', 'sku', 'referencia', 'ref', 'codigo producto', 'cod producto', 'codigo articulo', 'numero de parte', 'no parte'], obligatorio: true },
  { clave: 'nombre', titulo: 'Nombre', alias: ['nombre', 'descripcion', 'producto', 'articulo', 'detalle', 'descripcion del producto', 'nombre del producto', 'descripcion articulo'], obligatorio: true },
  { clave: 'categoria', titulo: 'Categoría', alias: ['categoria', 'grupo', 'linea', 'familia', 'clase'] },
  { clave: 'unidad', titulo: 'Unidad', alias: ['unidad', 'unidad de medida', 'um', 'u/m', 'und', 'medida', 'unid'] },
  { clave: 'existencia', titulo: 'Existencia', alias: ['existencia', 'existencias', 'cantidad', 'cant', 'stock', 'saldo', 'inventario', 'cantidad disponible', 'disponible', 'saldo final'] },
  { clave: 'costo', titulo: 'Costo unitario', alias: ['costo', 'costo unitario', 'costo unit', 'valor unitario', 'vr unitario', 'valor unit', 'precio costo', 'costo promedio', 'precio unitario'] },
  { clave: 'minimo', titulo: 'Stock mínimo', alias: ['minimo', 'stock minimo', 'cantidad minima', 'min'] },
  { clave: 'ubicacion', titulo: 'Ubicación', alias: ['ubicacion', 'ubicación', 'bodega'] },
  { clave: 'codigo_barras', titulo: 'Código de barras', alias: ['codigo de barras', 'código de barras', 'barras', 'qr'] },
] as const;
type Clave = (typeof COLUMNAS)[number]['clave'];

// Reconoce el título de una columna aunque venga con tildes, puntos o mayúsculas
const normalTitulo = (t: string) => sinTildes(t).replace(/[.:#°º()]/g, ' ').replace(/\s+/g, ' ').trim();
function clasificar(titulo: string): Clave | null {
  const t = normalTitulo(titulo);
  if (!t) return null;
  const c = COLUMNAS.find((x) => x.alias.some((a) => normalTitulo(a) === t));
  return c ? c.clave : null;
}

interface Fila {
  n: number;
  datos: Partial<Record<Clave, string>>;
  numeros: Partial<Record<Clave, number>>;
  unidad: string;
  existencia: number | null;
  costo: number | null;
  minimo: number | null;
  errores: string[];
  nuevo: boolean;
}

export default function Importar() {
  const sesion = useSesion();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [archivo, setArchivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<string[] | null>(null);
  const [skus, setSkus] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!sesion.listo) return;
    cargarCatalogo(true).then((l) => {
      setSkus(new Set(l.map((p) => p.sku.toUpperCase())));
      // Si llega un archivo desde ➕ Registrar (Administración), se lee de una vez
      const pendiente = tomarArchivoPendiente();
      if (pendiente) leerArchivo(pendiente);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion.listo]);

  async function descargarPlantilla() {
    const ExcelJS = (await import('exceljs')).default;
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Productos');
    hoja.columns = COLUMNAS.map((c) => ({ header: c.titulo, width: c.clave === 'nombre' ? 40 : 18 }));
    hoja.getRow(1).eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
    });
    hoja.addRow(['BT-PVC-600-2L', 'Banda transportadora PVC 600 mm 2 lonas', 'Bandas transportadoras', 'M', 120, 185000, 20, 'Bodega principal', '']);
    hoja.addRow(['CUC-PU-1500', 'Cuchilla de poliuretano 1500 mm', 'Cuchillas y accesorios', 'UND', 8, 95000, 5, 'Bodega principal', '']);
    const ayuda = libro.addWorksheet('Instrucciones');
    [
      'Llene una fila por producto en la hoja "Productos". Borre las dos filas de ejemplo.',
      'Obligatorios: Código y Nombre. Lo demás es opcional.',
      'Unidad: UND (unidades), M (metros), M2, KG o ROLLO.',
      'Existencia: la cantidad que hay HOY en la ubicación indicada. La app ajusta el inventario a ese número.',
      'Costo unitario: sin IVA, en pesos. Se usa como costo promedio inicial.',
      'Si el código ya existe en la app, se actualizan sus datos; si no existe, se crea.',
      'Código de barras: solo si la etiqueta trae uno distinto al código. Si se deja vacío, se usa el código.',
    ].forEach((t) => ayuda.addRow([t]));
    ayuda.getColumn(1).width = 110;
    const buffer = await libro.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_productos_poliway.xlsx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function leerArchivo(f: File) {
    setError(null);
    setResultado(null);
    setArchivo(f.name);
    try {
      const esPdf = f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf';
      const tabla = esPdf ? await tablaDesdePdf(f, clasificar) : await tablaDesdeExcel(f);

      // Busca la fila de títulos en las primeras 15 filas
      let filaTitulos = -1;
      const mapa: Partial<Record<Clave, number>> = {};
      for (let r = 0; r < Math.min(15, tabla.length) && filaTitulos < 0; r++) {
        const encontrado: Partial<Record<Clave, number>> = {};
        tabla[r].forEach((celda, col) => {
          const c = celda == null ? null : clasificar(String(celda));
          if (c && encontrado[c] === undefined) encontrado[c] = col;
        });
        if (encontrado.codigo !== undefined && encontrado.nombre !== undefined) {
          filaTitulos = r;
          Object.assign(mapa, encontrado);
        }
      }
      if (filaTitulos < 0) throw new Error('No se encontraron las columnas "Código" y "Nombre" (o "Descripción"). Use la plantilla.');

      const leidas: Fila[] = [];
      const vistos = new Set<string>();
      for (let r = filaTitulos + 1; r < tabla.length; r++) {
        const datos: Partial<Record<Clave, string>> = {};
        const numeros: Partial<Record<Clave, number>> = {};
        (Object.keys(mapa) as Clave[]).forEach((k) => {
          const v = tabla[r][mapa[k]!];
          if (typeof v === 'number') numeros[k] = v;
          if (v != null && String(v).trim() !== '') datos[k] = String(v).trim();
        });
        if (!Object.keys(datos).length) continue;
        // Renglones de totales o subtotales (sin código ni nombre) no son productos
        if (!datos.codigo && !datos.nombre) continue;

        const errores: string[] = [];
        const codigo = (datos.codigo ?? '').toUpperCase();
        if (!codigo) errores.push('Falta el código');
        if (!datos.nombre) errores.push('Falta el nombre');
        if (codigo && vistos.has(codigo)) errores.push('Código repetido en el archivo');
        vistos.add(codigo);

        const uTexto = sinTildes(datos.unidad ?? 'UND').toUpperCase().replace(/\s|\./g, '');
        const unidad = UNIDADES_VALIDAS.includes(uTexto) ? uTexto : SINONIMOS_UNIDAD[uTexto] ?? '';
        if (!unidad) errores.push(`Unidad "${datos.unidad}" no reconocida`);

        const num = (k: Clave, nombre: string) => {
          if (datos[k] == null) return null;
          const v = numeros[k] ?? leerMonto(datos[k]!);
          if (!Number.isFinite(v) || v < 0) {
            errores.push(`${nombre} no es un número válido`);
            return null;
          }
          return v;
        };
        leidas.push({
          n: esPdf ? r : r + 1,
          datos: { ...datos, codigo },
          numeros,
          unidad,
          existencia: num('existencia', 'Existencia'),
          costo: num('costo', 'Costo'),
          minimo: num('minimo', 'Mínimo'),
          errores,
          nuevo: !skus.has(codigo),
        });
      }
      if (!leidas.length) throw new Error('El archivo no tiene productos debajo de los títulos.');
      setFilas(leidas);
    } catch (e) {
      setFilas([]);
      setError(`No se pudo leer el archivo: ${(e as Error).message}`);
    }
  }

  async function importar() {
    const validas = filas.filter((f) => !f.errores.length);
    setProgreso({ hechos: 0, total: validas.length });
    setError(null);
    let creados = 0, actualizados = 0, ajustes = 0;
    const fallos: string[] = [];

    // Categorías y ubicaciones: se crean las que falten
    const { data: cats } = await supabase.from('categorias').select('id, nombre');
    const { data: ubis } = await supabase.from('ubicaciones').select('id, nombre');
    const catId = new Map((cats ?? []).map((c) => [sinTildes(c.nombre), c.id as number]));
    const ubiId = new Map((ubis ?? []).map((u) => [sinTildes(u.nombre), u.id as number]));
    const ubiDefecto = (ubis ?? [])[0]?.id as number | undefined;

    async function asegurar(tabla: 'categorias' | 'ubicaciones', mapa: Map<string, number>, nombre?: string) {
      if (!nombre) return undefined;
      const k = sinTildes(nombre);
      if (mapa.has(k)) return mapa.get(k);
      const { data, error } = await supabase.from(tabla).insert({ nombre }).select('id').single();
      if (error) throw new Error(`No se pudo crear "${nombre}" en ${tabla}: ${error.message}`);
      mapa.set(k, data.id);
      return data.id as number;
    }

    for (const f of validas) {
      try {
        const categoria_id = await asegurar('categorias', catId, f.datos.categoria);
        // Los costos están protegidos: el producto se guarda con la función del administrador
        const { data: idProducto, error } = await supabase.rpc('guardar_producto', {
          p_sku: f.datos.codigo,
          p_nombre: f.datos.nombre,
          p_unidad_medida: f.unidad,
          p_codigo_barras: (f.datos.codigo_barras || f.datos.codigo)!.toUpperCase(),
          p_categoria_id: categoria_id ?? null,
          p_stock_minimo: f.minimo ?? null,
          p_costo_unitario: f.costo ?? null,
        });
        if (error) throw new Error(error.code === '23505' ? 'el código de barras ya lo usa otro producto' : error.message);
        const prod = { id: idProducto as string };
        if (f.nuevo) creados++;
        else actualizados++;

        if (f.existencia != null) {
          const ubicacion_id = (await asegurar('ubicaciones', ubiId, f.datos.ubicacion)) ?? ubiDefecto;
          if (!ubicacion_id) throw new Error('no hay ninguna ubicación creada');
          const { data: st } = await supabase.from('stock').select('cantidad').eq('producto_id', prod.id).eq('ubicacion_id', ubicacion_id).maybeSingle();
          const diferencia = Math.round((f.existencia - Number(st?.cantidad ?? 0)) * 1000) / 1000;
          if (diferencia !== 0) {
            const { error: e2 } = await supabase.rpc('registrar_movimiento', {
              p_producto_id: prod.id,
              p_ubicacion_id: ubicacion_id,
              p_tipo: 'AJUSTE',
              p_cantidad: diferencia,
              p_nota: `Carga desde Excel (${archivo})`,
            });
            if (e2) throw new Error(`existencia: ${e2.message}`);
            ajustes++;
          }
        }
      } catch (e) {
        fallos.push(`Fila ${f.n} (${f.datos.codigo}): ${(e as Error).message}`);
      }
      setProgreso((p) => (p ? { ...p, hechos: p.hechos + 1 } : p));
    }

    await cargarCatalogo(true);
    setResultado([
      `${creados} productos creados`,
      `${actualizados} productos actualizados`,
      `${ajustes} existencias ajustadas`,
      ...(fallos.length ? [`${fallos.length} filas con problemas:`, ...fallos] : []),
    ]);
    setProgreso(null);
    setFilas([]);
  }

  if (!sesion.listo) return <p className="py-24 text-center text-acero">Cargando…</p>;
  if (!sesion.esAdmin)
    return (
      <main className="mx-auto max-w-4xl px-4 pt-6">
        <Encabezado titulo="Importar Excel" />
        <p className="mt-6 text-acero">Esta pantalla es solo para el administrador.</p>
      </main>
    );

  const conError = filas.filter((f) => f.errores.length).length;
  const valorTotal = filas.reduce((s, f) => s + (f.errores.length ? 0 : (f.existencia ?? 0) * (f.costo ?? 0)), 0);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <Encabezado titulo="Importar Excel" />

      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        <li className="rounded-lg border border-linea bg-white p-4">
          <p className="font-bold">1. Descargue la plantilla</p>
          <p className="mt-1 text-sm text-acero">Trae las columnas y dos filas de ejemplo.</p>
          <button onClick={descargarPlantilla} className={`mt-3 ${BOTON_SECUNDARIO}`}>
            Descargar plantilla
          </button>
        </li>
        <li className="rounded-lg border border-linea bg-white p-4">
          <p className="font-bold">2. Súbala, o suba su propio archivo</p>
          <p className="mt-1 text-sm text-acero">Excel o PDF (informe exportado de un programa). Debe tener columnas de código y nombre o descripción.</p>
          <label className={`mt-3 inline-block cursor-pointer ${BOTON_SECUNDARIO}`}>
            Escoger archivo
            <input
              type="file"
              accept=".xlsx,.pdf,application/pdf"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) leerArchivo(f);
                e.target.value = '';
              }}
            />
          </label>
        </li>
        <li className="rounded-lg border border-linea bg-white p-4">
          <p className="font-bold">3. Revise e importe</p>
          <p className="mt-1 text-sm text-acero">Las filas con problemas se muestran en rojo y no se cargan.</p>
          <button onClick={importar} disabled={!filas.length || filas.length === conError || !!progreso} className={`mt-3 ${BOTON_ACENTO}`}>
            {progreso ? `Importando ${progreso.hechos} de ${progreso.total}…` : `Importar ${filas.length - conError} productos`}
          </button>
        </li>
      </ol>

      {error && <p className="mt-4 rounded border border-alerta bg-alerta-suave px-4 py-3 text-sm font-medium text-alerta">{error}</p>}

      {resultado && (
        <div className="mt-4 rounded-lg border-l-4 border-poli bg-white p-4">
          <p className="font-bold">Importación terminada</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {resultado.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {filas.length > 0 && (
        <section className="mt-5">
          <p className="mb-2 text-sm text-acero">
            {archivo}: {filas.length} filas, {filas.filter((f) => f.nuevo && !f.errores.length).length} nuevas,{' '}
            {filas.filter((f) => !f.nuevo && !f.errores.length).length} para actualizar, {conError} con problemas. Valor del inventario
            cargado: {pesos.format(valorTotal)}.
          </p>
          <div className="overflow-x-auto rounded-lg border border-linea bg-white">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-tinta text-white">
                <tr>
                  {['Fila', 'Estado', 'Código', 'Nombre', 'Categoría', 'Unidad', 'Existencia', 'Costo', 'Mínimo', 'Ubicación'].map((t) => (
                    <th key={t} className="px-3 py-2 font-semibold">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.n} className={`border-t border-linea align-top ${f.errores.length ? 'bg-alerta-suave' : ''}`}>
                    <td className="px-3 py-2 tabular-nums">{f.n}</td>
                    <td className="px-3 py-2">
                      {f.errores.length ? (
                        <span className="font-semibold text-alerta">{f.errores.join('. ')}</span>
                      ) : f.nuevo ? (
                        <span className="rounded bg-poli px-2 py-0.5 text-xs font-bold">Nuevo</span>
                      ) : (
                        <span className="rounded border border-tinta px-2 py-0.5 text-xs font-bold">Actualiza</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono">{f.datos.codigo}</td>
                    <td className="px-3 py-2">{f.datos.nombre}</td>
                    <td className="px-3 py-2">{f.datos.categoria}</td>
                    <td className="px-3 py-2">{f.unidad}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.existencia != null ? numero.format(f.existencia) : ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.costo != null ? pesos.format(f.costo) : ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.minimo != null ? numero.format(f.minimo) : ''}</td>
                    <td className="px-3 py-2">{f.datos.ubicacion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
