// Inspección de cañones Blaster: formato POL-CL-DIARIO-CAN Rev. 2.0 (07/2026).
// - Ronda diaria: 12 puntos rápidos por cañón y 5 hallazgos
// - Inspección a fondo (hoja de vida): 23 tareas con criterio de aceptación
// Los repuestos sugeridos por hallazgo son una primera propuesta: confirmar con ingeniería de Poliway.

import { logoDataUrl } from '@/lib/exportar';

export type Resultado = 'OK' | 'FALLA' | 'NA';
export type Modelo = 'Destroyer' | 'XHV' | 'Capol' | 'Otro';

export const DOC = 'POL-CL-DIARIO-CAN · Rev. 2.0 — 07/2026';
export const ADVERTENCIA =
  'PELIGRO: aislar siempre la energía neumática y eléctrica (LOTOTO) antes de cualquier intervención interna. No exceder 100 PSI / 7 bar. EPP obligatorio: gafas, guantes, protección auditiva.';

/* ------------------------------ Ronda diaria ------------------------------ */

export const PUNTOS_RONDA: { id: string; texto: string; corto: string }[] = [
  { id: 'MANOMETRO', texto: 'Manómetro', corto: 'Manóm.' },
  { id: 'TAPA', texto: 'Tapa', corto: 'Tapa' },
  { id: 'TANQUE', texto: 'Tanque', corto: 'Tanque' },
  { id: 'VALVULA_SEG', texto: 'Válvula de seguridad', corto: 'V. seg.' },
  { id: 'DISPARO_MEC', texto: 'Disparo mecánico efectivo', corto: 'Disp. mec.' },
  { id: 'FUGAS', texto: 'Fugas en línea o cañón', corto: 'Fugas' },
  { id: 'EXTERIOR', texto: 'Estado exterior componentes', corto: 'Exterior' },
  { id: 'GUAYA', texto: 'Guaya de seguridad', corto: 'Guaya' },
  { id: 'SILENCIADORES', texto: 'Silenciadores', corto: 'Silenc.' },
  { id: 'SOLENOIDE', texto: 'Solenoide en buen estado', corto: 'Solen.' },
  { id: 'DISPARO_AUTO', texto: 'Verificación disparo automático', corto: 'Disp. aut.' },
  { id: 'TORNILLOS', texto: 'Tornillos sueltos', corto: 'Tornillos' },
];

// Observaciones que se escogen con un toque cuando un punto sale en falla (también se puede escribir a mano)
export const OBS_PREDETERMINADAS: Record<string, string[]> = {
  MANOMETRO: ['Manómetro roto', 'No marca presión', 'Sin glicerina', 'Manómetro faltante'],
  TAPA: ['Tapa con fuga', 'Tapa floja', 'Tapa golpeada'],
  TANQUE: ['Corrosión en el tanque', 'Golpe o abolladura', 'Agua condensada'],
  VALVULA_SEG: ['Válvula de seguridad dispara sola', 'Válvula de seguridad pegada', 'Válvula de seguridad faltante'],
  DISPARO_MEC: ['No dispara', 'Disparo débil'],
  FUGAS: ['Fuga por la tapa', 'Fuga por el escape', 'Fuga en la línea de aire', 'Fuga por la descarga'],
  EXTERIOR: ['Componentes golpeados', 'Corrosión exterior', 'Pintura deteriorada'],
  GUAYA: ['Guaya faltante', 'Guaya cortada'],
  SILENCIADORES: ['Silenciador tapado', 'Silenciador faltante', 'Ruido anormal'],
  SOLENOIDE: ['Solenoide no responde', 'Bobina caliente', 'Sin voltaje'],
  DISPARO_AUTO: ['No dispara desde la sala de control', 'Disparo automático intermitente'],
  TORNILLOS: ['Tornillos sueltos, se ajustaron', 'Tornillos faltantes'],
};
// Observaciones para escoger cuando una tarea de la inspección a fondo sale en falla
export const OBS_TAREAS: Record<string, string[]> = {
  A1: ['No dispara desde la sala', 'Dispara con retraso', 'Señal intermitente'],
  A2: ['0 V en bornes', 'Voltaje bajo', 'Voltaje fuera de rango'],
  A3: ['Cable cortado', 'Falso contacto', 'Borne suelto', 'Resistencia alta'],
  A4: ['Infinito: bobina quemada', '0 Ω: cortocircuito', 'Fuera del valor nominal'],
  A5: ['LED apagado', 'Alarma en salidas digitales', 'Bit no se activa'],
  A6: ['0 A: bobina abierta', 'Consumo alto', 'Consumo bajo'],
  B1: ['Presión baja', 'Presión alta', 'Caída de presión en reposo'],
  B2: ['Solenoide no abre', 'Abre con retraso', 'Solo dispara con override'],
  B3: ['No estabiliza', 'Por debajo del set point', 'Por encima del set point'],
  B4: ['Llenado lento', 'No llena completo', 'Llenado irregular'],
  B5: ['Material no fluye', 'Atasco residual', 'Disparo débil'],
  B6: ['Siseo en estado cerrado', 'Pierde presión en reposo', 'Fuga en racores'],
  C1: ['Corrosión activa', 'Golpe o abolladura', 'Deformación'],
  C2: ['Tornillos flojos', 'Vibración excesiva', 'Soporte dañado'],
  C3: ['Boquilla desgastada', 'Boquilla obstruida', 'Flange con fuga'],
  C4: ['Dispara sola', 'Palanca fuera de posición', 'Evidencia de alivio'],
  C5: ['Aguja oscila', 'Visor roto', 'Manómetro faltante', 'Sin glicerina'],
  C6: ['Caja abierta', 'Humedad en la caja', 'Cable dañado', 'Oxidación'],
  C7: ['Silenciador tapado', 'Silenciador faltante', 'Ruido anormal'],
  C8: ['Cable faltante', 'Cable cortado', 'Cable deformado'],
  D1: ['Orden incorrecto', 'Cañón saltado', 'Fuera de secuencia'],
  D2: ['Pulso corto', 'Pulso largo'],
  D3: ['Dispara con tanque parcial', 'Intervalo muy corto'],
};

// Botones de valores comunes para las mediciones
export const VALORES_MEDICION: Record<string, number[]> = {
  presion_set: [60, 70, 80, 90, 100],
  presion_real: [60, 70, 80, 90, 100],
  temperatura: [25, 30, 35, 40, 50, 60],
};

export const ACCIONES_TOMADAS = ['Se ajustó en sitio', 'Se cambió el repuesto', 'Se programa mantenimiento', 'Se reporta al cliente', 'Queda fuera de servicio'];

/** Agrega o quita una frase de un texto separado por punto y coma. */
export function alternarFrase(texto: string, frase: string): string {
  const partes = texto
    .split(/\s*;\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  const i = partes.findIndex((x) => x.toLowerCase() === frase.toLowerCase());
  if (i >= 0) partes.splice(i, 1);
  else partes.push(frase);
  return partes.join('; ');
}
export const tieneFrase = (texto: string, frase: string) =>
  texto
    .split(/\s*;\s*/)
    .some((x) => x.trim().toLowerCase() === frase.toLowerCase());

export const HALLAZGOS_RONDA: { id: string; texto: string }[] = [
  { id: 'PLC', texto: 'Problemas de señal PLC' },
  { id: 'BOBINA', texto: 'Bobina en mal estado' },
  { id: 'SELLOS', texto: 'Cambiar kit de sellos' },
  { id: 'PISTON', texto: 'Cambiar pistón' },
  { id: 'VALVULA', texto: 'Cambiar válvula' },
];

/* --------------------------- Inspección a fondo --------------------------- */

export interface Tarea {
  id: string;
  tarea: string;
  criterio: string;
  herramienta: string;
}
export const GRUPOS_DETALLE: { titulo: string; tareas: Tarea[] }[] = [
  {
    titulo: 'A. Sistema eléctrico — PLC → solenoide',
    tareas: [
      { id: 'A1', tarea: 'Verificación de disparo con sala de control', criterio: 'El cañón dispara desde la activación de la sala: la señal es efectiva. Si no, verificar la válvula para identificar el daño.', herramienta: 'Radio' },
      { id: 'A2', tarea: 'Voltaje en bornes del solenoide', criterio: '24 VDC ±10 % o 110-220 VAC según modelo. Sin voltaje = revisar PLC.', herramienta: 'Multímetro' },
      { id: 'A3', tarea: 'Continuidad cable PLC → solenoide', criterio: 'Resistencia < 1 Ω. Sin cortes ni falsos contactos.', herramienta: 'Multímetro' },
      { id: 'A4', tarea: 'Resistencia bobina del solenoide', criterio: 'Valor nominal (típ. 20-60 Ω). Infinito = quemada. 0 = cortocircuito.', herramienta: 'Multímetro' },
      { id: 'A5', tarea: 'Señal PLC activa durante disparo (bit)', criterio: 'LED del módulo encendido. Sin alarmas activas en el bloque de salidas digitales.', herramienta: 'HMI / visual' },
      { id: 'A6', tarea: 'Consumo de corriente en activación', criterio: 'Dentro del rango nominal. 0 A con voltaje presente = bobina abierta.', herramienta: 'Multímetro' },
    ],
  },
  {
    titulo: 'B. Sistema neumático — solenoide → cañón',
    tareas: [
      { id: 'B1', tarea: 'Presión de línea de suministro', criterio: '4–7 bar (60–100 PSI). Sin caída > 0,5 bar en reposo.', herramienta: 'Manómetro' },
      { id: 'B2', tarea: 'Apertura del solenoide al recibir señal', criterio: 'Se escucha o siente el disparo. Usar override manual para confirmar.', herramienta: 'Visual / táctil' },
      { id: 'B3', tarea: 'Presión en tanque antes del disparo', criterio: 'Estabilizada al set point ±0,2 bar.', herramienta: 'Manómetro' },
      { id: 'B4', tarea: 'Tiempo de llenado del tanque post-disparo', criterio: '35 L: 17 s · 70 L: 33 s · 100 L: 44 s · 150 L: 61 s @ 100 PSI.', herramienta: 'Cronómetro' },
      { id: 'B5', tarea: 'Disparo efectivo — material fluye', criterio: 'Flujo libre post-disparo. Sin atasco residual en silo o tolva.', herramienta: 'Visual' },
      { id: 'B6', tarea: 'Fugas audibles en línea neumática', criterio: 'Sin siseos en estado cerrado. Sin pérdida de presión en reposo.', herramienta: 'Auditivo' },
    ],
  },
  {
    titulo: 'C. Inspección visual — exterior',
    tareas: [
      { id: 'C1', tarea: 'Estado exterior del tanque', criterio: 'Sin corrosión activa, golpes ni deformaciones visibles.', herramienta: 'Visual' },
      { id: 'C2', tarea: 'Fijaciones y soportes estructurales', criterio: 'Sin tornillos flojos. Sin vibración excesiva en operación.', herramienta: 'Visual / llave' },
      { id: 'C3', tarea: 'Flange de salida y boquilla', criterio: 'Sin desgaste que altere la dirección del chorro. Sin obstrucciones.', herramienta: 'Visual' },
      { id: 'C4', tarea: 'Válvula de seguridad — posición normal', criterio: 'Palanca en reposo. Sin evidencia de alivio no programado.', herramienta: 'Visual' },
      { id: 'C5', tarea: 'Manómetro y visor de presión', criterio: 'Aguja estable sin oscilación. Visor limpio, sin rotura.', herramienta: 'Visual' },
      { id: 'C6', tarea: 'Cables, prensaestopas y caja solenoide', criterio: 'Sin daño mecánico. Caja cerrada sin humedad. Sin oxidación.', herramienta: 'Visual' },
      { id: 'C7', tarea: 'Silenciadores de escape', criterio: 'Presentes, sin daño ni obstrucción. Sin ruido anormal en disparo.', herramienta: 'Visual / auditivo' },
      { id: 'C8', tarea: 'Cable de seguridad anti-caída', criterio: 'Presente e íntegro. Sin cortes ni deformación.', herramienta: 'Visual' },
    ],
  },
  {
    titulo: 'D. Temporización y secuencia de disparos',
    tareas: [
      { id: 'D1', tarea: 'Secuencia de disparo en PLC / temporizador', criterio: 'Orden de cañones correcto. Sin cañones saltados o fuera de secuencia.', herramienta: 'HMI / PLC' },
      { id: 'D2', tarea: 'Tiempo del pulso de apertura del solenoide', criterio: '0,20–0,35 s según modelo. Anotar el valor real en observaciones.', herramienta: 'HMI' },
      { id: 'D3', tarea: 'Intervalo mínimo entre disparos', criterio: '≥ tiempo de llenado del tanque. Sin disparos con tanque parcial.', herramienta: 'HMI' },
    ],
  },
];

export const HALLAZGOS_DETALLE: { id: string; texto: string }[] = [
  { id: 'DISPARO_DEBIL', texto: 'Disparo débil o sin disparo' },
  { id: 'PRESION', texto: 'Presión fuera de rango' },
  { id: 'FUGAS', texto: 'Fugas neumáticas' },
  { id: 'LLENADO', texto: 'Tiempo de llenado excesivo' },
  { id: 'SOLENOIDE', texto: 'Solenoide sin respuesta' },
  { id: 'TORNILLOS', texto: 'Tornillos sueltos' },
  { id: 'MANOMETRO', texto: 'Manómetro ausente o dañado' },
  { id: 'SILENCIADOR', texto: 'Silenciador faltante o dañado' },
];

export const MEDICIONES: { id: string; texto: string; unidad: string }[] = [
  { id: 'horas', texto: 'Horas de operación', unidad: 'h' },
  { id: 'presion_set', texto: 'Presión set', unidad: 'PSI' },
  { id: 'presion_real', texto: 'Presión real', unidad: 'PSI' },
  { id: 'llenado', texto: 'Tiempo de llenado', unidad: 's' },
  { id: 'temperatura', texto: 'Temperatura ambiente', unidad: '°C' },
];

// Tiempo de llenado de referencia a 100 PSI, según el tamaño del tanque
export const LLENADO_REF: Record<number, number> = { 35: 17, 70: 33, 100: 44, 150: 61 };
export const TANQUES = [35, 70, 100, 150];
export const PRESION_MIN = 60;
export const PRESION_MAX = 100;

/** Revisa las mediciones y devuelve los avisos y los hallazgos que se deben marcar solos. */
export function revisarMediciones(m: Record<string, number | null | undefined>, tanque: number | null) {
  const avisos: string[] = [];
  const hallazgos: string[] = [];
  const real = m.presion_real;
  if (real != null && Number.isFinite(real) && (real < PRESION_MIN || real > PRESION_MAX)) {
    avisos.push(`Presión real de ${real} PSI fuera del rango ${PRESION_MIN}–${PRESION_MAX} PSI.`);
    hallazgos.push('PRESION');
  }
  const ll = m.llenado;
  const ref = tanque ? LLENADO_REF[tanque] : undefined;
  if (ll != null && Number.isFinite(ll) && ref && ll > ref * 1.15) {
    avisos.push(`Llenado de ${ll} s: el tanque de ${tanque} L debería llenar en ${ref} s (+${Math.round((ll / ref - 1) * 100)} %).`);
    hallazgos.push('LLENADO');
  }
  return { avisos, hallazgos };
}

/* ----------------------- Repuestos sugeridos por falla ----------------------- */
// Códigos del despiece que ya está en la app. Si un código no existe en el inventario, no se muestra.

const REPUESTOS: Record<string, Partial<Record<Modelo, string[]>>> = {
  PISTON: { Destroyer: ['2CAR-PT-DES-AL'], XHV: ['392'], Capol: ['392'] },
  SELLOS: {
    Destroyer: ['5VE-AO-VED-6.73X0.09-BO', '5VE-AO-VED-7.48X0.1-BO', '5VE-AO-VED-4.5X0.27-BO', '5VE-AO-VED-2.86X1.03-BO', '5VE-AO-VED-0.48X0.13-BO', '2CAR-DER-DES-PU'],
    XHV: ['393', '395', '391', '4943'],
    Capol: ['393', '395', '391'],
  },
  VALVULA: { Destroyer: ['2CAR-DER-DES-PU', '2CAR-PT-VED-AL'], XHV: ['4961', '391'], Capol: ['389'] },
  BOBINA: { XHV: ['514'], Capol: ['4196'] },
  SOLENOIDE: { XHV: ['514'], Capol: ['4196'] },
  MANOMETRO: { XHV: ['516'], Capol: ['516'] },
  VALVULA_SEG: { XHV: ['390'], Capol: ['390'], Destroyer: ['2CAR-VSAF-4-A'] },
  SILENCIADORES: { Destroyer: ['2CAR-ABAF-DES-AL'] },
  SILENCIADOR: { Destroyer: ['2CAR-ABAF-DES-AL'] },
  TORNILLOS: { Capol: ['736', '557'] },
};

const MOTIVO: Record<string, string> = {
  PISTON: 'Cambiar pistón',
  SELLOS: 'Cambiar kit de sellos',
  VALVULA: 'Cambiar válvula',
  BOBINA: 'Bobina en mal estado',
  SOLENOIDE: 'Solenoide',
  MANOMETRO: 'Manómetro',
  VALVULA_SEG: 'Válvula de seguridad',
  SILENCIADORES: 'Silenciadores',
  SILENCIADOR: 'Silenciador',
  TORNILLOS: 'Tornillos',
};

/** Repuestos sugeridos para un cañón según sus hallazgos y los puntos en falla. */
export function repuestosSugeridos(modelo: string, hallazgos: string[], resultados: Record<string, Resultado>) {
  const claves = new Set<string>(hallazgos);
  Object.entries(resultados).forEach(([k, v]) => v === 'FALLA' && claves.add(k));
  // El kit de sellos ya incluye el diafragma: no se repite si también se pide la válvula
  const salida: { sku: string; motivo: string }[] = [];
  const vistos = new Set<string>();
  claves.forEach((k) => {
    (REPUESTOS[k]?.[modelo as Modelo] ?? []).forEach((sku) => {
      if (vistos.has(sku)) return;
      vistos.add(sku);
      salida.push({ sku, motivo: MOTIVO[k] ?? k });
    });
  });
  return salida;
}

/* --------------------- Cargar cañones desde el Excel --------------------- */

export interface CanonLeido {
  codigo: string;
  original: string;
  modelo: Modelo;
  ubicacion: string;
  aviso: string | null;
}

// Texto de una celda sin fallar con celdas combinadas vacías
function textoDe(c: { text?: string; value?: unknown }): string {
  try {
    return String(c.text ?? '').trim();
  } catch {
    const v = c.value;
    return v == null || typeof v === 'object' ? '' : String(v).trim();
  }
}

const MODELO_DE: Record<string, Modelo> = { DESTROY: 'Destroyer', DESTROYER: 'Destroyer', XHV: 'XHV', CAPOL: 'Capol' };

/** Lee el check-list de Excel de Poliway: filas "UBICACION: …" y debajo los cañones (código en A, tipo en O). */
export async function leerCanonesExcel(f: File): Promise<CanonLeido[]> {
  const ExcelJS = (await import('exceljs')).default;
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await f.arrayBuffer());
  const salida: CanonLeido[] = [];
  for (const hoja of libro.worksheets) {
    let ubicacion = '';
    let tipoCol = 0;
    hoja.eachRow((fila) => {
      const a = textoDe(fila.getCell(1));
      if (/^UBICACI[OÓ]N\s*:/i.test(a)) {
        ubicacion = a.replace(/^UBICACI[OÓ]N\s*:\s*/i, '').trim();
        return;
      }
      // La columna del tipo de cañón se busca por su título ("Tipo de cañon")
      fila.eachCell((c, n) => {
        if (/^tipo de ca[ñn][oó]n/i.test(textoDe(c))) tipoCol = n;
      });
      if (!ubicacion || !a || !tipoCol) return;
      const tipo = textoDe(fila.getCell(tipoCol)).toUpperCase();
      const modelo = MODELO_DE[tipo];
      if (!modelo) return;
      salida.push({ codigo: a.toUpperCase(), original: a, modelo, ubicacion: titulo(ubicacion), aviso: null });
    });
  }
  // Correcciones y repetidos
  const conteo = new Map<string, number>();
  salida.forEach((c) => {
    // "AO2-32" escrito con la letra O en vez del cero
    const corregido = c.codigo.replace(/^A[O]([0-9])/, 'A0$1');
    if (corregido !== c.codigo) {
      c.aviso = `Se corrigió "${c.original}" a "${corregido}" (letra O por cero).`;
      c.codigo = corregido;
    }
    conteo.set(c.codigo, (conteo.get(c.codigo) ?? 0) + 1);
  });
  const vistos = new Map<string, number>();
  salida.forEach((c) => {
    if ((conteo.get(c.codigo) ?? 0) < 2) return;
    const n = (vistos.get(c.codigo) ?? 0) + 1;
    vistos.set(c.codigo, n);
    if (n > 1) {
      const nuevo = `${c.codigo} (${c.ubicacion})`;
      c.aviso = `Código repetido en el Excel: quedó como "${nuevo}". Confirme el código real.`;
      c.codigo = nuevo;
    }
  });
  return salida;
}

const titulo = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(^|[\s,/(-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
    .replace(/ (De|Del|La|Las|Los|Y|E|O) /g, (m) => m.toLowerCase());

/* ---------------------------------- PDF ---------------------------------- */

export interface EquipoInspeccionado {
  serial: string;
  modelo: string;
  ubicacion: string | null;
  tanque: number | null;
  resultados: Record<string, Resultado>;
  hallazgos: string[];
  mediciones: Record<string, number | null>;
  observacion: string | null;
}
export interface DatosInspeccion {
  id: number;
  tipo: 'RONDA' | 'DETALLE';
  cliente: string;
  fecha: string;
  turno: string | null;
  zona: string | null;
  inspector: string | null;
  observaciones: string | null;
  firma: string | null;
  equipos: EquipoInspeccionado[];
}

// La letra del PDF no tiene algunos símbolos: se cambian por texto
const pdfTxt = (t: string) => t.replace(/→/g, '>').replace(/Ω/g, ' ohm').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/—/g, '-');

const marca = (r: Resultado | undefined) => (r === 'OK' ? 'OK' : r === 'FALLA' ? 'X' : r === 'NA' ? 'N/A' : '');
const fechaLarga = (f: string) => new Date(`${f.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

async function cargarPdf() {
  const { jsPDF } = await import('jspdf');
  type FnTabla = (d: unknown, o: Record<string, unknown>) => void;
  const modulo = (await import('jspdf-autotable')) as unknown as { default?: FnTabla | { default?: FnTabla }; autoTable?: FnTabla };
  const autoTable: FnTabla | undefined =
    typeof modulo.default === 'function' ? modulo.default : typeof modulo.default?.default === 'function' ? modulo.default.default : modulo.autoTable;
  if (!autoTable) throw new Error('No se pudo cargar el generador de tablas PDF');
  return { jsPDF, autoTable };
}

export async function descargarInspeccionPdf(d: DatosInspeccion) {
  const { jsPDF, autoTable } = await cargarPdf();
  const ronda = d.tipo === 'RONDA';
  const doc = new jsPDF({ orientation: ronda ? 'landscape' : 'portrait', unit: 'mm', format: 'letter' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const m = 12;
  const logo = await logoDataUrl();

  const encabezado = () => {
    if (logo) doc.addImage(logo, 'PNG', m, 8, 38, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(87, 87, 87);
    doc.text(pdfTxt(`ISO 9001 · ${DOC}`), ancho - m, 10, { align: 'right' });
    doc.text(`Inspección N.° ${d.id}`, ancho - m, 13.5, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(ronda ? 13 : 11.5);
    doc.setTextColor(17, 17, 17);
    doc.text(ronda ? 'CHECK-LIST DIARIO - CAÑONES DE AIRE' : 'INSPECCIÓN DE CAÑÓN - HOJA DE VIDA', m + 44, 19);
    doc.setFillColor(255, 189, 89);
    doc.rect(m, 22, ancho - m * 2, 1, 'F');
  };
  encabezado();

  let y = 28;
  doc.setFontSize(9);
  doc.setTextColor(17, 17, 17);
  const dato = (t: string, v: string, x: number) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${t}:`, x, y);
    // El ancho se mide con la letra en negrita (la de la etiqueta) y se deja un espacio fijo
    const ancho = doc.getTextWidth(`${t}:`);
    doc.setFont('helvetica', 'normal');
    doc.text(v, x + ancho + 1.8, y);
  };
  // Primera línea: la planta; segunda: fecha, turno, zona o ubicación e inspector
  dato('Planta / cliente', d.cliente, m);
  y += 5;
  const resto: [string, string][] = [
    ['Fecha', fechaLarga(d.fecha)],
    ['Turno', d.turno ?? '-'],
    [ronda ? 'Zona' : 'Ubicación', (ronda ? d.zona : d.equipos[0]?.ubicacion) ?? '-'],
    ['Inspector', d.inspector ?? '-'],
  ];
  const cols = ronda ? 4 : 2;
  resto.forEach(([t, v], i) => {
    if (i > 0 && i % cols === 0) y += 5;
    dato(t, v, m + (i % cols) * ((ancho - m * 2) / cols));
  });
  y += 5;
  doc.setFontSize(7.5);
  doc.setTextColor(179, 38, 30);
  const adv = doc.splitTextToSize(ADVERTENCIA, ancho - m * 2);
  doc.text(adv, m, y);
  y += adv.length * 3.4 + 3;

  const estilos = {
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.3, textColor: [17, 17, 17], lineColor: [217, 217, 217], lineWidth: 0.1 },
    headStyles: { fillColor: [17, 17, 17], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: m, right: m, top: 28, bottom: 14 },
    didDrawPage: () => {
      encabezado();
      doc.setFontSize(7);
      doc.setTextColor(87, 87, 87);
      doc.text('Inventario Poliway  |  Blaster by Poliway', m, alto - 7);
    },
    didParseCell: (c: { section: string; cell: { raw: unknown; styles: { textColor: number[]; fontStyle: string } } }) => {
      if (c.section === 'body' && c.cell.raw === 'X') {
        c.cell.styles.textColor = [179, 38, 30];
        c.cell.styles.fontStyle = 'bold';
      }
    },
  };

  if (ronda) {
    const H = HALLAZGOS_RONDA;
    const grupos = new Map<string, EquipoInspeccionado[]>();
    d.equipos.forEach((e) => grupos.set(e.ubicacion ?? 'Sin ubicación', [...(grupos.get(e.ubicacion ?? 'Sin ubicación') ?? []), e]));
    const cuerpo: unknown[][] = [];
    grupos.forEach((lista, ub) => {
      cuerpo.push([{ content: `UBICACIÓN: ${ub.toUpperCase()}`, colSpan: 3 + PUNTOS_RONDA.length + H.length + 1, styles: { fillColor: [255, 236, 204], fontStyle: 'bold' } }]);
      lista.forEach((e) =>
        cuerpo.push([
          e.serial,
          e.modelo,
          ...PUNTOS_RONDA.map((p) => marca(e.resultados[p.id])),
          ...H.map((h) => (e.hallazgos.includes(h.id) ? 'X' : '')),
          e.observacion ?? '',
        ])
      );
    });
    autoTable(doc, {
      ...estilos,
      startY: y,
      head: [['Cañón', 'Tipo', ...PUNTOS_RONDA.map((p) => p.corto), 'PLC', 'Bobina', 'Sellos', 'Pistón', 'Válvula', 'Observaciones']],
      body: cuerpo,
      columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 15 }, [2 + PUNTOS_RONDA.length + H.length]: { cellWidth: 40 } },
      bodyStyles: { halign: 'center' },
    });
  } else {
    const e = d.equipos[0];
    doc.setFontSize(10);
    doc.setTextColor(17, 17, 17);
    doc.setFont('helvetica', 'bold');
    doc.text(`Cañón ${e.serial} · ${e.modelo}${e.tanque ? ` · tanque ${e.tanque} L` : ''}`, m, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(
      MEDICIONES.map((x) => `${x.texto}: ${e.mediciones[x.id] ?? '—'}${e.mediciones[x.id] != null ? ` ${x.unidad}` : ''}`).join('   ·   '),
      m,
      y
    );
    y += 4;
    const cuerpo: unknown[][] = [];
    GRUPOS_DETALLE.forEach((g) => {
      cuerpo.push([{ content: pdfTxt(g.titulo.toUpperCase()), colSpan: 7, styles: { fillColor: [255, 236, 204], fontStyle: 'bold' } }]);
      g.tareas.forEach((t) => {
        const r = e.resultados[t.id];
        cuerpo.push([t.id, pdfTxt(t.tarea), pdfTxt(t.criterio), t.herramienta, r === 'OK' ? 'OK' : '', r === 'FALLA' ? 'X' : '', r === 'NA' ? 'N/A' : '']);
      });
    });
    autoTable(doc, {
      ...estilos,
      startY: y,
      head: [['#', 'Tarea de verificación', 'Criterio de aceptación', 'Herramienta', 'OK', 'Falla', 'N/A']],
      body: cuerpo,
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 45 }, 3: { cellWidth: 20 }, 4: { cellWidth: 10, halign: 'center' }, 5: { cellWidth: 10, halign: 'center' }, 6: { cellWidth: 10, halign: 'center' } },
    });
    let fy = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 6;
    if (fy > alto - 60) {
      doc.addPage();
      fy = 32;
    }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen de hallazgos:', m, fy);
    doc.setFont('helvetica', 'normal');
    const h = HALLAZGOS_DETALLE.filter((x) => e.hallazgos.includes(x.id)).map((x) => x.texto);
    doc.text(h.length ? h.join(' · ') : 'Ninguno', m + 40, fy);
    fy += 6;
    if (e.observacion || d.observaciones) {
      doc.setFont('helvetica', 'bold');
      doc.text('Observaciones / acción tomada:', m, fy);
      doc.setFont('helvetica', 'normal');
      const t = doc.splitTextToSize([e.observacion, d.observaciones].filter(Boolean).join('. '), ancho - m * 2);
      doc.text(t, m, fy + 5);
      fy += 5 + t.length * 4.5;
    }
    fy = Math.max(fy + 22, alto - 40);
    if (d.firma) {
      try {
        doc.addImage(d.firma, 'PNG', m, fy - 22, 55, 20);
      } catch {
        /* sin firma legible */
      }
    }
    doc.setDrawColor(17, 17, 17);
    doc.line(m, fy, m + 70, fy);
    doc.setFont('helvetica', 'bold');
    doc.text('Técnico:', m, fy + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(d.inspector ?? '', m + 16, fy + 5);
  }

  if (ronda && d.observaciones) {
    let fy = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 6;
    if (fy > alto - 25) {
      doc.addPage();
      fy = 32;
    }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 17, 17);
    doc.text('Observaciones / acción tomada:', m, fy);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(d.observaciones, ancho - m * 2), m, fy + 5);
  }

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(87, 87, 87);
    doc.text(`Página ${i} de ${paginas}`, ancho - m, alto - 7, { align: 'right' });
  }
  const limpio = d.cliente.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').slice(0, 30);
  doc.save(`${ronda ? 'ronda' : 'inspeccion'}_${d.id}_${limpio}_${d.fecha}.pdf`);
}
