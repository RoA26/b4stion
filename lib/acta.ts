// Acta de préstamo en PDF: quién presta, a quién, qué, cuánto, cuándo se devuelve y la firma.
import { logoDataUrl } from '@/lib/exportar';

export interface DatosActa {
  id: number;
  sentido: 'SALIDA' | 'ENTRADA';
  empresa: string;
  contacto: string | null;
  sku: string;
  producto: string;
  unidad: string;
  cantidad: number;
  bodega: string | null;
  fecha: string; // AAAA-MM-DD
  fechaDevolucion: string | null;
  autorizo: string | null;
  nota: string | null;
  registradoPor: string | null;
  firma: string | null; // imagen PNG (data URL)
  firmo: string | null;
}

const fechaLarga = (f: string) => new Date(`${f.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const cant = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });

export async function descargarActa(a: DatosActa) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const ancho = doc.internal.pageSize.getWidth();
  const m = 20;
  let y = m;

  const logo = await logoDataUrl();
  if (logo) doc.addImage(logo, 'PNG', m, y, 44, 13.8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(87, 87, 87);
  doc.text(`Acta N.° ${a.id}`, ancho - m, y + 5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(fechaLarga(a.fecha), ancho - m, y + 10, { align: 'right' });
  y += 24;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(17, 17, 17);
  doc.text(a.sentido === 'SALIDA' ? 'ACTA DE PRÉSTAMO DE MERCANCÍA' : 'ACTA DE RECIBO DE MERCANCÍA EN PRÉSTAMO', m, y);
  y += 3;
  doc.setFillColor(255, 189, 89);
  doc.rect(m, y, ancho - m * 2, 1.2, 'F');
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const intro =
    a.sentido === 'SALIDA'
      ? `Poliway entrega en calidad de préstamo a ${a.empresa} la mercancía que se detalla a continuación, la cual debe ser devuelta${a.fechaDevolucion ? ` a más tardar el ${fechaLarga(a.fechaDevolucion)}` : ''} en las mismas condiciones en que se entrega.`
      : `${a.empresa} entrega a Poliway en calidad de préstamo la mercancía que se detalla a continuación. Poliway se compromete a devolverla${a.fechaDevolucion ? ` a más tardar el ${fechaLarga(a.fechaDevolucion)}` : ''}.`;
  const lineas = doc.splitTextToSize(intro, ancho - m * 2);
  doc.text(lineas, m, y);
  y += lineas.length * 5.5 + 6;

  // Tabla sencilla del producto
  const col = [m, m + 38, ancho - m - 55, ancho - m];
  doc.setFillColor(17, 17, 17);
  doc.rect(m, y, ancho - m * 2, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Código', col[0] + 2, y + 5.5);
  doc.text('Descripción', col[1] + 2, y + 5.5);
  doc.text('Cantidad', col[3] - 2, y + 5.5, { align: 'right' });
  y += 8;
  doc.setTextColor(17, 17, 17);
  doc.setFont('helvetica', 'normal');
  const desc = doc.splitTextToSize(a.producto, col[2] - col[1] + 20);
  const altoFila = Math.max(9, desc.length * 5 + 4);
  doc.setDrawColor(217, 217, 217);
  doc.rect(m, y, ancho - m * 2, altoFila);
  doc.text(a.sku, col[0] + 2, y + 6);
  doc.text(desc, col[1] + 2, y + 6);
  doc.text(`${cant.format(a.cantidad)} ${a.unidad}`, col[3] - 2, y + 6, { align: 'right' });
  y += altoFila + 10;

  // Datos
  const dato = (t: string, v: string | null) => {
    if (!v) return;
    doc.setFont('helvetica', 'bold');
    doc.text(`${t}:`, m, y);
    doc.setFont('helvetica', 'normal');
    doc.text(v, m + 48, y);
    y += 6.5;
  };
  dato(a.sentido === 'SALIDA' ? 'Empresa que recibe' : 'Empresa que presta', a.empresa);
  dato('Persona de contacto', a.contacto);
  dato(a.sentido === 'SALIDA' ? 'Sale de la bodega' : 'Entra a la bodega', a.bodega);
  dato('Fecha del préstamo', fechaLarga(a.fecha));
  dato('Fecha para devolver', a.fechaDevolucion ? fechaLarga(a.fechaDevolucion) : 'Sin fecha acordada');
  dato('Autorizó', a.autorizo);
  dato('Registró', a.registradoPor);
  if (a.nota) {
    doc.setFont('helvetica', 'bold');
    doc.text('Observaciones:', m, y);
    doc.setFont('helvetica', 'normal');
    const n = doc.splitTextToSize(a.nota, ancho - m * 2 - 48);
    doc.text(n, m + 48, y);
    y += n.length * 5.5 + 2;
  }

  // Firmas
  y = Math.max(y + 18, 200);
  const anchoFirma = (ancho - m * 2 - 20) / 2;
  const x2 = m + anchoFirma + 20;
  if (a.firma) {
    try {
      doc.addImage(a.firma, 'PNG', m, y - 26, anchoFirma * 0.8, 24);
    } catch {
      /* firma ilegible: queda la línea para firmar a mano */
    }
  }
  doc.setDrawColor(17, 17, 17);
  doc.line(m, y, m + anchoFirma, y);
  doc.line(x2, y, x2 + anchoFirma, y);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(a.sentido === 'SALIDA' ? 'Recibe' : 'Entrega', m, y + 5);
  doc.text(a.sentido === 'SALIDA' ? 'Entrega por Poliway' : 'Recibe por Poliway', x2, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(a.firmo ?? 'Nombre:', m, y + 10);
  doc.text(`${a.empresa}`, m, y + 15);
  doc.text(a.registradoPor ?? 'Nombre:', x2, y + 10);
  doc.text('Poliway', x2, y + 15);

  doc.setFontSize(8);
  doc.setTextColor(87, 87, 87);
  doc.text('Inventario Poliway  |  Blaster by Poliway', m, doc.internal.pageSize.getHeight() - 10);

  const limpio = a.empresa.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').slice(0, 30);
  doc.save(`acta_prestamo_${a.id}_${limpio}.pdf`);
}
