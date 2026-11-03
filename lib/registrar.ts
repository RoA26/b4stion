// Lector de la puerta única "➕ Registrar": recibe PDF, Excel, CSV, fotos o texto
// pegado; reconoce qué documento es y saca sus datos (encabezado y líneas).
// Nada se guarda aquí: la pantalla muestra lo leído para revisar y confirmar.

import { tablaDesdeExcel, tablaDesdePdf, type Celda } from '@/lib/leerTablas';
import { leerMonto } from '@/lib/formato';
import type { ProductoBasico } from '@/lib/catalogo';

export type TipoDocumento = 'TRANSITO' | 'LISTA' | 'CONTEO' | 'DESCONOCIDO';

export interface LineaLeida {
  codigo: string;
  descripcion: string;
  cantidad: number | null;
  valor: number | null; // valor unitario en pesos (si lo trae)
}
export interface Lectura {
  nombre: string; // nombre del archivo (o "Texto pegado")
  tamano: number;
  texto: string;
  tipo: TipoDocumento;
  encabezado: { numero?: string; fecha?: string; guia?: string; transportador?: string };
  lineas: LineaLeida[];
  porOcr: boolean;
  avisos: string[];
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const compacto = (s: string) => sinTildes(s).replace(/[^a-z0-9]/g, '');

/* ------------------------- Títulos de columnas ------------------------- */
// En español y portugués (las facturas de Brasil vienen en portugués)
const ALIAS: Record<'codigo' | 'descripcion' | 'cantidad' | 'valor' | 'total', string[]> = {
  codigo: ['codigo', 'cod', 'sku', 'referencia', 'ref', 'codigo producto', 'cod produto', 'codigo do produto', 'item code', 'part number', 'numero de parte', 'no parte', 'id'],
  descripcion: ['descripcion', 'descricao', 'descricao do produto', 'producto', 'produto', 'articulo', 'detalle', 'nombre', 'description', 'item'],
  cantidad: ['cantidad', 'cant', 'quantidade', 'qtd', 'qtde', 'qty', 'quantity', 'unidades', 'contado', 'cantidad contada', 'existencia', 'saldo'],
  valor: ['valor unitario', 'vr unitario', 'vlr unit', 'vlr unitario', 'valor unit', 'precio unitario', 'precio', 'unit price', 'preco unitario', 'preco', 'costo unitario', 'costo'],
  total: ['total', 'valor total', 'vlr total', 'vr total', 'subtotal', 'importe'],
};
export function clasificarColumna(titulo: string): keyof typeof ALIAS | null {
  const t = sinTildes(titulo).replace(/[.:#°º()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  for (const clave of ['valor', 'total', 'cantidad', 'codigo', 'descripcion'] as const) {
    if (ALIAS[clave].some((a) => t === a || t.startsWith(`${a} `) || (a.length > 4 && t.includes(a)))) return clave;
  }
  return null;
}
// Para el lector de PDF: "codigo" y "nombre" definen la fila de títulos
const clasificarParaPdf = (t: string) => {
  const c = clasificarColumna(t);
  return c === 'descripcion' ? 'nombre' : c;
};

/* --------------------------- Leer el archivo --------------------------- */

export async function leerDocumento(f: File, catalogo: ProductoBasico[], avance?: (texto: string) => void): Promise<Lectura> {
  const nombre = f.name;
  const ext = nombre.toLowerCase().split('.').pop() ?? '';
  let texto = '';
  let tabla: Celda[][] | null = null;
  let porOcr = false;
  const avisos: string[] = [];

  if (['xlsx', 'xlsm'].includes(ext)) {
    tabla = await tablaDesdeExcel(f);
    texto = tabla.map((r) => r.map((c) => c ?? '').join('\t')).join('\n');
  } else if (['csv', 'txt'].includes(ext)) {
    texto = await f.text();
    tabla = tablaDeTexto(texto);
  } else if (ext === 'pdf' || f.type === 'application/pdf') {
    texto = await textoDePdf(f);
    if (texto.replace(/\s/g, '').length < 30) {
      // PDF escaneado: no trae texto, se lee como imagen
      porOcr = true;
      texto = await ocrDePdf(f, avance);
    } else {
      try {
        tabla = await tablaDesdePdf(f, clasificarParaPdf);
      } catch {
        tabla = null; // sin fila de títulos reconocible: se leen las líneas del texto
      }
    }
  } else if (f.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) {
    porOcr = true;
    texto = await ocrDeImagen(f, avance);
  } else {
    throw new Error('Formato no reconocido. Use PDF, Excel (.xlsx), CSV o una foto.');
  }
  if (porOcr) avisos.push('Leído desde imagen (OCR): revise los códigos y las cantidades antes de registrar.');
  return analizar(nombre, f.size, texto, tabla, catalogo, porOcr, avisos);
}

export function leerTextoPegado(texto: string, catalogo: ProductoBasico[]): Lectura {
  const tabla = texto.includes('\t') ? tablaDeTexto(texto) : null;
  return analizar('Texto pegado', texto.length, texto, tabla, catalogo, false, []);
}

export async function leerImagenPegada(blob: Blob, catalogo: ProductoBasico[], avance?: (t: string) => void): Promise<Lectura> {
  const texto = await ocrDeImagen(blob, avance);
  return analizar('Pantallazo pegado', blob.size, texto, null, catalogo, true, ['Leído desde imagen (OCR): revise los códigos y las cantidades antes de registrar.']);
}

function tablaDeTexto(texto: string): Celda[][] {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
  const sep = lineas.some((l) => l.includes('\t')) ? '\t' : lineas.filter((l) => l.includes(';')).length > lineas.length / 2 ? ';' : ',';
  return lineas.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '') || null));
}

async function textoDePdf(f: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  const paginas: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const c = await (await doc.getPage(n)).getTextContent();
    // agrupa por renglón (misma altura) para conservar las líneas
    const items = c.items
      .filter((i) => 'str' in i && i.str.trim())
      .map((i) => {
        const t = i as { str: string; transform: number[] };
        return { s: t.str, x: t.transform[4], y: Math.round(t.transform[5]) };
      })
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const renglones: string[] = [];
    let y: number | null = null;
    let actual: string[] = [];
    for (const it of items) {
      if (y != null && Math.abs(it.y - y) > 3) {
        renglones.push(actual.join(' '));
        actual = [];
      }
      y = it.y;
      actual.push(it.s);
    }
    if (actual.length) renglones.push(actual.join(' '));
    paginas.push(renglones.join('\n'));
  }
  return paginas.join('\n');
}

async function trabajadorOcr(avance?: (t: string) => void) {
  const { createWorker } = await import('tesseract.js');
  return createWorker(['spa', 'por'], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') avance?.(`Leyendo la imagen… ${Math.round(m.progress * 100)} %`);
      else if (/loading|initializ/.test(m.status)) avance?.('Preparando el lector de imágenes (la primera vez tarda un poco)…');
    },
  });
}

async function ocrDeImagen(img: Blob, avance?: (t: string) => void): Promise<string> {
  const w = await trabajadorOcr(avance);
  try {
    const { data } = await w.recognize(img);
    return data.text;
  } finally {
    await w.terminate();
  }
}

async function ocrDePdf(f: File, avance?: (t: string) => void): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  const w = await trabajadorOcr(avance);
  const textos: string[] = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, 10); n++) {
      avance?.(`Leyendo la página ${n} de ${doc.numPages}…`);
      const pagina = await doc.getPage(n);
      const vista = pagina.getViewport({ scale: 2.2 });
      const lienzo = document.createElement('canvas');
      lienzo.width = vista.width;
      lienzo.height = vista.height;
      await pagina.render({ canvasContext: lienzo.getContext('2d')!, viewport: vista }).promise;
      const { data } = await w.recognize(lienzo);
      textos.push(data.text);
    }
  } finally {
    await w.terminate();
  }
  return textos.join('\n');
}

/* --------------------------- Entender el texto --------------------------- */

function analizar(nombre: string, tamano: number, texto: string, tabla: Celda[][] | null, catalogo: ProductoBasico[], porOcr: boolean, avisos: string[]): Lectura {
  const t = sinTildes(texto);
  let lineas = tabla ? lineasDeTabla(tabla) : [];
  if (!lineas.length) lineas = lineasDeTexto(texto, catalogo);

  const esPedido = /\b(factura|fatura|invoice|nota fiscal|nf-?e|remision|remessa|packing ?list|romaneio|proforma|pedido|orden de compra|purchase order|despacho|embarque)\b/.test(t);
  const esBrasil = /\b(poliway|brasil|brazil|cnpj|vespasiano|minas gerais|ltda)\b/.test(t);
  const esConteo = /\b(conteo|inventario fisico|toma fisica|contad[oa]s?|cantidad contada)\b/.test(t);
  const esLista = /\b(lista de (precios|productos)|catalogo|existencia|stock minimo|minimo|costo unitario)\b/.test(t);

  let tipo: TipoDocumento = 'DESCONOCIDO';
  if (esConteo) tipo = 'CONTEO';
  else if ((esPedido || esBrasil) && lineas.length) tipo = 'TRANSITO';
  else if (esLista && lineas.length) tipo = 'LISTA';

  const fecha = texto.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/) ?? null;
  const iso = texto.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const numero =
    texto.match(/\b(?:factura|fatura|invoice|nota fiscal|nf-?e|remisi[oó]n|remessa|packing\s*list|proforma|pedido|orden de compra)\b[^\n\d]{0,25}?(?:n[º°o.]*|no\.?|n[uú]mero|#)?\s*[:#]?\s*([A-Z]{0,5}[-\s]?\d[\w./-]{1,20})/i)?.[1] ??
    texto.match(/\b(?:n[º°]|no\.|n[uú]mero)\s*[:#]?\s*([A-Z]{0,5}-?\d[\w-]{2,20})/i)?.[1];
  const guia = texto.match(/\b(?:B\/?L|AWB|gu[ií]a|conhecimento|CRT|manifiesto|tracking)\b[^\n\w]{0,10}(?:n[º°o.]*\s*)?[:#]?\s*([A-Z0-9][A-Z0-9-]{4,25})/i)?.[1];
  const transportador = texto
    .match(/\b(?:transportador(?:a)?|transportadora|carrier|naviera|transportista)\s*[:-]\s*([^\n]{3,50}?)(?=\s{2,}|\s+(?:CRT|BL|AWB|gu[ií]a|data|fecha)\b|\s*$)/im)?.[1]
    ?.trim();

  if (tipo === 'TRANSITO' && !numero) avisos.push('No se encontró el número del documento: escríbalo antes de registrar.');
  if (!lineas.length) avisos.push('No se encontraron líneas de productos con código y cantidad.');

  return {
    nombre,
    tamano,
    texto,
    tipo,
    encabezado: {
      numero: numero?.replace(/\s+/g, '').toUpperCase(),
      fecha: iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : fecha ? `${fecha[3]}-${fecha[2].padStart(2, '0')}-${fecha[1].padStart(2, '0')}` : undefined,
      guia: guia?.toUpperCase(),
      transportador,
    },
    lineas,
    porOcr,
    avisos,
  };
}

function numeroDe(c: Celda): number | null {
  if (c == null || c === '') return null;
  if (typeof c === 'number') return c;
  const v = leerMonto(String(c).replace(/[^\d.,-]/g, ''));
  return Number.isFinite(v) ? v : null;
}

/* Tabla con fila de títulos (Excel, CSV, PDF con columnas, texto pegado de Excel) */
function lineasDeTabla(tabla: Celda[][]): LineaLeida[] {
  for (let r = 0; r < Math.min(tabla.length, 25); r++) {
    const mapa: Partial<Record<keyof typeof ALIAS, number>> = {};
    tabla[r].forEach((c, i) => {
      const k = c == null ? null : clasificarColumna(String(c));
      if (k && mapa[k] === undefined) mapa[k] = i;
    });
    if (mapa.codigo === undefined || mapa.cantidad === undefined) continue;
    const salida: LineaLeida[] = [];
    for (const fila of tabla.slice(r + 1)) {
      const codigo = String(fila[mapa.codigo] ?? '').trim();
      const cantidad = numeroDe(fila[mapa.cantidad]);
      if (!codigo || cantidad == null || /total/i.test(codigo)) continue;
      let valor = mapa.valor !== undefined ? numeroDe(fila[mapa.valor]) : null;
      if (valor == null && mapa.total !== undefined && cantidad > 0) {
        const total = numeroDe(fila[mapa.total]);
        if (total != null) valor = Math.round((total / cantidad) * 100) / 100;
      }
      salida.push({ codigo: codigo.toUpperCase(), descripcion: String(fila[mapa.descripcion ?? -1] ?? '').trim(), cantidad, valor });
    }
    if (salida.length) return salida;
  }
  return [];
}

/* Texto suelto (OCR, correo, WhatsApp): una línea por producto.
   "736 Tornillo galvanizado 5/8 x 2 1/2   10   3.500   35.000" */
const UNIDADES = new Set(['und', 'un', 'unid', 'unidad', 'unidades', 'pc', 'pcs', 'pza', 'pzas', 'm', 'mts', 'kg', 'rollo', 'rollos', 'juego', 'jgo', 'x']);
function lineasDeTexto(texto: string, catalogo: ProductoBasico[]): LineaLeida[] {
  const codigos = new Map<string, ProductoBasico>();
  catalogo.forEach((p) => {
    codigos.set(compacto(p.sku), p);
    codigos.set(compacto(p.codigo_barras), p);
  });
  const salida: LineaLeida[] = [];
  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim();
    if (linea.length < 4 || /\b(total|subtotal|iva|flete|descuento)\b/i.test(linea)) continue;
    const tokens = linea.split(' ');
    // 1. Código: un código del catálogo en cualquier parte, o el primer token con números
    let iCod = tokens.findIndex((tk) => codigos.has(compacto(tk)));
    if (iCod < 0)
      iCod = tokens.findIndex(
        (tk, i) =>
          (i < 3 && /\d/.test(tk) && tk.replace(/[^a-z0-9]/gi, '').length >= 3 && !/^\d{1,3}([.,]\d{3})+([.,]\d+)?$/.test(tk)) ||
          (i === 0 && /^[A-Z0-9]{2,}(-[A-Z0-9]+)+$/.test(tk))
      );
    if (iCod < 0) continue;
    const codigo = tokens[iCod].replace(/^#/, '').toUpperCase();
    // 2. Números después del código: cantidad, valor unitario, total.
    //    Las medidas de la descripción ("5/8", "2 1/2") se dejan como texto.
    const resto = tokens.slice(iCod + 1);
    const nums: number[] = [];
    const palabras: string[] = [];
    resto.forEach((tk, i) => {
      const limpio = tk.replace(/^\$/, '');
      const esNumero = /^\d{1,3}([.,]\d{3})*([.,]\d{1,2})?$|^\d+([.,]\d+)?$/.test(limpio);
      const antesDeFraccion = /^\d+\/\d+"?$/.test(resto[i + 1] ?? '');
      const despuesDeX = /^x$/i.test(resto[i - 1] ?? '') && /^\d+\/\d+|^\d+"?$/.test(tk) && palabras.length > 0 && nums.length === 0;
      if (esNumero && !antesDeFraccion && !despuesDeX) nums.push(leerMonto(limpio));
      else if (!UNIDADES.has(tk.toLowerCase()) || /^x$/i.test(tk)) palabras.push(tk);
    });
    // números que están dentro de la descripción (medidas como 5/8 o 2 1/2) se dejan en el texto
    if (!nums.length) continue;
    let cantidad: number | null = nums[0];
    let valor: number | null = null;
    if (nums.length >= 3) {
      // cantidad × valor = total: se busca la combinación que cuadre
      const [a, b, c] = nums.slice(-3);
      if (Math.abs(a * b - c) <= Math.max(1, c * 0.01)) {
        cantidad = a;
        valor = b;
      } else valor = nums[1];
    } else if (nums.length === 2) {
      valor = nums[1] >= 50 ? nums[1] : null;
    }
    if (cantidad == null || cantidad <= 0 || cantidad > 1_000_000) continue;
    const prod = codigos.get(compacto(codigo));
    salida.push({ codigo: prod?.sku ?? codigo, descripcion: palabras.join(' ') || prod?.nombre || '', cantidad, valor });
  }
  return salida;
}
