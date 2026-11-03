// Llena el formato oficial de Poliway (POL-CL-DIARIO-CAN Rev. 2.0) con una inspección.
// Usa el mismo Excel de Poliway como plantilla (public/plantillas/poliway-check-list.xlsx),
// así salen el logo, el sello ISO, los colores y la distribución originales.
//  - Inspección a fondo → hoja "Hoja de vida Cañones"
//  - Ronda diaria       → hoja "Checklist Diario" (cada cañón en su fila, por ubicación)

import { PUNTOS_RONDA, HALLAZGOS_RONDA, type DatosInspeccion, type Resultado } from '@/lib/inspeccion';

const PLANTILLA = '/plantillas/poliway-check-list.xlsx';
type Hoja = import('exceljs').Worksheet;
type Libro = import('exceljs').Workbook;

const ROJO = { argb: 'FFB3261E' };
const fechaLarga = (f: string) => new Date(`${f.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
const marca = (r: Resultado | undefined) => (r === 'OK' ? '✓' : r === 'FALLA' ? 'X' : r === 'NA' ? 'N/A' : '');
const CENTRO = { horizontal: 'center', vertical: 'middle' } as const;
// Marca de una casilla (✓, X, N/A, ☑) centrada; la falla en X mayúscula roja y más grande
function marcar(h: Hoja, celda: string, valor: string, falla: boolean) {
  if (!valor) return;
  const c = h.getCell(celda);
  c.value = valor;
  c.alignment = { ...(c.alignment ?? {}), ...CENTRO };
  c.font = falla ? { ...(c.font ?? {}), bold: true, size: 13, color: ROJO } : { ...(c.font ?? {}), bold: false, color: NEGRO };
}
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/^A[O](\d)/, 'A0$1')
    .replace(/[^A-Z0-9]/g, '');
const normUb = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^ubicacion\s*:\s*/, '')
    .replace(/[^a-z0-9]/g, '');

// Texto de una celda sin fallar con celdas combinadas vacías
function texto(h: Hoja, celda: string): string {
  const c = h.getCell(celda);
  try {
    return String(c.text ?? '').trim();
  } catch {
    const v = c.value;
    return v == null || typeof v === 'object' ? '' : String(v).trim();
  }
}

async function abrirPlantilla(): Promise<Libro> {
  const ExcelJS = (await import('exceljs')).default;
  const r = await fetch(PLANTILLA);
  if (!r.ok) throw new Error('No se encontró la plantilla del formato de Poliway.');
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await r.arrayBuffer());
  return libro;
}

const NEGRO = { argb: 'FF111111' };
// rojo: true = falla (rojo y negrita); false = se fuerza negro (la plantilla trae algunas casillas en rojo)
function poner(h: Hoja, celda: string, valor: string | number | null | undefined, rojo?: boolean) {
  if (valor == null || valor === '') return;
  const c = h.getCell(celda);
  c.value = valor;
  if (rojo === true) c.font = { ...(c.font ?? {}), bold: true, color: ROJO };
  else if (rojo === false) c.font = { ...(c.font ?? {}), bold: false, color: NEGRO };
}

async function descargar(libro: Libro, nombre: string) {
  const buf = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const nombreArchivo = (d: DatosInspeccion, que: string) =>
  `${que}_${d.id}_${d.cliente.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').slice(0, 30)}_${d.fecha}.xlsx`;

/* ------------------------- Inspección a fondo ------------------------- */

// Fila de cada tarea en la hoja "Hoja de vida Cañones"
const FILA_TAREA: Record<string, number> = {
  A1: 8, A2: 10, A3: 11, A4: 12, A5: 13, A6: 14,
  B1: 16, B2: 17, B3: 18, B4: 19, B5: 20, B6: 21,
  C1: 23, C2: 24, C3: 25, C4: 26, C5: 27, C6: 28, C7: 29, C8: 30,
  D1: 32, D2: 33, D3: 34,
};
// Casilla ☐/☑ de cada hallazgo del resumen
const CASILLA_HALLAZGO: Record<string, string> = {
  DISPARO_DEBIL: 'A36', FUGAS: 'C36', SOLENOIDE: 'E36', MANOMETRO: 'I36',
  PRESION: 'A37', LLENADO: 'C37', TORNILLOS: 'E37', SILENCIADOR: 'I37',
};

export async function excelHojaDeVida(d: DatosInspeccion, hora?: string) {
  const libro = await abrirPlantilla();
  llenarHojaDeVida(libro, d, hora);
  await descargar(libro, nombreArchivo(d, `hoja_de_vida_${d.equipos[0]?.serial ?? ''}`.replace(/[^\w-]+/g, '_')));
}

export function llenarHojaDeVida(libro: Libro, d: DatosInspeccion, hora?: string) {
  const otra = libro.getWorksheet('Checklist Diario');
  if (otra) libro.removeWorksheet(otra.id);
  const h = libro.getWorksheet('Hoja de vida Cañones') ?? libro.worksheets[0];
  const e = d.equipos[0];
  const m = e.mediciones ?? {};
  const num = (v: unknown) => (v == null || v === '' ? null : Number(v));

  poner(h, 'B3', d.cliente);
  poner(h, 'D3', fechaLarga(d.fecha));
  poner(h, 'F3', m.horas == null ? 'N/A' : num(m.horas));
  poner(h, 'J3', d.inspector);
  poner(h, 'B4', e.serial);
  poner(h, 'D4', `${e.modelo}${e.tanque ? ` · ${e.tanque} L` : ''}`);
  poner(h, 'F4', e.ubicacion);
  poner(h, 'J4', d.turno);
  poner(h, 'B5', num(m.presion_set));
  const real = num(m.presion_real);
  poner(h, 'D5', real, real != null && (real < 60 || real > 100));
  poner(h, 'F5', num(m.llenado));
  poner(h, 'J5', num(m.temperatura));

  // Observaciones por tarea: se guardan como "A2: texto · B4: texto"
  const obs: Record<string, string> = {};
  (e.observacion ?? '').split(/\s*·\s*/).forEach((p) => {
    const x = p.match(/^([A-D]\d)\s*:\s*(.+)$/);
    if (x) obs[x[1]] = x[2];
  });
  Object.entries(FILA_TAREA).forEach(([id, fila]) => {
    const r = e.resultados[id];
    if (r === 'OK') marcar(h, `F${fila}`, '✓', false);
    if (r === 'FALLA') marcar(h, `G${fila}`, 'X', true);
    if (r === 'NA') marcar(h, `H${fila}`, '✓', false);
    poner(h, `I${fila}`, obs[id], r === 'FALLA');
  });
  Object.entries(CASILLA_HALLAZGO).forEach(([id, celda]) => {
    const on = e.hallazgos.includes(id);
    marcar(h, celda, on ? '☑' : '☐', on);
  });
  poner(h, 'A39', d.observaciones);
  poner(h, 'A43', d.inspector);
  poner(h, 'E43', hora);
  if (d.firma?.startsWith('data:image/png')) {
    const img = libro.addImage({ base64: d.firma, extension: 'png' });
    h.addImage(img, { tl: { col: 3.05, row: 42.1 }, ext: { width: 110, height: 34 } });
  }
}

/* ----------------------------- Ronda diaria ----------------------------- */

export async function excelChecklistDiario(d: DatosInspeccion) {
  const libro = await abrirPlantilla();
  llenarChecklist(libro, d);
  await descargar(libro, nombreArchivo(d, 'check_list_diario'));
}

export function llenarChecklist(libro: Libro, d: DatosInspeccion) {
  const otra = libro.getWorksheet('Hoja de vida Cañones');
  if (otra) libro.removeWorksheet(otra.id);
  const h = libro.getWorksheet('Checklist Diario') ?? libro.worksheets[0];

  const pendientes = [...d.equipos];
  const inicios: number[] = [];
  let ubic = '';
  let ultimaFila = 0;
  for (let r = 1; r <= h.rowCount; r++) {
    const a = texto(h, `A${r}`);
    if (/^PLANTA\s*:/i.test(a)) {
      // El bloque empieza dos filas arriba (título y advertencia)
      inicios.push(Math.max(1, r - 2));
      // Encabezado de cada bloque (se repite en cada página)
      poner(h, `C${r}`, d.cliente);
      poner(h, `K${r}`, d.zona);
      poner(h, `R${r}`, fechaLarga(d.fecha));
      poner(h, `W${r}`, d.turno);
      poner(h, `AC${r}`, d.inspector);
      continue;
    }
    if (/^UBICACI[OÓ]N\s*:/i.test(a)) {
      ubic = normUb(a);
      continue;
    }
    const tipo = texto(h, `O${r}`).toUpperCase();
    if (!a || !/^(DESTROY|DESTROYER|XHV|CAPOL)$/.test(tipo)) continue;
    ultimaFila = r;
    // Se busca el cañón inspeccionado con ese código, de preferencia en la misma ubicación
    const codigo = norm(a);
    let i = pendientes.findIndex((e) => norm(e.serial) === codigo && normUb(e.ubicacion ?? '') === ubic);
    if (i < 0) i = pendientes.findIndex((e) => norm(e.serial) === codigo);
    if (i < 0) continue;
    const e = pendientes.splice(i, 1)[0];
    const columnas = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];
    PUNTOS_RONDA.forEach((p, k) => marcar(h, `${columnas[k]}${r}`, marca(e.resultados[p.id]), e.resultados[p.id] === 'FALLA'));
    poner(h, `V${r}`, e.observacion, Object.values(e.resultados).includes('FALLA') || e.hallazgos.length > 0);
    ['Q', 'R', 'S', 'T', 'U'].forEach((col, k) => {
      if (e.hallazgos.includes(HALLAZGOS_RONDA[k].id)) marcar(h, `${col}${r}`, 'X', true);
    });
  }
  // Observaciones generales debajo del último bloque
  if (d.observaciones) {
    const fila = Math.max(ultimaFila, h.rowCount) + 2;
    poner(h, `A${fila}`, 'OBSERVACIONES / ACCIÓN TOMADA:');
    h.getCell(`A${fila}`).font = { bold: true };
    poner(h, `C${fila}`, d.observaciones);
  }
  // Que se imprima todo el formato (no solo la primera página), un bloque por hoja
  h.pageSetup.printArea = `A1:AJ${h.rowCount}`;
  h.pageSetup.fitToPage = true;
  h.pageSetup.fitToWidth = 1;
  h.pageSetup.fitToHeight = 0;
  inicios.slice(1).forEach((r) => h.getRow(r - 1).addPageBreak());

  // Cañones que no están en el formato (de otra planta o con código distinto)
  if (pendientes.length) {
    const o = libro.addWorksheet('Otros cañones');
    o.columns = [
      { header: 'Cañón', width: 16 },
      { header: 'Tipo', width: 12 },
      { header: 'Ubicación', width: 28 },
      ...PUNTOS_RONDA.map((p) => ({ header: p.corto, width: 9 })),
      ...HALLAZGOS_RONDA.map((x) => ({ header: x.texto, width: 14 })),
      { header: 'Observaciones', width: 40 },
    ];
    o.getRow(1).font = { bold: true };
    pendientes.forEach((e) =>
      o.addRow([e.serial, e.modelo, e.ubicacion ?? '', ...PUNTOS_RONDA.map((p) => marca(e.resultados[p.id])), ...HALLAZGOS_RONDA.map((x) => (e.hallazgos.includes(x.id) ? '☑' : '')), e.observacion ?? ''])
    );
  }
}
