// Respuestas del asistente Blaster sobre los cañones y sus repuestos:
// cuántas piezas tiene cada cañón, cuáles son, para qué sirve cada una,
// en qué cañones va, qué falta en bodega, cuánto vale un juego completo,
// medidas, tiempos, presiones, garantía, accesorios, seguridad y contactos.

import { CANONES } from '@/lib/canones';
import { numero, pesos, UNIDADES } from '@/lib/formato';
import * as K from './conocimiento';
import { buscarProductos, type ProductoVoz } from './interpretar';

export interface DatosBodega {
  existencias: Map<string, { cantidad: number; minimo: number; unidad: string }>;
  costos: Map<string, number>;
  verCostos?: boolean; // solo el administrador
}
export interface RespuestaSaber {
  texto: string;
  voz?: string;
  lista?: string[];
  nota?: string;
  opciones?: ProductoVoz[];
  preguntaSi?: ListaHablada;
  ver?: Ver; // pieza o cañón para mostrar en el dibujo
  secuencia?: PasoHablado[]; // al nombrar piezas: se resalta cada una mientras se dice
}
export interface Ver {
  modelo?: K.ClaveCanon;
  sku?: string;
  n?: number;
}
export interface PasoHablado {
  texto: string;
  ver: Ver;
}
export interface ListaHablada {
  texto: string;
  voz?: string;
  lista?: string[];
  ver?: Ver;
  secuencia?: PasoHablado[];
}

const MODELOS: K.ClaveCanon[] = ['destroyer', 'xhv', 'capol'];
const NOMBRE: Record<K.ClaveCanon, string> = { destroyer: 'Destroyer', xhv: 'XHV', capol: 'Capol' };
const hay = (t: string, r: RegExp) => r.test(t);

/* Piezas de un cañón en el orden del catálogo (ítem 1, 2, 3…) */
export function piezasDe(m: K.ClaveCanon) {
  const mapa = new Map<number, { n: number; nombre: string; sku: string }>();
  CANONES[m].zonas.forEach((z) => z.piezas.forEach((p) => mapa.set(p.n, p)));
  return [...mapa.values()].sort((a, b) => a.n - b.n);
}

/* En qué cañones va un código, y con qué número de ítem */
function canonesDe(sku: string) {
  return MODELOS.flatMap((m) => piezasDe(m).filter((p) => p.sku === sku).map((p) => ({ m, n: p.n })));
}

function existencia(sku: string, d: DatosBodega) {
  const e = d.existencias.get(sku);
  if (!e) return 'no está en el inventario';
  const u = UNIDADES[e.unidad] ?? e.unidad.toLowerCase();
  if (e.cantidad <= 0) return 'agotado';
  return `hay ${numero.format(e.cantidad)} ${u}${e.minimo > 0 && e.cantidad <= e.minimo ? ' (en el mínimo)' : ''}`;
}

function listaPiezas(m: K.ClaveCanon, d: DatosBodega): ListaHablada {
  const piezas = piezasDe(m);
  return {
    texto: `Piezas del cañón ${NOMBRE[m]}:`,
    lista: piezas.map((p) => `${p.n}. ${p.nombre} (${p.sku}): ${existencia(p.sku, d)}`),
    voz: piezas.map((p) => `${p.n}, ${p.nombre}, ${existencia(p.sku, d)}`).join('. ') + '.',
    ver: { modelo: m },
    secuencia: piezas.map((p) => ({ texto: `${p.n}, ${p.nombre}, ${existencia(p.sku, d)}.`, ver: { modelo: m, n: p.n, sku: p.sku } })),
  };
}

const PALABRAS_PREGUNTA =
  /\b(para que (sirve|sirven|es|son)|que (funcion|hace|hacen|es|son)|funcion|funciones|informacion|info|cuentame|explicame|explica|hablame|dime|sobre|acerca|en que (canon|canones)|en cuales canones|que canones|donde (va|van|se usa|se usan|se pone)|a que canon|lleva|llevan|usa|usan|mantenimiento|como se (cambia|cambian|revisa)|cuando se (cambia|cambian)|cada cuanto|se desgasta|desgaste|del|de la|de los|de las|el|la|los|las|un|una|es|son)\b/g;

export function responderSaber(t: string, forzados: ProductoVoz[], productos: ProductoVoz[], d: DatosBodega): RespuestaSaber {
  const modelos = MODELOS.filter((m) => new RegExp(`\\b${m}\\b`).test(t));
  const modelo = modelos[0] ?? null;

  // ¿Qué es un cañón de aire? / ¿Cómo funciona?
  if (hay(t, /\bcomo funciona|\bcomo trabaja|\bcomo dispara|\bfuncionamiento\b/) && !forzados.length) {
    return {
      texto: `Así funciona un cañón de aire${modelo ? ` como el ${NOMBRE[modelo]}` : ''}:`,
      lista: K.COMO_FUNCIONA,
      voz: K.COMO_FUNCIONA.join(' '),
      nota: 'Descripción general de los cañones de aire de pistón.',
    };
  }
  if (hay(t, /\bque (es|son) (un |una |los |las )?canon(es)? de aire\b|\bpara que (sirve|sirven) (un |el |los )?canon(es)?( de aire)?$/)) {
    return { texto: K.QUE_ES, lista: [`Presión óptima de trabajo: ${K.DATOS_GENERALES.presionOptima}.`, `Fuerza de impacto: ${K.DATOS_GENERALES.fuerza}.`, K.DATOS_GENERALES.compatibilidad] };
  }

  // Cuántas piezas tiene / nombrarlas
  const pideLista = hay(t, /\b(nombra|nombrame|nombralas|enumera|enumerame|lista|listame|cuales son las (piezas|partes|repuestos)|dime las (piezas|partes)|lee las piezas|que piezas (tiene|lleva)|que partes (tiene|lleva)|que repuestos (tiene|lleva))\b/);
  const pideCuantas = hay(t, /\b(cuantas (piezas|partes)|cuantos (repuestos|componentes|items|elementos)|(piezas|partes) (tiene|lleva|componen|conforman)|componen|conforman|compone|conforma|(esta|estan) (hecho|formado|conformado|compuesto))\b/);
  const faltantes = hay(t, /\b(agotad\w*|sin existencia|que (le )?falta|faltan|que no hay|que no tenemos|que (piezas|repuestos) hay|que tenemos del|existencias? del|stock del|como esta(mos)? (de|el|en))\b/);
  const juego = hay(t, /\b(juego completo|juego de repuestos|kit|todo el despiece|despiece completo|todas las piezas|cuanto (vale|cuesta|valen|cuestan) (un |el )?(juego|kit|despiece|repuesto completo))\b/);

  if ((pideLista || pideCuantas || faltantes || juego) && !modelo && !forzados.length) {
    return {
      texto: '¿De cuál cañón? Según el catálogo:',
      lista: MODELOS.map((m) => `${NOMBRE[m]}: ${piezasDe(m).length} piezas`),
      voz: `¿De cuál cañón? El Destroyer tiene ${piezasDe('destroyer').length} piezas, el XHV ${piezasDe('xhv').length} y el Capol ${piezasDe('capol').length}.`,
    };
  }

  if (modelo && faltantes) {
    const piezas = piezasDe(modelo);
    const sin = piezas.filter((p) => (d.existencias.get(p.sku)?.cantidad ?? 0) <= 0);
    const bajas = piezas.filter((p) => {
      const e = d.existencias.get(p.sku);
      return e && e.cantidad > 0 && e.minimo > 0 && e.cantidad <= e.minimo;
    });
    if (!sin.length && !bajas.length) return { texto: `Del cañón ${NOMBRE[modelo]} hay existencia de todas las piezas y ninguna está en el mínimo.` };
    return {
      ver: { modelo },
      texto: `Cañón ${NOMBRE[modelo]}: ${sin.length} de ${piezas.length} piezas sin existencia${bajas.length ? ` y ${bajas.length} en el mínimo` : ''}.`,
      lista: [...sin.map((p) => `${p.n}. ${p.nombre} (${p.sku}): agotado`), ...bajas.map((p) => `${p.n}. ${p.nombre} (${p.sku}): ${existencia(p.sku, d)}`)],
      voz: `Del ${NOMBRE[modelo]} hay ${sin.length} piezas sin existencia${bajas.length ? ` y ${bajas.length} en el mínimo` : ''}. ${sin
        .slice(0, 6)
        .map((p) => p.nombre)
        .join(', ')}${sin.length > 6 ? ', y otras' : ''}.`,
    };
  }

  if (modelo && juego && !d.verCostos) return { texto: 'Los costos solo los ve el administrador.' };
  if (modelo && juego) {
    const piezas = piezasDe(modelo).filter((p, i, a) => a.findIndex((x) => x.sku === p.sku) === i);
    const conCosto = piezas.filter((p) => (d.costos.get(p.sku) ?? 0) > 0);
    const total = conCosto.reduce((a, p) => a + (d.costos.get(p.sku) ?? 0), 0);
    if (!conCosto.length)
      return { texto: `Todavía no hay costos registrados para las piezas del ${NOMBRE[modelo]}. Se llenan con las entradas de compra o al importar la lista de Poliway.` };
    return {
      texto: `Un juego completo de repuestos del ${NOMBRE[modelo]} (una unidad de cada pieza) vale ${pesos.format(total)} al costo promedio.${conCosto.length < piezas.length ? ` Ojo: ${piezas.length - conCosto.length} de las ${piezas.length} piezas aún no tienen costo, así que el valor real es mayor.` : ''}`,
      lista: conCosto.map((p) => `${p.nombre}: ${pesos.format(d.costos.get(p.sku) ?? 0)}`),
    };
  }

  if (modelo && pideLista) return listaPiezas(modelo, d);
  if (modelo && pideCuantas) {
    const l = listaPiezas(modelo, d);
    return {
      texto: `Según el catálogo, el cañón ${NOMBRE[modelo]} está conformado por ${piezasDe(modelo).length} piezas. ¿Quiere que se las nombre?`,
      ver: { modelo },
      preguntaSi: l,
    };
  }

  // Pieza por número del catálogo: "¿cuál es la pieza 5 del Capol?"
  const num = t.match(/\b(?:pieza|item|numero|parte|repuesto)(?: numero| no)? (\d+)\b/);
  if (modelo && num) {
    const p = piezasDe(modelo).find((x) => x.n === Number(num[1]));
    if (!p) return { texto: `El ${NOMBRE[modelo]} tiene piezas del 1 al ${piezasDe(modelo).length}.` };
    const prod = productos.find((x) => x.sku === p.sku);
    const r = infoPieza(prod ?? { id: p.sku, sku: p.sku, codigo_barras: p.sku, nombre: p.nombre, categoria: null, unidad_medida: 'UND' }, d, `La pieza ${p.n} del ${NOMBRE[modelo]} es`);
    return { ...r, ver: { modelo, n: p.n, sku: p.sku } };
  }

  // Datos técnicos
  const info = modelo ? K.INFO_CANONES[modelo] : null;
  if (hay(t, /\b(medidas|dimensiones|tamano|cuanto (pesa|mide)|peso|pesa|mide)\b/)) {
    const i = info ?? K.INFO_CANONES.destroyer;
    if (!i.medidas) return { texto: i.sinDatos ?? 'El catálogo no trae esas medidas.' };
    return { texto: `Medidas y pesos del cañón ${i.nombre} (catálogo):`, lista: i.medidas, voz: i.medidas.slice(0, 3).join(' ') };
  }
  if (hay(t, /\b(tiempo de (descarga|relleno|llenado|recarga)|descarga en|cuanto (se )?(demora|tarda)|rellen\w*|recarga)\b/)) {
    const i = info ?? K.INFO_CANONES.destroyer;
    if (!i.tiempos) return { texto: i.sinDatos ?? 'El catálogo no trae esos tiempos.' };
    return { texto: `Tiempos del cañón ${i.nombre} a 100 psi (catálogo):`, lista: i.tiempos, voz: i.tiempos.join(' ') };
  }
  if (hay(t, /\b(volumen de aire|cuanto aire|litros de aire)\b/)) {
    const i = info ?? K.INFO_CANONES.destroyer;
    if (!i.volumen) return { texto: i.sinDatos ?? 'El catálogo no trae ese dato.' };
    return { texto: `Aire que suelta el cañón ${i.nombre} en cada disparo (litros de aire libre, catálogo):`, lista: i.volumen, voz: i.volumen[0] };
  }
  if (hay(t, /\b(que tanques|tamanos? de tanque|capacidad|cuantos litros|de cuantos litros|modelos de tanque)\b/) && (!modelo || modelo === 'destroyer')) {
    return { texto: `El Destroyer viene con tanques de ${K.INFO_CANONES.destroyer.tanques!.join(', ')}.`, lista: K.INFO_CANONES.destroyer.medidas };
  }
  if (hay(t, /\b(presion (de trabajo|optima|minima|maxima|recomendada|de operacion|ideal)|a que presion|que presion|cuanta presion|cuantos psi|cuantas libras)\b/))
    return { texto: `Presión óptima de trabajo: ${K.DATOS_GENERALES.presionOptima}. Presión mínima: ${K.DATOS_GENERALES.presionMinima}. Fuente: catálogo Blaster.` };
  if (hay(t, /\b(fuerza|impacto|alcance|distancia|que tan lejos|material|de que (esta hecho|es))\b/) && !forzados.length && !buscarProductos(limpiarPregunta(t), productos).length)
    return {
      texto: `Datos del catálogo: fuerza de impacto ${K.DATOS_GENERALES.fuerza}; ${K.DATOS_GENERALES.alcance}; material ${K.DATOS_GENERALES.material}. ${K.DATOS_GENERALES.compatibilidad}`,
    };
  if (hay(t, /\bgarantia\b/)) return { texto: K.GARANTIA };
  if (hay(t, /\b(boquillas?|accesorios?|thunder|std safety|tubos? de descarga|sistema tr)\b/))
    return { texto: 'Accesorios del catálogo Blaster:', lista: K.ACCESORIOS, voz: 'Están las boquillas Thunder retráctiles, los tubos de descarga con cambio rápido, el sistema TR Poliway, las boquillas en acero inoxidable recta, tubular y a noventa grados, y la válvula de seguridad STD Safety de 4 pulgadas. Le dejo el detalle en pantalla.' };
  if (hay(t, /\b(contacto|contactos|asesor|vendedor|comercial|telefono|correo|email|direccion|planta|donde (queda|esta) poliway|a quien (llamo|le pido|le compro))\b/))
    return { texto: 'Contactos de Poliway (catálogo):', lista: K.CONTACTOS, voz: `En Colombia, el asesor es Manuel Osorio, al 313 507 0219. La planta está en Barranquilla. Le dejo todos los contactos en pantalla.` };
  if (hay(t, /\b(clientes de poliway|referencias|quien (usa|tiene|compra)|quienes (usan|tienen|compran))\b/))
    return { texto: 'Algunos clientes de Poliway según el catálogo:', lista: K.CLIENTES };
  if (hay(t, /\b(seguridad (para|al|antes|en)|antes de (desarmar|abrir|cambiar|hacer mantenimiento|destapar)|como (desarmo|despresurizo|desarmar|despresurizar)|precauciones|bloqueo|es peligroso|riesgos?)\b/))
    return { texto: 'Antes de intervenir un cañón de aire:', lista: K.SEGURIDAD, voz: K.SEGURIDAD.slice(0, 3).join(' '), nota: 'Recomendaciones generales de seguridad; sigan también los procedimientos de la planta.' };

  // Solo el nombre del cañón ("¿qué es el Capol?", "háblame del XHV"): se describe el cañón
  const sinModelo = limpiarPregunta(t).replace(/\b(destroyer|xhv|capol|y)\b/g, ' ').trim();
  if (modelo && !sinModelo && !forzados.length) {
    const piezas = piezasDe(modelo);
    return {
      texto: `${K.INFO_CANONES[modelo].descripcion} Según el catálogo tiene ${piezas.length} piezas. ¿Quiere que se las nombre?`,
      ver: { modelo },
      voz: `${K.INFO_CANONES[modelo].descripcion} Tiene ${piezas.length} piezas. ¿Quiere que se las nombre?`,
      preguntaSi: listaPiezas(modelo, d),
    };
  }

  // Una pieza en particular
  const candidatos = forzados.length ? forzados : buscarProductos(limpiarPregunta(t), productos);
  if (candidatos.length > 1) return { texto: '', opciones: candidatos };
  if (candidatos.length === 1) {
    const r = infoPieza(candidatos[0], d);
    // Si preguntó por un cañón en particular ("el pistón del Capol"), se muestra en ese cañón
    if (modelo && r.ver?.sku && canonesDe(r.ver.sku).some((u) => u.m === modelo)) r.ver.modelo = modelo;
    return r;
  }

  // Mantenimiento general
  if (hay(t, /\b(mantenimiento|mantener|cuidar|cuidados|revisar|inspeccion|cada cuanto)\b/))
    return { texto: `Mantenimiento recomendado${modelo ? ` para el ${NOMBRE[modelo]}` : ''}:`, lista: K.MANTENIMIENTO, voz: K.MANTENIMIENTO.slice(0, 3).join(' '), nota: 'Recomendaciones generales para cañones de aire; confírmenlas con el manual de Poliway.' };

  // Información de un cañón
  if (modelo) {
    const piezas = piezasDe(modelo);
    return {
      texto: `${K.INFO_CANONES[modelo].descripcion} Según el catálogo tiene ${piezas.length} piezas. ¿Quiere que se las nombre?`,
      ver: { modelo },
      voz: `${K.INFO_CANONES[modelo].descripcion} Tiene ${piezas.length} piezas. ¿Quiere que se las nombre?`,
      preguntaSi: listaPiezas(modelo, d),
    };
  }
  return { texto: 'No encontré esa información. Pregúnteme por un cañón (Destroyer, XHV o Capol) o por una pieza, por ejemplo «¿para qué sirve el diafragma?».' };
}

function limpiarPregunta(t: string) {
  return t.replace(PALABRAS_PREGUNTA, ' ').replace(/\b(canon|canones|pieza|piezas|repuesto|repuestos|para|que|sirve|sirven)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function infoPieza(p: ProductoVoz, d: DatosBodega, inicio?: string): RespuestaSaber {
  const info = K.PIEZAS[p.sku];
  const usos = canonesDe(p.sku);
  const enCanones = usos.length ? `Va en el ${usos.map((u) => `${NOMBRE[u.m]} (ítem ${u.n})`).join(' y en el ')}.` : '';
  const costo = d.costos.get(p.sku) ?? 0;
  const lista = [
    `Código: ${p.sku}${p.categoria ? ` · ${p.categoria}` : ''}`,
    `En bodega: ${existencia(p.sku, d)}`,
    ...(costo > 0 ? [`Costo promedio: ${pesos.format(costo)}`] : []),
    ...(info?.desgaste ? [`Mantenimiento: ${info.desgaste}`] : []),
  ];
  const cabeza = `${inicio ? `${inicio} ` : ''}${p.nombre}.`;
  if (!info)
    return {
      texto: `${cabeza} ${enCanones} Todavía no tengo cargada su función; si me la dan (o la buscamos), la agrego.`,
      lista,
      voz: `${cabeza} ${enCanones} En bodega: ${existencia(p.sku, d)}.`,
      ver: { sku: p.sku, modelo: usos[0]?.m },
    };
  return {
    texto: `${cabeza} ${info.funcion} ${enCanones}`,
    lista,
    voz: `${cabeza} ${info.funcion} ${enCanones} En bodega: ${existencia(p.sku, d)}.${info.desgaste ? ` ${info.desgaste}` : ''}`,
    nota: K.NOTA_GENERAL,
    ver: { sku: p.sku, modelo: usos[0]?.m },
  };
}
