// Exporta informes a Excel (.xlsx) y PDF con la identidad Blaster by Poliway.
// Las librerías se cargan solo al presionar el botón, para que la app abra rápido.

export type TipoColumna = 'texto' | 'numero' | 'moneda' | 'fecha';
export interface Columna<T> {
  titulo: string;
  ancho: number; // ancho aproximado en caracteres (Excel); en PDF se reparte proporcional
  tipo: TipoColumna;
  valor: (fila: T) => string | number | Date | null;
}
export interface Informe<T> {
  titulo: string;
  archivo: string; // nombre base del archivo, sin extensión
  detalle: string[]; // líneas bajo el título: filtros, fecha, usuario
  columnas: Columna<T>[];
  filas: T[];
  totales?: { etiqueta: string; valor: string }[];
}

const NEGRO = '111111';
const AMARILLO = 'FFBD59';
const GRIS = '575757';
const GRIS_CLARO = 'F2F2F2';

const fmtNumero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const fmtMoneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fmtFecha = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function textoCelda(tipo: TipoColumna, v: string | number | Date | null): string {
  if (v == null || v === '') return '';
  if (tipo === 'numero') return fmtNumero.format(Number(v));
  if (tipo === 'moneda') return fmtMoneda.format(Number(v));
  if (tipo === 'fecha') return fmtFecha.format(v instanceof Date ? v : new Date(v));
  return String(v);
}

export async function logoDataUrl(): Promise<string | null> {
  try {
    const r = await fetch('/logo-blaster.png');
    const b = await r.blob();
    return await new Promise((ok) => {
      const lector = new FileReader();
      lector.onload = () => ok(String(lector.result));
      lector.onerror = () => ok(null);
      lector.readAsDataURL(b);
    });
  } catch {
    return null;
  }
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const sello = () => new Date().toISOString().slice(0, 10);

/* ------------------------------ Excel ------------------------------ */

export async function exportarExcel<T>(inf: Informe<T>) {
  const ExcelJS = (await import('exceljs')).default;
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Inventario Poliway';
  // Excel no acepta * ? : \ / [ ] en el nombre de una hoja
  const hoja = libro.addWorksheet(inf.titulo.replace(/[*?:\\/[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30) || 'Informe', {
    views: [{ state: 'frozen', ySplit: 6 + inf.detalle.length }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  const nCol = inf.columnas.length;
  hoja.columns = inf.columnas.map((c) => ({ width: c.ancho }));

  // Logo (filas 1 a 3)
  const logo = await logoDataUrl();
  if (logo) {
    const id = libro.addImage({ base64: logo, extension: 'png' });
    hoja.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 190, height: 60 } });
  }
  hoja.getRow(1).height = 22;
  hoja.getRow(2).height = 22;
  hoja.getRow(3).height = 8;

  // Título
  let r = 4;
  hoja.mergeCells(r, 1, r, nCol);
  const titulo = hoja.getCell(r, 1);
  titulo.value = inf.titulo;
  titulo.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF' + NEGRO } };
  r++;
  for (const linea of inf.detalle) {
    hoja.mergeCells(r, 1, r, nCol);
    const c = hoja.getCell(r, 1);
    c.value = linea;
    c.font = { name: 'Arial', size: 10, color: { argb: 'FF' + GRIS } };
    r++;
  }
  // Franja amarilla de la marca
  hoja.mergeCells(r, 1, r, nCol);
  hoja.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + AMARILLO } };
  hoja.getRow(r).height = 4;
  r++;

  // Encabezados
  const filaEnc = hoja.getRow(r);
  inf.columnas.forEach((c, i) => {
    const celda = filaEnc.getCell(i + 1);
    celda.value = c.titulo;
    celda.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NEGRO } };
    celda.alignment = { vertical: 'middle', horizontal: c.tipo === 'numero' || c.tipo === 'moneda' ? 'right' : 'left', wrapText: true };
  });
  filaEnc.height = 22;
  const filaInicio = r;
  r++;

  // Datos
  inf.filas.forEach((fila, idx) => {
    const fx = hoja.getRow(r);
    inf.columnas.forEach((c, i) => {
      const celda = fx.getCell(i + 1);
      const v = c.valor(fila);
      if (v == null || v === '') celda.value = null;
      else if (c.tipo === 'fecha') {
        // Excel no maneja zonas horarias: se guarda la hora de Colombia (UTC-5)
        const d = v instanceof Date ? v : new Date(v);
        celda.value = new Date(d.getTime() - 5 * 3600 * 1000);
      }
      else if (c.tipo === 'numero' || c.tipo === 'moneda') celda.value = Number(v);
      else celda.value = String(v);
      celda.font = { name: 'Arial', size: 10 };
      if (c.tipo === 'moneda') celda.numFmt = '"$"#,##0';
      if (c.tipo === 'numero') celda.numFmt = '#,##0.###';
      if (c.tipo === 'fecha') celda.numFmt = 'dd/mm/yyyy hh:mm';
      celda.alignment = { vertical: 'top', horizontal: c.tipo === 'numero' || c.tipo === 'moneda' ? 'right' : 'left', wrapText: c.tipo === 'texto' };
      if (idx % 2 === 1) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GRIS_CLARO } };
    });
    r++;
  });
  hoja.autoFilter = { from: { row: filaInicio, column: 1 }, to: { row: Math.max(r - 1, filaInicio), column: nCol } };

  // Totales
  if (inf.totales?.length) {
    r++;
    for (const t of inf.totales) {
      const fx = hoja.getRow(r);
      fx.getCell(1).value = t.etiqueta;
      fx.getCell(1).font = { name: 'Arial', size: 10, bold: true };
      fx.getCell(3).value = t.valor;
      fx.getCell(3).font = { name: 'Arial', size: 10, bold: true };
      r++;
    }
  }

  const buffer = await libro.xlsx.writeBuffer();
  descargar(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${inf.archivo}_${sello()}.xlsx`
  );
}

/* ------------------------------- PDF ------------------------------- */

export async function exportarPdf<T>(inf: Informe<T>) {
  const { jsPDF } = await import('jspdf');
  // La forma de importar cambia según el empaquetador: se busca la función donde esté
  type FnTabla = (d: unknown, o: Record<string, unknown>) => void;
  const modulo = (await import('jspdf-autotable')) as unknown as {
    default?: FnTabla | { default?: FnTabla };
    autoTable?: FnTabla;
  };
  const autoTable: FnTabla | undefined =
    typeof modulo.default === 'function'
      ? modulo.default
      : typeof modulo.default?.default === 'function'
        ? modulo.default.default
        : modulo.autoTable;
  if (!autoTable) throw new Error('No se pudo cargar el generador de tablas PDF');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const margen = 12;

  const logo = await logoDataUrl();
  let y = margen;
  if (logo) doc.addImage(logo, 'PNG', margen, y, 44, 13.8);
  y += 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(17, 17, 17);
  doc.text(inf.titulo, margen, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(87, 87, 87);
  for (const linea of inf.detalle) {
    doc.text(linea, margen, y);
    y += 4.5;
  }
  doc.setFillColor(255, 189, 89);
  doc.rect(margen, y, ancho - margen * 2, 1.2, 'F');
  y += 4;

  const total = inf.columnas.reduce((s, c) => s + c.ancho, 0);
  const util = ancho - margen * 2;
  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen, bottom: 16 },
    head: [inf.columnas.map((c) => c.titulo)],
    body: inf.filas.map((f) => inf.columnas.map((c) => textoCelda(c.tipo, c.valor(f)))),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: [17, 17, 17], lineColor: [217, 217, 217], lineWidth: 0.1 },
    headStyles: { fillColor: [17, 17, 17], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [242, 242, 242] },
    columnStyles: Object.fromEntries(
      inf.columnas.map((c, i) => [i, { cellWidth: (c.ancho / total) * util, halign: c.tipo === 'numero' || c.tipo === 'moneda' ? 'right' : 'left' }])
    ),
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(87, 87, 87);
      doc.text('Inventario Poliway  |  Blaster by Poliway', margen, alto - 7);
    },
  });

  // Totales al final
  if (inf.totales?.length) {
    const finTabla = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    let ty = finTabla + 7;
    if (ty > alto - 25) {
      doc.addPage();
      ty = margen + 5;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(17, 17, 17);
    for (const t of inf.totales) {
      doc.text(`${t.etiqueta}: ${t.valor}`, margen, ty);
      ty += 5.5;
    }
  }

  // Numeración de páginas
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(87, 87, 87);
    doc.text(`Página ${i} de ${paginas}`, ancho - margen, alto - 7, { align: 'right' });
  }

  doc.save(`${inf.archivo}_${sello()}.pdf`);
}
