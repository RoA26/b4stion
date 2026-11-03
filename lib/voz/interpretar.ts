// "Cerebro" del asistente Blaster: convierte una frase en español en una orden.
// No usa inteligencia artificial: son reglas propias, igual que el asistente 360.

import { leerPeriodo, quitarPeriodo, type Periodo } from './fechas';
import { interpretarInspeccion, type OrdenInspeccion } from '@/lib/voz/inspeccionVoz';
import { numerosACifras } from './numeros';
import { aplicarSinonimos } from './sinonimos';

/* ------------------------------ Datos ------------------------------ */

export interface ProductoVoz {
  id: string;
  sku: string;
  codigo_barras: string;
  nombre: string;
  categoria: string | null;
  unidad_medida: string;
}
export interface ItemVoz {
  id: number | string;
  nombre: string;
}
export interface EquipoVoz {
  id: number;
  cliente_id: number;
  modelo: string;
  serial: string | null;
  planta: string | null;
}
export interface Contexto {
  productos: ProductoVoz[];
  categorias: string[];
  funcionarios: ItemVoz[];
  areas: ItemVoz[];
  clientes: ItemVoz[];
  ubicaciones: ItemVoz[];
  equipos: EquipoVoz[];
  empresas?: string[]; // empresas con préstamos
  ruta: string;
}

export type Vista = 'movimientos' | 'inventario' | 'compras' | 'consumo';
export type Modelo = 'destroyer' | 'xhv' | 'capol';

export type Orden =
  | { tipo: 'ayuda' }
  | { tipo: 'conversacion'; activar: boolean }
  | { tipo: 'silencio'; activar: boolean }
  | { tipo: 'confirmar' }
  | { tipo: 'cancelar' }
  | { tipo: 'navegar'; ruta: string; nombre: string; modelo?: Modelo }
  | { tipo: 'existencia'; candidatos: ProductoVoz[] }
  | { tipo: 'valor'; categoria: string | null }
  | { tipo: 'minimo'; agotados: boolean; categoria: string | null }
  | {
      tipo: 'entregas';
      periodo: Periodo | null;
      funcionario: ItemVoz | null;
      area: ItemVoz | null;
      cliente: ItemVoz | null;
      categoria: string | null;
      candidatos: ProductoVoz[];
    }
  | { tipo: 'equipo'; cliente: ItemVoz | null; equipo: EquipoVoz | null }
  | {
      tipo: 'movimiento';
      movimiento: 'ENTRADA' | 'SALIDA';
      candidatos: ProductoVoz[];
      cantidad: number | null;
      costo: number | null;
      documento: string | null;
      ubicacion: ItemVoz | null;
      funcionario: ItemVoz | null;
      area: ItemVoz | null;
      cliente: ItemVoz | null;
      equipo: EquipoVoz | null;
    }
  | { tipo: 'conteo'; candidatos: ProductoVoz[]; cantidad: number | null; sumar: boolean }
  | {
      tipo: 'informe';
      vista: Vista;
      formato: 'pdf' | 'excel' | null;
      categoria: string | null;
      periodo: Periodo | null;
      movimiento: 'ENTRADA' | 'SALIDA' | null;
      funcionario: ItemVoz | null;
      area: ItemVoz | null;
      cliente: ItemVoz | null;
      estado: '' | 'alerta' | 'con';
    }
  | { tipo: 'etiquetas'; categoria: string | null; candidatos: ProductoVoz[]; generar: boolean }
  | { tipo: 'saber'; frase: string; candidatos: ProductoVoz[] }
  | { tipo: 'armado'; modelo: Modelo | null }
  | { tipo: 'transito'; numero: string | null; candidatos: ProductoVoz[] }
  | { tipo: 'etapa'; numero: string; estado: 'SALIO' | 'TRANSITO' | 'ADUANA' | 'NACIONALIZAR' }
  | OrdenInspeccion
  | { tipo: 'pdfUltimo'; formato: 'pdf' | 'excel' }
  | { tipo: 'alertas' }
  | {
      tipo: 'movs';
      consulta: 'ultimos' | 'detalle' | 'top_productos' | 'top_personas' | 'top_areas';
      movimiento: 'ENTRADA' | 'SALIDA' | null;
      periodo: Periodo | null;
      funcionario: ItemVoz | null;
      area: ItemVoz | null;
      cliente: ItemVoz | null;
      ubicacion: ItemVoz | null;
      categoria: string | null;
      candidatos: ProductoVoz[];
    }
  | {
      tipo: 'prestamos';
      sentido: 'SALIDA' | 'ENTRADA' | null;
      consulta: 'lista' | 'vencidos' | 'pronto' | 'sin_acta';
      empresa: string | null;
      candidatos: ProductoVoz[];
    }
  | { tipo: 'kardex'; candidatos: ProductoVoz[]; periodo: Periodo | null; categoria: string | null; todos?: boolean }
  | { tipo: 'donde'; candidatos: ProductoVoz[]; todos?: boolean }
  | { tipo: 'parar' }
  | { tipo: 'repetir' }
  | { tipo: 'desconocido' };

/* ---------------------------- Utilidades ---------------------------- */

export const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d)[.,](\d)/g, '$1\u0000$2') // conserva 3.500 y 12,5
    .replace(/[^a-z0-9\u0000/ ]/g, ' ')
    .replace(/\u0000/g, '.')
    .replace(/\s+/g, ' ')
    .trim();

const ARRANQUE = /^((blaster|hola|oye|ok|okey|bueno|por favor|porfa|a ver|necesito|quiero|quisiera|me puedes|puedes|podrias|hazme|haz)\s+)+/;
const CIERRE = /(\s+(por favor|porfa|gracias|listo|enter|ok|blaster))+$/;

export function limpiarFrase(texto: string): string {
  return normalizar(texto).replace(ARRANQUE, '').replace(CIERRE, '').trim();
}

const VACIAS = new Set(
  (
    'de del la el los las lo un una unos unas y o a al para por en con que cual cuales cuanto cuantos cuanta cuantas hay ' +
    'tengo tenemos tiene quedan queda existencia existencias stock inventario bodega unidades unidad und metros metro kilos ' +
    'kilo rollos rollo cada uno producto productos repuesto repuestos referencia referencias codigo pieza piezas me dame dime favor se ' +
    'mercancia mercancias material materiales insumo insumos articulo articulos item items cosa cosas tanto todavia aun ya sido ' +
    'le les mi su sus nos este esta esto ese esa son es ver mira mirar consulta consultar dice dime sabes saber cuantico ' +
    'existe existen disponible disponibles registra registrar registre hacer haz pon poner'
  ).split(' ')
);

const singular = (w: string) => (w.length > 4 ? w.replace(/(es|s)$/, '') : w);
const compacto = (s: string) => normalizar(s).replace(/[^a-z0-9]/g, '');
const palabrasDe = (s: string) => normalizar(s).replace(/\(demo\)/g, '').split(' ').filter((w) => w.length > 1 || /\d/.test(w));
const hay = (t: string, r: RegExp) => r.test(t);

/* Busca en el texto un elemento de una lista (funcionario, área, cliente…) por
   las palabras de su nombre. Devuelve el elemento y las palabras usadas. */
function buscarEnLista<T extends { nombre: string }>(t: string, lista: T[]): { item: T; usadas: string[] } | null {
  const palabras = new Set(t.split(' '));
  const significativas = (n: string) =>
    palabrasDe(n).filter((w) => !['de', 'del', 'la', 'el', 'y', 'sas', 's', 'a', 'ltda', 'sa', 'demo', 'los', 'las'].includes(w) && w.length > 2);
  const frecuencia = new Map<string, number>();
  lista.forEach((x) => new Set(significativas(x.nombre)).forEach((w) => frecuencia.set(w, (frecuencia.get(w) ?? 0) + 1)));
  let mejor: { item: T; usadas: string[]; puntos: number } | null = null;
  for (const x of lista) {
    const usadas = significativas(x.nombre).filter((w) => palabras.has(w));
    if (!usadas.length) continue;
    const unica = usadas.some((w) => frecuencia.get(w) === 1);
    if (!unica && usadas.length < 2) continue;
    const puntos = usadas.length * 10 + (unica ? 5 : 0);
    if (!mejor || puntos > mejor.puntos) mejor = { item: x, usadas, puntos };
  }
  return mejor ? { item: mejor.item, usadas: mejor.usadas } : null;
}

const quitar = (t: string, palabras: string[]) => {
  let r = ` ${t} `;
  palabras.forEach((w) => (r = r.replace(new RegExp(` ${w} `, 'g'), ' ')));
  return r.replace(/\s+/g, ' ').trim();
};

/* Categoría mencionada: "xhv" -> "Repuestos XHV"; "xhv y capol" -> "Repuestos XHV y Capol" */
export function buscarCategoria(t: string, categorias: string[]): string | null {
  const palabras = new Set(t.split(' '));
  let mejor: { c: string; n: number; total: number } | null = null;
  for (const c of categorias) {
    const ws = palabrasDe(c).filter((w) => !['repuestos', 'repuesto', 'y', 'de', 'sin'].includes(w));
    if (!ws.length) continue;
    const n = ws.filter((w) => palabras.has(w) || palabras.has(singular(w))).length;
    if (!n) continue;
    // Gana la que nombra más palabras; si empatan, la más corta ("XHV" antes que "XHV y Capol")
    if (!mejor || n > mejor.n || (n === mejor.n && ws.length < mejor.total)) mejor = { c, n, total: ws.length };
  }
  return mejor?.c ?? null;
}

/* Productos que coinciden con las palabras dichas (por código o por nombre y categoría) */
export function buscarProductos(t: string, productos: ProductoVoz[], max = 6): ProductoVoz[] {
  const palabras = t
    .split(' ')
    .filter((w) => w && !VACIAS.has(w))
    .map((w) => w.replace(/\.$/, ''));
  if (!palabras.length) return [];

  // 1. Código exacto dicho como palabra ("736") o todo el texto junto ("2car apd des bo")
  const junto = compacto(palabras.join(' '));
  const porCodigo = productos.filter(
    (p) => palabras.some((w) => compacto(w) === compacto(p.sku) || compacto(w) === compacto(p.codigo_barras)) || junto === compacto(p.sku)
  );
  if (porCodigo.length === 1) return porCodigo;

  // 2. Por palabras del nombre y de la categoría
  const dichas = palabras.map(singular);
  const puntuados = productos
    .map((p) => {
      const propias = [...palabrasDe(p.nombre), ...palabrasDe(p.categoria ?? '').filter((w) => w !== 'repuestos')].map(singular);
      const nombreP = palabrasDe(p.nombre).map(singular);
      const acierta = (w: string) => propias.some((x) => x === w || (w.length >= 4 && x.startsWith(w)) || (x.length >= 4 && w.startsWith(x)));
      const n = dichas.filter(acierta).length;
      const enNombre = nombreP.filter((x) => dichas.some((w) => x === w || (w.length >= 4 && x.startsWith(w)))).length;
      return { p, n, cobertura: enNombre / Math.max(nombreP.length, 1) };
    })
    .filter((x) => x.n > 0 && x.n >= dichas.length - (dichas.length >= 3 ? 1 : 0));
  puntuados.sort((a, b) => b.n - a.n || b.cobertura - a.cobertura);
  if (!puntuados.length) return porCodigo.slice(0, max);
  const top = puntuados[0];
  const empatados = puntuados.filter((x) => x.n === top.n && top.cobertura - x.cobertura < 0.15);
  // Si uno cubre claramente mejor el nombre, se toma ese; si no, se devuelven las opciones
  return (empatados.length === 1 ? [top] : puntuados.filter((x) => x.n === top.n)).slice(0, max).map((x) => x.p);
}

/* Para "¿dónde están los niples?" y "movimiento de los niples": si la palabra dicha
   está en el nombre de varios productos, se ofrecen todos (y se puede decir «todos») */
function ampliarCandidatos(t: string, candidatos: ProductoVoz[], productos: ProductoVoz[]): ProductoVoz[] {
  if (candidatos.length !== 1) return candidatos;
  const ws0 = t.split(' ').filter((w) => w && !VACIAS.has(w));
  if (ws0.some((w) => /\d/.test(w))) return candidatos; // "niple 3/4": ya dijo cuál
  const dichas = ws0.map(singular);
  if (!dichas.length) return candidatos;
  // Productos cuyo nombre empieza por lo dicho ("Niple", "Niple 3/4", "Niple 1/2")
  const otros = productos.filter((p) => {
    const ws = palabrasDe(p.nombre).map(singular);
    const igual = (w: string, x: string) => x === w || (w.length >= 4 && x.startsWith(w));
    return igual(dichas[0], ws[0] ?? '') && dichas.every((w) => ws.some((x) => igual(w, x)));
  });
  if (otros.length <= 1 || otros.length > 8) return candidatos;
  return [candidatos[0], ...otros.filter((p) => p.id !== candidatos[0].id)];
}

const MODELOS: Modelo[] = ['destroyer', 'xhv', 'capol'];
const modeloEn = (t: string) => MODELOS.find((m) => new RegExp(`\\b${m}\\b`).test(t));

/* Separa la cantidad de los números que son parte del producto ("o-ring 261", "736") */
function separarCantidad(t: string, ctx: Contexto, preferir: 'primero' | 'ultimo') {
  const numeros = t.split(' ').filter((w) => /^\d+(\.\d+)?$/.test(w));
  if (!numeros.length) return { cantidad: null as number | null, resto: t };
  // Un número es parte del producto si es su código, o si es un número largo de su nombre ("O-ring 261").
  // Los números cortos (1, 2, 12…) se toman como cantidad.
  const delProducto = (w: string) =>
    ctx.productos.some(
      (p) => compacto(p.sku) === w || compacto(p.codigo_barras) === w || (w.replace('.', '').length >= 3 && palabrasDe(p.nombre).includes(w))
    );
  let candidatos = numeros.filter((w) => !delProducto(w));
  // "salida de 736": el único número es un código, entonces no hay cantidad
  if (!candidatos.length) return { cantidad: null, resto: t };
  if (numeros.length === 1 && delProducto(numeros[0])) candidatos = [];
  if (!candidatos.length) return { cantidad: null, resto: t };
  const elegido = preferir === 'primero' ? candidatos[0] : candidatos[candidatos.length - 1];
  const i = t.split(' ').indexOf(elegido);
  const ws = t.split(' ');
  ws.splice(i, 1);
  return { cantidad: Number(elegido), resto: ws.join(' ') };
}

/* --------------------------- Interpretación --------------------------- */

const DONDE =
  /\b(donde (esta|estan|hay|queda|quedan|se encuentra\w*|anda|andan|tenemos|tienen|guardamos|estara|estaran)|ya (llego|llegaron|vino|vinieron|entro|entraron|esta|estan|nos llego|nos llegaron)|(sigue|siguen|esta|estan|todavia|aun|todavia esta|todavia estan|aun esta|aun estan) (en brasil|en camino|en transito|en aduana|en el puerto|viniendo|por llegar)|en que (va|van|etapa|estado) (el|la|los|las)|ubicacion (de|del)|rastre\w*|seguimiento (de|a|al|del)|que paso con (el|la|los|las)|cuando (llega|llegan|nos llega|nos llegan|va a llegar|van a llegar) (el|la|los|las))\b/;
const PALABRAS_DONDE =
  /\b(donde|esta|estan|hay|queda|quedan|se|encuentra\w*|anda|andan|tenemos|tienen|guardamos|estara|estaran|ya|llego|llegaron|vino|vinieron|entro|entraron|nos|sigue|siguen|todavia|aun|en|brasil|camino|transito|aduana|el|la|los|las|puerto|viniendo|por|llegar|que|va|van|etapa|estado|ubicacion|de|del|rastre\w*|seguimiento|a|al|paso|con|cuando|llega|llegan|a)\b/g;
const PRESTAMO =
  /\b(prestad\w*|prestamos?|prestaron|presto|prestar|prestan|nos deben|nos debe|le debemos|les debemos|debemos devolver|hay que devolver\w*|tenemos que devolver\w*|(no|aun no|todavia no) (nos )?(ha|han) devuelto|falta(n)? por devolver\w*|pendientes? por devolver|devoluci\w*|devolver\w*|devuelto|devueltos)\b/;
const PALABRAS_PRESTAMO =
  /\b(prestad\w*|prestamos?|prestaron|presto|prestar|prestan|deben|debe|debemos|devolver\w*|devuelto|devueltos|devoluci\w*|hay|que|tenemos|falta|faltan|por|pendientes?|vencid\w*|atrasad\w*|esta|semana|pronto|proxim\w*|vence|vencen|actas?|firmad\w*|firmas?|sin|firmar|quien|quienes|le|les|nos|a|al|ha|han|hemos|habiamos|tiene|tienen|no|aun|todavia|cuales|cual|cuanto|cuantos|cuantas|el|la|los|las|de|del|son|estan|empresa|empresas|otras?|tiene|que)\b/g;
const KARDEX =
  /\b(movimientos? (de|del|de la|de los|de las)|kardex|historial de movimientos|rotacion (de|del)|entradas y salidas (de|del)|que (ha|han) pasado con|que paso con|como se (ha|han) movido|como (ha|han) (salido|rotado|entrado)|como se mueve|como se mueven|cuanto (ha|han) (entrado y salido|salido y entrado))\b/;
const PALABRAS_KARDEX =
  /\b(cual|cuales|que|como|ha|han|sido|el|la|los|las|movimientos?|de|del|kardex|historial|rotacion|entradas|salidas|y|pasado|paso|con|se|movido|salido|rotado|entrado|mueve|mueven|cuanto|tenido|tuvo|hubo)\b/g;

export function interpretar(texto: string, ctx: Contexto): Orden {
  const t0 = limpiarFrase(texto);
  if (!t0) return { tipo: 'desconocido' };
  const t = aplicarSinonimos(numerosACifras(t0, false));

  // Control del asistente
  if (hay(t, /^(ayuda|ayudame|que puedes hacer|que sabes hacer|que haces|como funciona|que entiendes)$/)) return { tipo: 'ayuda' };
  if (hay(t, /\bmodo conversacion\b|\bconversemos\b|\bactiva(r)? (la )?conversacion\b/)) return { tipo: 'conversacion', activar: true };
  if (hay(t, /^(terminar|termina|salir|sal|chao|adios|hasta luego|eso es todo|ya no mas|desactiva(r)? (la )?conversacion)$/))
    return { tipo: 'conversacion', activar: false };
  if (hay(t, /^(silencio|callate|no hables|sin voz|silenciar)$/)) return { tipo: 'silencio', activar: true };
  if (hay(t, /^(habla|con voz|activa (la )?voz)$/)) return { tipo: 'silencio', activar: false };
  if (hay(t, /^(si |dale )?(confirmar|confirma|confirmo|confirmado|registralo|registrala|guardalo|guardar|si registra|dale|correcto|si)$/))
    return { tipo: 'confirmar' };
  if (hay(t, /^(cancelar|cancela|cancelalo|borrar|borra|no|olvidalo|devuelve|atras)$/)) return { tipo: 'cancelar' };
  if (hay(t, /^(para|parar|pare|parale|basta|ya|ya esta|suficiente|detente|detener|stop|alto|calla|callate ya)$/)) return { tipo: 'parar' };
  if (hay(t, /^(repite|repitelo|repitela|repetir|otra vez|de nuevo|como dijiste|que dijiste|no te entendi)$/)) return { tipo: 'repetir' };
  // "Genérame un PDF de eso" / "pásalo a Excel": la última respuesta de Blaster en un archivo
  if (
    hay(t, /\b(pdf|excel|imprim\w*)\b/) &&
    (hay(t, /\b(eso|esto|esa|ese|esos|esas|lo anterior|la respuesta|esa informacion|esta informacion|lo que (me )?dijiste|esa lista|esta lista)\b/) ||
      hay(t, /^((genera|generame|genere|hazme|haz|hagame|saca|sacame|dame|deme|descarga|descargame|mandalo|pasalo|ponlo|exporta|exportalo) )?(un |el |en |a )?(pdf|excel)$/))
  )
    return { tipo: 'pdfUltimo', formato: hay(t, /\bexcel\b/) ? 'excel' : 'pdf' };
  // "¿Qué alertas hay?", "¿qué hay pendiente?"
  if (!hay(t, /^(abre|abrir|ir a|ve a|muestra|muestrame|llevame a)\b/) && hay(t, /\balertas?\b|\bavisos?\b|\bque (hay|tengo|tenemos) (pendiente|urgente)s?\b|\bque hay para hoy\b|\bque esta pendiente\b/))
    return { tipo: 'alertas' };
  // "¿Cómo se arma el Capol?" -> modo armado paso a paso
  if (hay(t, /\b(como se (arma|ensambla|monta|armaria)|como (armo|armar|ensamblo|ensamblar|monto|montar)|modo armado|armado|ensamble|ensamblaje|paso a paso)\b/))
    return { tipo: 'armado', modelo: modeloEn(t) ?? null };

  // "Abre préstamos", "abre tránsito", "abre administración"
  if (hay(t, /^(abre|abrir|abreme|ir a|ve a|vamos a|muestra|muestrame|llevame a|pantalla)\b/)) {
    if (hay(t, /\bprestamos?\b/)) return { tipo: 'navegar', ruta: '/prestamos', nombre: 'Préstamos' };
    if (hay(t, /\b(alertas?|avisos?)\b/)) return { tipo: 'navegar', ruta: '/alertas', nombre: 'Alertas' };
    if (hay(t, /\b(inspecci\w*|ronda|check ?list)\b/)) return { tipo: 'navegar', ruta: '/inspecciones', nombre: 'Inspección de cañones' };
    if (hay(t, /\b(transito|administracion|registrar documentos?|archivo de documentos)\b/)) return { tipo: 'navegar', ruta: '/admin', nombre: 'Administración' };
  }

  if (hay(t, /^(inspecci\w*( de (los )?canones)?|ronda( diaria)?|check ?list( diario)?)$/)) return { tipo: 'navegar', ruta: '/inspecciones', nombre: 'Inspección de cañones' };

  // Mover un pedido de Brasil de etapa: "el pedido 4521 llegó a aduana", "nacionaliza el pedido 4521"
  const numPedido = t.match(/\b(?:pedido|factura|fatura|remision|invoice|importacion)\s+(?:numero |no )?(?:[a-z]{1,5} )?([a-z0-9-]*\d[a-z0-9-]*)\b/)?.[1];
  if (numPedido && !hay(t, /^(cuando|que|donde|como|cuanto|cuantos|en que)\b/)) {
    const estado = hay(t, /\b(nacionaliza(r|lo|do)?|se nacionalizo|llego a (la )?bodega|pasa(r|lo)? al inventario|entra(r)? al inventario)\b/)
      ? 'NACIONALIZAR'
      : hay(t, /\b(llego a (la )?aduana|esta en (la )?aduana|entro a (la )?aduana|en aduana|llego a colombia)\b/)
        ? 'ADUANA'
        : hay(t, /\b(salio|ya salio|despacharon|embarcaron|embarco|zarpo)\b/)
          ? 'SALIO'
          : hay(t, /\b(marca\w*\b.*\ben transito|paso a transito|ya va en camino|va en camino)\b/)
            ? 'TRANSITO'
            : null;
    if (estado) return { tipo: 'etapa', numero: numPedido, estado };
  }
  // Inspecciones de cañones: "¿dónde están las tapas dañadas?", "¿cómo está el A01-21?"
  const insp = interpretarInspeccion(t, ctx.equipos);
  if (insp) return insp;

  // "¿En qué va el pedido 4521?"
  if (numPedido && hay(t, /\bpedido\b/) && !hay(t, /\b(salida|entrada|sacar|saca|entra|entro)\b/)) return { tipo: 'transito', numero: numPedido, candidatos: [] };

  // ¿Dónde está la mercancía? En bodega, prestada, en Brasil, en tránsito, en aduana o ya llegó
  if (
    hay(t, DONDE) &&
    !(hay(t, /^ya (llego|llegaron|entro|entraron)\b/) && separarCantidad(t, ctx, 'primero').cantidad != null) // "ya llegaron 10 sellos" es una entrada
  ) {
    const resto = quitarPeriodo(t).replace(PALABRAS_DONDE, ' ').replace(/\s+/g, ' ').trim();
    const candidatos = resto && resto.split(' ').some((w) => !VACIAS.has(w)) ? ampliarCandidatos(resto, buscarProductos(resto, ctx.productos), ctx.productos) : [];
    if (candidatos.length) return { tipo: 'donde', candidatos };
  }

  // Mercancía en tránsito desde Brasil
  if (hay(t, /\b(transito|en camino|vienen?|que viene|cuando llega|llega el pedido|pedidos? de brasil|importacion(es)?|nacionaliza\w*)\b/)) {
    const numero = t.match(/\b(?:pedido|factura|fatura|remision|invoice|numero)\s+(?:numero |no )?([a-z0-9-]*\d[a-z0-9-]*)\b/)?.[1] ?? null;
    const resto = t
      .replace(/\b(transito|en camino|vienen?|que|cuando|llega|llegan|el|los|las|pedidos?|de|brasil|importacion(es)?|nacionaliza\w*|cuantos|cuantas|hay|factura|fatura|remision|numero)\b/g, ' ')
      .replace(numero ?? '###', ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { tipo: 'transito', numero, candidatos: resto ? buscarProductos(resto, ctx.productos) : [] };
  }

  // Préstamos de entrada y de salida: quién nos prestó, a quién prestamos, vencidos, actas
  if (hay(t, PRESTAMO)) {
    const sentido = hay(
      t,
      /\b(nos prestaron|nos han prestado|nos ha prestado|nos presto|nos prestan|debemos devolver|le debemos|les debemos|hay que devolver(le|les)?|tenemos que devolver(le|les)?|quien(es)? nos (ha |han )?prest\w*|que nos (ha |han )?prest\w*|nos tienen prestad\w*|devolverle|devolverles|que debemos)\b/
    )
      ? 'ENTRADA'
      : hay(
            t,
            /\b(le prestamos|les prestamos|hemos prestado|tenemos prestad\w*|nos deben|nos debe|prestad[oa]s? a|prestamos a|a quien(es)? (le |les )?(hemos |habiamos )?prest\w*|quien(es)? tiene(n)?\b.*\bprestad\w*|(no|aun no|todavia no) (nos )?(ha|han) devuelto|falta(n)? por devolver(nos)?|nos tiene(n)? que devolver)\b/
          )
        ? 'SALIDA'
        : null;
    const consulta = hay(t, /\b(vencid\w*|atrasad\w*|se pas\w* (la|de la) fecha|ya debian|debio devolver|debieron devolver)\b/)
      ? 'vencidos'
      : hay(t, /\b(esta semana|pronto|proxim\w*|por vencer|vence|vencen|se vence|se vencen|cerca de vencer)\b/)
        ? 'pronto'
        : hay(t, /\b(actas?|firmad\w*|firma|firmas|sin firmar)\b/)
          ? 'sin_acta'
          : 'lista';
    const emp = buscarEnLista(t, (ctx.empresas ?? []).map((n) => ({ id: n, nombre: n })));
    const resto = quitar(quitarPeriodo(t), emp?.usadas ?? [])
      .replace(PALABRAS_PRESTAMO, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const candidatos = resto && resto.split(' ').some((w) => w.length > 2 && !VACIAS.has(w)) ? buscarProductos(resto, ctx.productos) : [];
    return { tipo: 'prestamos', sentido, consulta, empresa: emp?.item.nombre ?? null, candidatos };
  }

  const categoria = buscarCategoria(t, ctx.categorias);
  const sinPeriodo = quitarPeriodo(t);
  const periodo = leerPeriodo(t);

  // Movimiento de un producto (kárdex): "¿cuál ha sido el movimiento de los niples?"
  if (hay(t, KARDEX)) {
    const nombrados =
      buscarEnLista(t, ctx.funcionarios) || buscarEnLista(t, ctx.areas) || buscarEnLista(t, ctx.clientes) ||
      ctx.ubicaciones.some((u) => ` ${t} `.includes(` ${normalizar(u.nombre).replace(/\bdemo\b/g, '').trim()} `));
    if (!nombrados) {
      const resto = sinPeriodo.replace(PALABRAS_KARDEX, ' ').replace(/\s+/g, ' ').trim();
      const sinCat = categoria ? quitar(resto, palabrasDe(categoria)).trim() : resto;
      const utiles = sinCat.split(' ').filter((w) => w && !VACIAS.has(w));
      if (utiles.length) {
        const candidatos = ampliarCandidatos(sinCat, buscarProductos(sinCat, ctx.productos, 8), ctx.productos);
        if (candidatos.length) return { tipo: 'kardex', candidatos, periodo, categoria: null };
      } else if (categoria && resto !== sinCat) return { tipo: 'kardex', candidatos: [], periodo, categoria };
    }
  }

  // Movimientos del almacén: últimos movimientos, qué ha pedido alguien, lo que más sale, quién pide más
  {
    const f = buscarEnLista(t, ctx.funcionarios);
    const a0 = buscarEnLista(t, ctx.areas);
    const c = buscarEnLista(t, ctx.clientes);
    // Bodega: se busca el nombre completo ("bodega 2", "bodega principal") para no confundirla con el área Bodega
    const ub = ctx.ubicaciones.find((u) => {
      const n = normalizar(u.nombre).replace(/\bdemo\b/g, '').replace(/\s+/g, ' ').trim();
      return n.includes(' ') && ` ${t} `.includes(` ${n} `);
    });
    const b = ub ? { item: ub, usadas: palabrasDe(ub.nombre) } : null;
    const a = b && a0 && b.usadas.some((w) => a0.usadas.includes(w)) ? null : a0;
    const entradas = hay(t, /\b(entro|entraron|ha entrado|han entrado|entradas|llego|llegaron|ha llegado|han llegado|recibio|recibimos|recibieron|ingreso|ingresaron)\b/);
    // Con un funcionario, área o cliente nombrado basta la palabra: el reconocimiento de voz a veces
    // se come el "qué ha" ("pedido Andrés") o escribe "a" en vez de "ha" ("qué a pedido Andrés")
    const pide = /\b(pedido|pedidos|pidio|pidieron|solicitado|solicito|solicitaron|sacado|retirado|retiro|retiraron|llevado|recibido|entregado)\b/;
    let consulta: Extract<Orden, { tipo: 'movs' }>['consulta'] | null = null;
    if (hay(t, /\b(quien|quienes)\b.*\bmas\b/) || hay(t, /\b(que|cual) area\b.*\bmas\b|\barea que mas\b|\bareas? (pide|gasta|consume|saca|usa)n? mas\b/))
      consulta = hay(t, /\barea/) ? 'top_areas' : 'top_personas';
    else if (hay(t, /\b(lo que mas|que es lo que mas|mas (sale|salen|se (usa|usan|gasta|gastan|consume|consumen|pide|piden|mueve|mueven))|mas movimiento|mas rotacion|mas pedidos|mas usados?|mas vendidos?)\b/))
      consulta = 'top_productos';
    else if (hay(t, /\bultim[oa]s?\b/) && hay(t, /\b(movimientos?|salidas?|entradas?|articulos?|productos?|repuestos?|salido|salieron|entraron|entrado)\b/) && !hay(t, /\b(ronda|inspecci\w*)\b/))
      consulta = 'ultimos';
    else if (
      hay(t, /\b(que|cuales) movimientos?\b|\bmovimientos? (de hoy|del dia|de ayer|de esta semana|del almacen|de la bodega|ha tenido|han tenido|hubo|ha habido|tuvo)\b|\bque (ha habido|hubo|ha pasado|paso) en (el almacen|la bodega)\b|\bque se ha movido\b|\bmovimiento (del|de la) (almacen|bodega)\b/)
    )
      consulta = 'ultimos';
    else if ((f || a || c) && hay(t, pide) && !hay(t, /\bpedido \w*\d/)) consulta = 'detalle';
    else if (hay(t, /^(que|cuales|cuantos|cuantas) (articulos |productos |repuestos )?(ha|han|a|an|se ha|se han|se a) (salido|entrado|movido|sacado)\b/) || (b && hay(t, /\b(salido|salieron|salio|entrado|entro|entraron|movimientos?)\b/)))
      consulta = 'ultimos';
    else if (hay(t, /^(que|cuales|cuantos|cuantas)\b/) && entradas && !hay(t, /\bpedido \w*\d/)) consulta = 'ultimos';
    if (consulta) {
      const resto = quitar(sinPeriodo, [...(f?.usadas ?? []), ...(a?.usadas ?? []), ...(c?.usadas ?? []), ...(b?.usadas ?? [])])
        .replace(
          /\b(que|cuales|cual|cuantos|cuantas|quien|quienes|es|lo|mas|ultim[oa]s?|movimientos?|salidas?|entradas?|articulos?|productos?|repuestos?|cosas|salido|salieron|salio|entraron|entro|entrado|llego|llegaron|ha|han|hay|hubo|habido|pedido|pidio|pidieron|solicitado|solicito|sacado|retirado|retiro|llevado|recibido|entregado|se|le|les|el|la|los|las|de|del|en|al|almacen|bodega|area|funcionario|cliente|sale|salen|usa|usan|gasta|gastan|consume|consumen|pide|piden|mueve|mueven|movido|rotacion|tenido|tuvo|paso|pasado|dia|todo|todos|todas)\b/g,
          ' '
        )
        .replace(/\s+/g, ' ')
        .trim();
      const sinCat = categoria ? quitar(resto, palabrasDe(categoria)).trim() : resto;
      return {
        tipo: 'movs',
        consulta,
        movimiento: entradas ? 'ENTRADA' : consulta === 'ultimos' && !hay(t, /\b(salidas?|salido|salieron|salio|sacado|despach\w*)\b/) ? null : 'SALIDA',
        periodo,
        funcionario: f?.item ?? null,
        area: a?.item ?? null,
        cliente: c?.item ?? null,
        ubicacion: b?.item ?? null,
        categoria,
        candidatos: sinCat.split(' ').some((w) => w && !VACIAS.has(w) && !/^\d+$/.test(w)) ? buscarProductos(sinCat, ctx.productos) : [],
      };
    }
  }

  // Etiquetas QR
  if (hay(t, /\betiqueta/)) {
    const resto = sinPeriodo.replace(/\betiquetas?\b|\bqr\b|\bimprim\w*|\bgenera\w*|\bhaz\w*|\bsaca\w*|\btodos?\b|\btodas?\b/g, ' ');
    // Si además de la categoría se nombra un producto ("pistón Destroyer"), se toma el producto
    const sinCategoria = categoria ? quitar(resto, palabrasDe(categoria)) : resto;
    const candidatos = sinCategoria.split(' ').some((w) => w && !VACIAS.has(w)) ? buscarProductos(resto, ctx.productos) : [];
    return { tipo: 'etiquetas', categoria: candidatos.length ? null : categoria, candidatos, generar: hay(t, /\b(imprim|genera|pdf|descarga|saca|haz)/) };
  }

  // Informes en PDF o Excel
  if (!hay(t, /\btiempo de (descarga|relleno|llenado)\b/) && hay(t, /\b(informe|informes|reporte|reportes|pdf|excel|descarga|descargar|descargame|kardex|listado|movimientos)\b/) && !hay(t, /^(abre|abrir|ir a|ve a|muestra|muestrame) (los |el )?(informes|reportes)$/)) {
    const vista: Vista = hay(t, /\bcompras?\b|\bpedir\b|\bcomprar\b|\bsugerid/)
      ? 'compras'
      : hay(t, /\bconsumo|\bgrafic|\bconsumid|\bgastad/)
        ? 'consumo'
        : hay(t, /\bmovimiento|\bentradas?\b|\bsalidas?\b|\bkardex\b|\bdespacho|\bentrega/)
          ? 'movimientos'
          : 'inventario';
    const quien = vista === 'movimientos' || vista === 'consumo';
    return {
      tipo: 'informe',
      vista,
      formato: hay(t, /\bexcel\b/) ? 'excel' : hay(t, /\b(pdf|descarga|descargar|descargame|imprim)/) ? 'pdf' : null,
      categoria,
      periodo,
      movimiento: vista === 'movimientos' ? (hay(t, /\bentradas\b/) ? 'ENTRADA' : hay(t, /\bsalidas\b/) ? 'SALIDA' : null) : null,
      funcionario: quien ? buscarEnLista(t, ctx.funcionarios)?.item ?? null : null,
      area: quien ? buscarEnLista(t, ctx.areas)?.item ?? null : null,
      cliente: quien ? buscarEnLista(t, ctx.clientes)?.item ?? null : null,
      estado: vista === 'inventario' ? (hay(t, /\bminimo|\balerta|\bagotad|\bbajo/) ? 'alerta' : hay(t, /\bcon existencia/) ? 'con' : '') : '',
    };
  }

  // Navegar entre pantallas
  const destino = destinoDe(t);
  const PALABRAS_PANTALLA = new Set(
    'inicio principal pagina tablero home conteo fisico canones canon despiece destroyer xhv capol equipos equipo instalados informes reportes etiquetas qr listas funcionarios areas clientes importar importacion usuarios administracion inventario entradas y salidas movimientos escanear de del'.split(' ')
  );
  const soloDestino = !!destino && destino.dicho.split(' ').every((w) => PALABRAS_PANTALLA.has(w)) && !hay(t, /^(destroyer|xhv|capol)$/);
  if (destino && (hay(t, /^(abre|abrir|abreme|ir a|ve a|vamos a|vete a|muestra|muestrame|mostrar|llevame a|entra a|entrar a|pasa a|pantalla|ir al|ve al|abre el|abre la)\b/) || soloDestino)) {
    return { tipo: 'navegar', ruta: destino.ruta, nombre: destino.nombre, modelo: destino.modelo };
  }

  // Consultas
  if (hay(t, /\b(hoja de vida|historial)\b|\bque (repuestos|piezas) (lleva|tiene|se le han|le han|han)\b|\ble han cambiado\b/)) {
    // Con cliente o equipo es la hoja de vida de un cañón instalado; si no, es una pregunta del catálogo
    const cliente = buscarEnLista(t, ctx.clientes)?.item ?? null;
    if (cliente || hay(t, /\b(equipo|instalad\w*|serial|hoja de vida|historial|le han cambiado|se le han)\b/))
      return { tipo: 'equipo', cliente, equipo: buscarEquipo(t, ctx, cliente) };
  }

  // Preguntas sobre los cañones y sus piezas (catálogo, funciones, datos técnicos)
  if (esPreguntaSaber(t)) return { tipo: 'saber', frase: t, candidatos: [] };
  if (hay(t, /\b(cuanto vale|cuanto valen|valor (total|del inventario|de la bodega|en bodega|del)|cuanta plata|cuanto dinero|cuanto hay en plata|cuanto suma)\b/))
    return { tipo: 'valor', categoria };
  if (hay(t, /\b(que|cuales|cuantos|hay|tenemos)\b.*\b(minimo|agotad\w*|bajo|por pedir|pedir|comprar)\b|\b(stock minimo|en el minimo|bajo el minimo|agotados?)\b/) && !hay(t, /\b(salida|entrada)\b/))
    return { tipo: 'minimo', agotados: hay(t, /\bagotad/), categoria };
  if (hay(t, /\b(entrego|entregaron|entregado|entregados|llevo|llevaron|despacho|despacharon|despachado|consumo|consumio|consumido|gasto|gastado|gastaron|salio|salieron|han sacado|se saco|sacaron)\b/)) {
    const f = buscarEnLista(t, ctx.funcionarios);
    const a = buscarEnLista(t, ctx.areas);
    const c = buscarEnLista(t, ctx.clientes);
    let resto = quitar(sinPeriodo, [...(f?.usadas ?? []), ...(a?.usadas ?? []), ...(c?.usadas ?? [])]);
    resto = resto.replace(/\b(que|se|le|les|entrego|entregaron|entregado|entregados|llevo|llevaron|despacho|despacharon|despachado|consumo|consumio|consumido|gasto|gastado|gastaron|salio|salieron|han|sacado|saco|sacaron|cuanto|cuantos|cuantas|area|funcionario|cliente|para|a)\b/g, ' ');
    if (categoria) resto = quitar(resto, palabrasDe(categoria));
    return {
      tipo: 'entregas',
      periodo,
      funcionario: f?.item ?? null,
      area: a?.item ?? null,
      cliente: c?.item ?? null,
      categoria,
      candidatos: buscarProductos(resto.replace(/\s+/g, ' ').trim(), ctx.productos),
    };
  }

  // Conteo físico: "pistón Destroyer 4", "conté 12 O-ring 261", "suma 2 pistones"
  const enConteo = ctx.ruta.startsWith('/conteo');
  const palabraConteo = hay(t, /\b(conte|conteo|contamos|contados?|cuento|contar)\b/);
  const sumar = hay(t, /\b(suma|sumar|sumale|agrega|agregar|agregale|otro|otros|otra|otras|mas)\b/);
  if ((enConteo || palabraConteo) && !hay(t, /\b(salida|entrada|cuanto|cuantos|cuantas|que|existencia)\b/)) {
    const conUno = numerosACifras(t0, true);
    const limpio = conUno.replace(/\b(conte|conteo|contamos|contados?|cuento|contar|hay|son|suma|sumar|sumale|agrega|agregar|agregale|otros?|otras?|mas|de|del|en total|total)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const { cantidad, resto } = separarCantidad(limpio, ctx, 'ultimo');
    const candidatos = buscarProductos(resto, ctx.productos);
    if (candidatos.length && (cantidad != null || sumar)) return { tipo: 'conteo', candidatos, cantidad, sumar };
  }

  // Entradas y salidas
  const clave = t.match(
    /\b(salida|salidas|sacar|saca|sacame|saque|despachar|despacha|despachale|entregar|entrega|entregale|entregue|dale a|darle|entrada|entradas|entrar|ingresar|ingresa|ingreso|ingresale|recibir|recibi|recibimos|llegaron|llego|compre|compramos|cargar|carga|cargale)\b/
  );
  if (clave) {
    const movimiento = /^(entrada|entradas|entrar|ingres|recib|llega|llego|compr|carg)/.test(clave[1]) ? 'ENTRADA' : 'SALIDA';
    let cola = numerosACifras(limpiarFrase(texto).slice(limpiarFrase(texto).indexOf(clave[1]) + clave[1].length), true);

    let costo: number | null = null;
    const c = cola.match(/\b(?:a|costo|costo unitario|precio|valor|valor unitario|valor de|por)\s+\$?\s*(\d+(?:\.\d+)?)\s*(?:pesos)?(?:\s+(?:cada uno|cada una|c u|c\/u|la unidad|por unidad|cada|unitario))?/);
    if (c && Number(c[1]) >= 50) {
      costo = Number(c[1]);
      cola = cola.replace(c[0], ' ');
    }
    let documento: string | null = null;
    const d = cola.match(/\b(factura|fac|remision|orden de compra|orden|oc|documento|vale|requisicion|pedido)\s+(?:numero |no |n )?([a-z0-9-]*\d[a-z0-9-]*)\b/);
    if (d) {
      const nombre = { fac: 'Factura', oc: 'OC', 'orden de compra': 'OC', orden: 'Orden' }[d[1]] ?? d[1][0].toUpperCase() + d[1].slice(1);
      documento = `${nombre} ${d[2].toUpperCase()}`;
      cola = cola.replace(d[0], ' ');
    }
    let ubicacion: ItemVoz | null = null;
    for (const u of ctx.ubicaciones) {
      const n = normalizar(u.nombre);
      if (n && ` ${cola} `.includes(` ${n} `)) {
        ubicacion = u;
        cola = cola.replace(n, ' ');
        break;
      }
    }
    let funcionario: ItemVoz | null = null;
    let area: ItemVoz | null = null;
    let cliente: ItemVoz | null = null;
    let equipo: EquipoVoz | null = null;
    if (movimiento === 'SALIDA') {
      const ce = buscarEnLista(cola, ctx.clientes);
      const fe = buscarEnLista(cola, ctx.funcionarios);
      const ae = buscarEnLista(cola, ctx.areas);
      cliente = ce?.item ?? null;
      funcionario = fe?.item ?? null;
      area = ae?.item ?? null;
      cola = quitar(cola, [...(ce?.usadas ?? []), ...(fe?.usadas ?? []), ...(ae?.usadas ?? [])]);
      if (cliente) {
        equipo = buscarEquipo(cola, ctx, cliente);
        cola = cola.replace(/\b(equipo|canon|serial|planta)\b( (destroyer|xhv|capol))?( serial)?( [a-z0-9-]*\d[a-z0-9-]*)?/g, ' ');
      }
    }
    cola = cola.replace(/\b(para|area|funcionario|cliente|al|a|del|de la|de|la|el|los|las|cada|uno|una|pesos)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const { cantidad, resto } = separarCantidad(cola, ctx, 'primero');
    let candidatos = buscarProductos(resto, ctx.productos);
    // Si es para un cañón de un cliente, se prefieren los repuestos de ese modelo
    if (equipo && candidatos.length > 1) {
      const delModelo = candidatos.filter((p) => normalizar(p.categoria ?? '').includes(normalizar(equipo!.modelo)));
      if (delModelo.length) candidatos = delModelo;
    }
    return {
      tipo: 'movimiento',
      movimiento,
      candidatos,
      cantidad,
      costo,
      documento,
      ubicacion,
      funcionario,
      area,
      cliente,
      equipo,
    };
  }

  // Existencia de un producto: "¿cuántos pistones Destroyer hay?", "existencia del 736"
  const candidatos = buscarProductos(sinPeriodo, ctx.productos);
  if (candidatos.length) return { tipo: 'existencia', candidatos };

  // Solo el nombre de una pantalla: "conteo", "cañones xhv"
  if (destino) return { tipo: 'navegar', ruta: destino.ruta, nombre: destino.nombre, modelo: destino.modelo };
  return { tipo: 'desconocido' };
}

function buscarEquipo(t: string, ctx: Contexto, cliente: ItemVoz | null): EquipoVoz | null {
  const lista = ctx.equipos.filter((e) => !cliente || String(e.cliente_id) === String(cliente.id));
  const modelo = modeloEn(t);
  const conSerial = lista.find((e) => e.serial && t.split(' ').some((w) => w.length >= 2 && compacto(e.serial!).endsWith(compacto(w)) && /\d/.test(w)));
  if (conSerial) return conSerial;
  const delModelo = lista.filter((e) => modelo && normalizar(e.modelo) === modelo);
  if (delModelo.length === 1) return delModelo[0];
  if (!modelo && lista.length === 1 && cliente) return lista[0];
  return null;
}

/* Pantalla a la que se quiere ir */
function destinoDe(t: string): { ruta: string; nombre: string; dicho: string; modelo?: Modelo } | null {
  const tabla: [RegExp, string, string][] = [
    [/\b(inicio|principal|pagina principal|tablero|home)\b/, '/', 'Inicio'],
    [/\b(conteo|conteo fisico|contar)\b/, '/conteo', 'Conteo físico'],
    [/\b(canones?|canon|despiece|destroyer|xhv|capol)\b/, '/canones', 'Cañones'],
    [/\b(equipos?|equipos instalados|instalados)\b/, '/equipos', 'Equipos instalados'],
    [/\b(informes?|reportes?)\b/, '/informes', 'Informes'],
    [/\b(etiquetas?|qr)\b/, '/etiquetas', 'Etiquetas QR'],
    [/\b(listas?|funcionarios|areas|clientes)\b/, '/listas', 'Listas'],
    [/\b(importar|importacion)\b/, '/importar', 'Importar'],
    [/\b(usuarios?)\b/, '/usuarios', 'Usuarios'],
    [/\b(administracion)\b/, '/admin', 'Administración'],
    [/\b(inventario|entradas|salidas|movimientos|escanear|registrar)\b/, '/escanear', 'Inventario'],
  ];
  for (const [r, ruta, nombre] of tabla) {
    const m = t.match(r);
    if (m) {
      const modelo = ruta === '/canones' ? modeloEn(t) : undefined;
      return { ruta, nombre, dicho: t.replace(/^(el|la|los|las|pantalla de|pantalla del|pantalla) /, ''), modelo };
    }
  }
  return null;
}

const SABER = new RegExp(
  [
    'como funciona', 'como trabaja', 'como dispara', 'funcionamiento', 'que es (el |la |un |una |los |las )', 'que son (los |las )',
    'para que (sirve|sirven|es|son)', 'que (funcion|hace|hacen)', 'funcion (de|del)', 'cuantas (piezas|partes)', 'cuantos (repuestos|componentes|items) (tiene|lleva|componen)',
    '(piezas|partes) (tiene|lleva)', 'componen', 'conforman', 'compone', 'conforma', 'nombra\\w*', 'enumera\\w*', 'cuales son las (piezas|partes)',
    'dime las (piezas|partes)', 'que (piezas|partes|repuestos) (tiene|lleva)', '(piezas|repuestos|partes) del (destroyer|xhv|capol)', '(le )?falta(n)? al (destroyer|xhv|capol)',
    'juego completo', 'juego de repuestos', 'kit', 'despiece completo', 'medidas', 'dimensiones', 'cuanto (pesa|mide)', 'peso', 'tiempo de (descarga|relleno|llenado|recarga)',
    'cuanto (se )?(demora|tarda)', 'volumen de aire', 'presion (de trabajo|optima|minima|maxima|recomendada|ideal|de operacion)', 'a que presion', 'que presion',
    'cuantos psi', 'fuerza de impacto', 'alcance', 'garantia', 'boquillas?', 'accesorios', 'contacto', 'contactos', 'asesor', 'vendedor', 'telefono de poliway',
    'clientes de poliway', 'referencias comerciales', 'antes de (desarmar|abrir|cambiar|hacer mantenimiento|destapar)', 'precauciones', 'normas de seguridad',
    '(hacer|hacerle|dar|darle|el) mantenimiento (a|al|del|de)', 'mantenimiento (del|de la|de los|al|a la|preventivo|recomendado)', 'como (se )?(le )?(hace|da) (el )?mantenimiento',
    'como se (cambia|cambian|revisa)', 'cada cuanto', 'se desgasta', 'informacion (de|del|sobre)', 'cuentame', 'explicame', 'hablame', 'en que canon', 'en cuales canones',
    'que canones', 'donde (va|van|se usa|se usan)', 'a que canon', 'pieza (numero )?\\d+', 'item \\d+', 'que tanques', 'de cuantos litros',
  ]
    .map((x) => `\\b${x}\\b`)
    .join('|')
);
export const esPreguntaSaber = (t: string) => SABER.test(t);

/* Elección de una lista de opciones: "el primero", "la 2", "el último" */
export function leerEleccion(texto: string, cuantas: number): number | null {
  const t = limpiarFrase(texto);
  const ord: Record<string, number> = { primero: 1, primera: 1, segundo: 2, segunda: 2, tercero: 3, tercera: 3, cuarto: 4, cuarta: 4, quinto: 5, quinta: 5, sexto: 6, sexta: 6 };
  const m = t.match(/^(?:el |la |opcion |numero |el numero |la opcion )?(\d+|uno|una|dos|tres|cuatro|cinco|seis|primero|primera|segundo|segunda|tercero|tercera|cuarto|cuarta|quinto|quinta|sexto|sexta|ultimo|ultima)$/);
  if (!m) return null;
  const w = m[1];
  const n = w === 'ultimo' || w === 'ultima' ? cuantas : ord[w] ?? Number(numerosACifras(w, true));
  return Number.isInteger(n) && n >= 1 && n <= cuantas ? n - 1 : null;
}
