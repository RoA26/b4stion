// Convierte un Excel o un PDF en una tabla de filas y celdas, para que la
// pantalla Importar la acomode a las columnas de la app.

export type Celda = string | number | null;

/* ------------------------------ Excel ------------------------------ */

export async function tablaDesdeExcel(f: File): Promise<Celda[][]> {
  const ExcelJS = (await import('exceljs')).default;
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await f.arrayBuffer());
  const hoja = libro.worksheets[0];
  if (!hoja) throw new Error('El archivo no tiene hojas.');
  const filas: Celda[][] = [];
  for (let r = 1; r <= hoja.rowCount; r++) {
    const fila = hoja.getRow(r);
    const celdas: Celda[] = [];
    for (let c = 1; c <= hoja.columnCount; c++) {
      const celda = fila.getCell(c);
      // Las celdas numéricas se conservan como número (evita confundir puntos y comas)
      const crudo = celda.value as unknown;
      const valor =
        crudo && typeof crudo === 'object' && 'result' in (crudo as Record<string, unknown>)
          ? (crudo as { result: unknown }).result
          : crudo;
      celdas.push(typeof valor === 'number' ? valor : celda.text?.trim() ? celda.text.trim() : null);
    }
    filas.push(celdas);
  }
  return filas;
}

/* ------------------------------- PDF -------------------------------- */
// Funciona con PDF generados por un programa (informes exportados).
// Un PDF escaneado (foto de un papel) no trae texto y no se puede leer así.

interface Pedazo {
  t: string;
  izq: number;
  der: number;
}

export async function tablaDesdePdf(f: File, clasificar: (titulo: string) => string | null): Promise<Celda[][]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;

  const filas: Celda[][] = [];
  let columnas: Pedazo[] | null = null;
  let hayTexto = false;

  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const contenido = await pagina.getTextContent();
    const items = contenido.items
      .filter((i) => 'str' in i && i.str.trim() !== '')
      .map((i) => {
        const t = i as { str: string; transform: number[]; width: number; height: number };
        return { t: t.str.trim(), x: t.transform[4], y: t.transform[5], w: t.width, h: t.height || Math.abs(t.transform[3]) || 8 };
      });
    if (items.length) hayTexto = true;

    // 1. Agrupa los textos en renglones (misma altura en la página)
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const renglones: (typeof items)[] = [];
    for (const it of items) {
      const r = renglones[renglones.length - 1];
      if (r && Math.abs(r[0].y - it.y) <= Math.max(2, it.h * 0.45)) r.push(it);
      else renglones.push([it]);
    }

    for (const r of renglones) {
      r.sort((a, b) => a.x - b.x);
      // 2. Une los textos que están pegados (una misma celda partida en pedazos)
      const pedazos: Pedazo[] = [];
      for (const it of r) {
        const p = pedazos[pedazos.length - 1];
        const hueco = p ? it.x - p.der : Infinity;
        if (p && hueco < Math.max(2.5, it.h * 0.5)) {
          p.t += (hueco > 0.8 ? ' ' : '') + it.t;
          p.der = Math.max(p.der, it.x + it.w);
        } else pedazos.push({ t: it.t, izq: it.x, der: it.x + it.w });
      }

      // 3. La fila de títulos define dónde está cada columna
      const claves = pedazos.map((p) => clasificar(p.t));
      if (claves.includes('codigo') && claves.includes('nombre')) {
        if (!columnas) {
          columnas = pedazos;
          filas.push(pedazos.map((p) => p.t));
        }
        continue; // los títulos repetidos en cada página se saltan
      }
      if (!columnas) continue;

      // 4. Cada texto va a la columna más cercana
      const celdas: string[] = Array(columnas.length).fill('');
      for (const p of pedazos) {
        const centro = (p.izq + p.der) / 2;
        let mejor = 0;
        let distancia = Infinity;
        columnas.forEach((c, i) => {
          const d = centro < c.izq ? c.izq - centro : centro > c.der ? centro - c.der : 0;
          if (d < distancia) {
            distancia = d;
            mejor = i;
          }
        });
        celdas[mejor] = celdas[mejor] ? `${celdas[mejor]} ${p.t}` : p.t;
      }
      filas.push(celdas);
    }
  }

  if (!hayTexto) throw new Error('El PDF no tiene texto: parece un documento escaneado o una foto. Pídalo en Excel o en PDF generado por el programa.');
  if (!columnas) throw new Error('No se encontró en el PDF una fila de títulos con "Código" y "Nombre" (o "Descripción").');

  // 5. Descripciones largas que el PDF partió en dos renglones: se unen al renglón anterior
  const cols = columnas as Pedazo[];
  const iCodigo = cols.findIndex((c) => clasificar(c.t) === 'codigo');
  const iNombre = cols.findIndex((c) => clasificar(c.t) === 'nombre');
  const resultado: Celda[][] = [];
  for (const fila of filas) {
    const soloTexto = fila.every((c, i) => i === iNombre || !c);
    const anterior = resultado[resultado.length - 1];
    if (anterior && resultado.length > 1 && !fila[iCodigo] && fila[iNombre] && soloTexto) {
      anterior[iNombre] = `${anterior[iNombre] ?? ''} ${fila[iNombre]}`.trim();
      continue;
    }
    resultado.push(fila.map((c) => (c === '' ? null : c)));
  }
  return resultado;
}
