// Blaster y las inspecciones de cañones: entiende la pregunta y arma la respuesta
// ("¿dónde están las tapas dañadas?", "¿cómo está el cañón A01-21?", "¿qué fallas hay en el Horno?").

import { normalizar, type EquipoVoz } from '@/lib/voz/interpretar';
import { GRUPOS_DETALLE, HALLAZGOS_DETALLE, HALLAZGOS_RONDA, PUNTOS_RONDA, type Resultado } from '@/lib/inspeccion';

export type ConsultaInspeccion = 'fallas' | 'canon' | 'repetidos' | 'sin' | 'ultima';
export interface OrdenInspeccion {
  tipo: 'inspeccion';
  consulta: ConsultaInspeccion;
  claves: string[]; // puntos o hallazgos (TAPA, FUGAS, PISTON…)
  palabra: string | null; // palabra para buscar también en las observaciones ("tapa")
  nombrePunto: string | null; // cómo se dice en la respuesta ("la tapa")
  ubicacion: string | null;
  equipos: number[]; // cañones nombrados por su código
}

const hay = (t: string, r: RegExp) => r.test(t);

// Palabras de la pregunta → puntos del check-list y hallazgos
const PUNTOS: { r: RegExp; claves: string[]; palabra: string; nombre: string }[] = [
  { r: /\bvalvulas? de seguridad\b/, claves: ['VALVULA_SEG', 'C4'], palabra: 'seguridad', nombre: 'la válvula de seguridad' },
  { r: /\btapas?\b/, claves: ['TAPA'], palabra: 'tapa', nombre: 'la tapa' },
  { r: /\bmanometros?\b/, claves: ['MANOMETRO', 'C5'], palabra: 'manometro', nombre: 'el manómetro' },
  { r: /\btanques?\b/, claves: ['TANQUE', 'C1'], palabra: 'tanque', nombre: 'el tanque' },
  { r: /\bfugas?\b|\bfugan\b/, claves: ['FUGAS', 'B6'], palabra: 'fuga', nombre: 'fugas' },
  { r: /\bguayas?\b|\bcable de seguridad\b/, claves: ['GUAYA', 'C8'], palabra: 'guaya', nombre: 'la guaya' },
  { r: /\bsilenciador\w*/, claves: ['SILENCIADORES', 'SILENCIADOR', 'C7'], palabra: 'silenciador', nombre: 'los silenciadores' },
  { r: /\bbobinas?\b/, claves: ['BOBINA', 'A4'], palabra: 'bobina', nombre: 'la bobina' },
  { r: /\bsolenoides?\b/, claves: ['SOLENOIDE', 'BOBINA', 'A2', 'B2'], palabra: 'solenoide', nombre: 'el solenoide' },
  { r: /\btornillos?\b/, claves: ['TORNILLOS', 'C2'], palabra: 'tornillo', nombre: 'los tornillos' },
  { r: /\bplc\b|\bsenal\b/, claves: ['PLC', 'A5', 'DISPARO_AUTO'], palabra: 'plc', nombre: 'la señal del PLC' },
  { r: /\bdisparos?\b|\bdispara\b/, claves: ['DISPARO_MEC', 'DISPARO_AUTO', 'DISPARO_DEBIL', 'A1', 'B5'], palabra: 'dispar', nombre: 'el disparo' },
  { r: /\bpistone?s?\b/, claves: ['PISTON'], palabra: 'piston', nombre: 'el pistón' },
  { r: /\bsellos?\b|\bempaques?\b|\bo ?rings?\b/, claves: ['SELLOS'], palabra: 'sello', nombre: 'los sellos' },
  { r: /\bvalvulas?\b/, claves: ['VALVULA'], palabra: 'valvula', nombre: 'la válvula' },
  { r: /\bexterior\b|\bcorrosion\b|\boxid\w*/, claves: ['EXTERIOR', 'C1'], palabra: 'corrosion', nombre: 'el exterior' },
  { r: /\bpresion\b/, claves: ['PRESION', 'B1', 'B3'], palabra: 'presion', nombre: 'la presión' },
  { r: /\bllenado\b/, claves: ['LLENADO', 'B4'], palabra: 'llenado', nombre: 'el tiempo de llenado' },
];

const FALLA = /\b(danad\w*|dano|falla\w*|fallan|malo|mala|malos|malas|mal estado|averiad\w*|rot[oa]s?|fugas?|fugan|problemas?|novedad\w*|cambiar|cambio|reemplaz\w*|hallazgos?)\b/;
const INSPECCION = /\b(inspecci\w*|ronda|revisad\w*|revision|check ?list|chequeo)\b/;

const partesUbicacion = (u: string) =>
  normalizar(u)
    .split(/\s*,\s*|\s+y\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 4);

/** ¿La frase es una pregunta sobre las inspecciones? Devuelve la orden o null. */
export function interpretarInspeccion(t: string, equipos: EquipoVoz[]): OrdenInspeccion | null {
  const conEspacios = ` ${t} `;
  // Cañones nombrados por su código ("a01 21", "tw512 04")
  const nombrados = equipos.filter((e) => {
    const s = normalizar(e.serial ?? '').replace(/\s+/g, ' ').trim();
    const base = s.replace(/\s+\(.*$/, '').trim();
    return (base.length >= 2 && conEspacios.includes(` ${base} `)) || (s.length >= 2 && conEspacios.includes(` ${s} `));
  });
  // Ubicación ("en el horno", "tolva 512")
  const plantas = [...new Set(equipos.map((e) => e.planta).filter(Boolean) as string[])];
  const ubicacion = plantas.find((p) => partesUbicacion(p).some((x) => conEspacios.includes(` ${x} `))) ?? null;
  const punto = PUNTOS.find((p) => hay(t, p.r)) ?? null;

  const preguntaInspeccion = hay(t, INSPECCION);
  const preguntaFalla = hay(t, FALLA);
  // Las preguntas de "cómo se arregla" o "por qué falla" las responde el catálogo
  if (hay(t, /\b(por que|como (se )?(arregla|repara|soluciona|cambia)|que hago|que hacer|para que sirve)\b/)) return null;

  const base = { tipo: 'inspeccion' as const, claves: punto?.claves ?? [], palabra: punto?.palabra ?? null, nombrePunto: punto?.nombre ?? null, ubicacion, equipos: nombrados.map((e) => e.id) };

  if (hay(t, /\b(sin inspeccionar|no se han (inspeccionado|revisado)|no han sido (inspeccionados|revisados)|faltan por (inspeccionar|revisar)|pendientes? de (inspeccion|revision)|no se revisaron)\b/))
    return { ...base, consulta: 'sin' };
  if (hay(t, /\b(fallan (seguido|mucho|siempre|repetid\w*)|siempre fallan|mas fallan|fallas repetidas|repiten|se repite\w*|reincid\w*)\b/)) return { ...base, consulta: 'repetidos' };
  if (nombrados.length && (preguntaFalla || preguntaInspeccion || hay(t, /\b(como esta|estado|repuestos?|hoja de vida|historial|ultima)\b/)))
    return { ...base, consulta: 'canon' };
  if (hay(t, /\b(ultima|ultimo) (ronda|inspeccion|revision)\b|\bcomo (fue|salio|quedo) la (ronda|inspeccion)\b/) && !punto) return { ...base, consulta: 'ultima' };
  if (preguntaFalla && (punto || ubicacion || hay(t, /\b(canones|canon|donde|en que (parte|seccion|ubicacion|lugar|zona)|cuales|cuantos)\b/) || preguntaInspeccion))
    return { ...base, consulta: 'fallas' };
  if (preguntaInspeccion && (ubicacion || punto)) return { ...base, consulta: 'fallas' };
  return null;
}

/* ------------------------------ Respuesta ------------------------------ */

export interface FilaInsp {
  inspeccion_id: number;
  equipo_id: number;
  resultados: Record<string, Resultado>;
  hallazgos: string[];
  observacion: string | null;
}
export interface InspVoz {
  id: number;
  tipo: 'RONDA' | 'DETALLE';
  fecha: string;
  inspeccion_equipos: FilaInsp[];
}
export interface EquipoInsp {
  id: number;
  serial: string | null;
  modelo: string;
  planta: string | null;
}
export interface RespuestaInsp {
  texto: string;
  voz: string;
  ok: boolean;
  lista?: string[];
  tabla?: { columnas: string[]; filas: string[][] };
  titulo: string;
}

const NOMBRE: Record<string, string> = Object.fromEntries([
  ...GRUPOS_DETALLE.flatMap((g) => g.tareas.map((t) => [t.id, t.tarea])),
  ...HALLAZGOS_DETALLE.map((h) => [h.id, h.texto]),
  ...HALLAZGOS_RONDA.map((h) => [h.id, h.texto]),
  ...PUNTOS_RONDA.map((p) => [p.id, p.texto]),
]);
const fechaCorta = (f: string) => new Date(`${f.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
const ubic = (e?: EquipoInsp) => e?.planta?.trim() || 'sin ubicación';
// Lo que falló en un registro: puntos en falla y hallazgos
const fallasDe = (f: FilaInsp) => [
  ...Object.entries(f.resultados ?? {})
    .filter(([, v]) => v === 'FALLA')
    .map(([k]) => k),
  ...(f.hallazgos ?? []),
];
const conFalla = (f: FilaInsp) => fallasDe(f).length > 0;
const decirLista = (xs: string[], max = 5) => (xs.length <= max ? unir(xs) : `${xs.slice(0, max).join(', ')} y ${xs.length - max} más`);
const unir = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);
// Los códigos se leen mejor separados ("A01-21" → "A 01 21")
const paraVoz = (s: string) => s.replace(/\s*\(.*?\)/g, '').replace(/-/g, ' ');

/** Último registro de cada cañón (estado actual según la inspección más reciente). */
function ultimoPorEquipo(insps: InspVoz[]) {
  const m = new Map<number, { fila: FilaInsp; insp: InspVoz }>();
  [...insps]
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
    .forEach((i) => i.inspeccion_equipos.forEach((f) => !m.has(f.equipo_id) && m.set(f.equipo_id, { fila: f, insp: i })));
  return m;
}

export function responderInspeccion(o: OrdenInspeccion, insps: InspVoz[], equipos: EquipoInsp[], repuestos: { equipo_id: number; producto: string; cantidad: number; fecha: string }[]): RespuestaInsp {
  const eq = new Map(equipos.map((e) => [e.id, e]));
  if (!insps.length)
    return { texto: 'Todavía no hay inspecciones registradas.', voz: 'Todavía no hay inspecciones registradas.', ok: true, titulo: 'Inspecciones' };
  const columnas = ['Cañón', 'Tipo', 'Ubicación', 'Falla', 'Observación', 'Fecha'];
  const filaTabla = (f: FilaInsp, i: InspVoz) => {
    const e = eq.get(f.equipo_id);
    return [e?.serial ?? `#${f.equipo_id}`, e?.modelo ?? '', ubic(e), fallasDe(f).map((k) => NOMBRE[k] ?? k).join(', '), f.observacion ?? '', fechaCorta(i.fecha)];
  };

  if (o.consulta === 'canon') {
    const lineas: string[] = [];
    const filas: string[][] = [];
    const voces: string[] = [];
    o.equipos.forEach((id) => {
      const e = eq.get(id);
      const registros = insps.flatMap((i) => i.inspeccion_equipos.filter((f) => f.equipo_id === id).map((f) => ({ f, i }))).sort((a, b) => b.i.fecha.localeCompare(a.i.fecha));
      const rep = repuestos.filter((r) => r.equipo_id === id);
      if (!registros.length) {
        lineas.push(`${e?.serial} (${ubic(e)}): sin inspecciones.`);
        voces.push(`El cañón ${paraVoz(e?.serial ?? '')} no tiene inspecciones.`);
      } else {
        const { f, i } = registros[0];
        const fl = fallasDe(f).map((k) => NOMBRE[k] ?? k);
        const veces = registros.filter((x) => conFalla(x.f)).length;
        lineas.push(
          `${e?.serial} · ${e?.modelo} · ${ubic(e)}. Última inspección ${fechaCorta(i.fecha)}: ${fl.length ? `falla en ${fl.join(', ')}` : 'sin fallas'}${f.observacion ? ` (${f.observacion})` : ''}. ${registros.length} inspecciones, ${veces} con falla.`
        );
        voces.push(
          `El cañón ${paraVoz(e?.serial ?? '')}, ${e?.modelo}, en ${ubic(e)}: en la última inspección, del ${fechaCorta(i.fecha)}, ${fl.length ? `tiene falla en ${unir(fl).toLowerCase()}` : 'estaba sin fallas'}${f.observacion ? `. Observación: ${f.observacion}` : ''}.`
        );
        registros.forEach((x) => filas.push(filaTabla(x.f, x.i)));
      }
      if (rep.length) {
        lineas.push(`Repuestos puestos: ${rep.map((r) => `${r.cantidad} ${r.producto} (${fechaCorta(r.fecha)})`).join('; ')}.`);
        voces.push(`Se le han puesto ${rep.length} repuestos; el último, ${rep[0].producto}, el ${fechaCorta(rep[0].fecha)}.`);
      }
    });
    return { texto: lineas.join(' '), voz: voces.join(' '), ok: true, lista: lineas.length > 1 ? lineas : undefined, tabla: filas.length ? { columnas, filas } : undefined, titulo: `Estado del cañón ${o.equipos.map((id) => eq.get(id)?.serial).join(', ')}` };
  }

  if (o.consulta === 'ultima') {
    const i = [...insps].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)[0];
    const fallas = i.inspeccion_equipos.filter(conFalla);
    const texto = `${i.tipo === 'RONDA' ? 'Ronda' : 'Inspección'} N.° ${i.id} del ${fechaCorta(i.fecha)}: ${i.inspeccion_equipos.length} cañones revisados, ${fallas.length} con falla.`;
    return {
      texto,
      voz: `${texto} ${fallas.length ? `Con falla: ${decirLista(fallas.map((f) => paraVoz(eq.get(f.equipo_id)?.serial ?? '')))}.` : ''}`,
      ok: true,
      lista: fallas.map((f) => filaTabla(f, i).slice(0, 5).filter(Boolean).join(' · ')),
      tabla: { columnas, filas: fallas.map((f) => filaTabla(f, i)) },
      titulo: `Última inspección (N.° ${i.id})`,
    };
  }

  if (o.consulta === 'repetidos') {
    const rondas = [...insps].filter((i) => i.tipo === 'RONDA').sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id).slice(0, 5);
    const n = new Map<number, number>();
    rondas.forEach((i) => i.inspeccion_equipos.filter(conFalla).forEach((f) => n.set(f.equipo_id, (n.get(f.equipo_id) ?? 0) + 1)));
    const lista = [...n.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]);
    if (!lista.length) {
      const t = `Ningún cañón ha fallado en más de una de las últimas ${rondas.length} rondas.`;
      return { texto: t, voz: t, ok: true, titulo: 'Fallas repetidas' };
    }
    const filas = lista.map(([id, c]) => {
      const e = eq.get(id);
      return [e?.serial ?? '', e?.modelo ?? '', ubic(e), `${c} de ${rondas.length} rondas`, '', ''];
    });
    return {
      texto: `${lista.length} ${lista.length === 1 ? 'cañón falla' : 'cañones fallan'} en varias de las últimas ${rondas.length} rondas:`,
      voz: `${lista.length === 1 ? 'Un cañón falla' : `${lista.length} cañones fallan`} seguido: ${decirLista(lista.map(([id]) => `${paraVoz(eq.get(id)?.serial ?? '')} en ${ubic(eq.get(id))}`))}. Conviene hacerles una inspección a fondo.`,
      ok: true,
      lista: filas.map((f) => `${f[0]} · ${f[2]}: ${f[3]}`),
      tabla: { columnas: ['Cañón', 'Tipo', 'Ubicación', 'Veces con falla', '', ''], filas },
      titulo: 'Cañones con fallas repetidas',
    };
  }

  if (o.consulta === 'sin') {
    const hace30 = new Date(Date.now() - 35 * 86400e3).toISOString().slice(0, 10);
    const vistos = new Set(insps.filter((i) => i.fecha >= hace30).flatMap((i) => i.inspeccion_equipos.map((f) => f.equipo_id)));
    const faltan = equipos.filter((e) => !vistos.has(e.id) && (!o.ubicacion || e.planta === o.ubicacion));
    const donde = o.ubicacion ? ` en ${o.ubicacion}` : '';
    if (!faltan.length) {
      const t = `Todos los cañones${donde} se han inspeccionado en el último mes.`;
      return { texto: t, voz: t, ok: true, titulo: 'Cañones sin inspeccionar' };
    }
    const porUb = new Map<string, string[]>();
    faltan.forEach((e) => porUb.set(ubic(e), [...(porUb.get(ubic(e)) ?? []), e.serial ?? '']));
    return {
      texto: `${faltan.length} cañones${donde} sin inspeccionar en el último mes:`,
      voz: `Hay ${faltan.length} cañones${donde} sin inspeccionar en el último mes: ${decirLista([...porUb].map(([u, l]) => `${l.length} en ${u}`))}.`,
      ok: true,
      lista: [...porUb].map(([u, l]) => `${u} (${l.length}): ${l.join(', ')}`),
      tabla: { columnas: ['Cañón', 'Tipo', 'Ubicación'], filas: faltan.map((e) => [e.serial ?? '', e.modelo, ubic(e)]) },
      titulo: 'Cañones sin inspeccionar',
    };
  }

  // Fallas actuales (según la última inspección de cada cañón), filtradas por punto y ubicación
  const actual = ultimoPorEquipo(insps);
  const coincide = (f: FilaInsp) => {
    if (!o.claves.length) return conFalla(f);
    const fl = fallasDe(f);
    if (o.claves.some((k) => fl.includes(k))) return true;
    // También cuenta si la observación lo menciona ("fuga por la tapa")
    return !!o.palabra && conFalla(f) && normalizar(f.observacion ?? '').includes(o.palabra);
  };
  const res = [...actual.values()].filter(({ fila }) => coincide(fila) && (!o.ubicacion || eq.get(fila.equipo_id)?.planta === o.ubicacion));
  res.sort((a, b) => ubic(eq.get(a.fila.equipo_id)).localeCompare(ubic(eq.get(b.fila.equipo_id))) || (eq.get(a.fila.equipo_id)?.serial ?? '').localeCompare(eq.get(b.fila.equipo_id)?.serial ?? '', 'es', { numeric: true }));
  const que = o.nombrePunto === 'fugas' ? 'con fugas' : o.nombrePunto ? `con falla en ${o.nombrePunto}` : 'con falla';
  const donde = o.ubicacion ? ` en ${o.ubicacion}` : '';
  if (!res.length) {
    const t = `No hay cañones ${que}${donde} en la última inspección de cada uno.`;
    return { texto: t, voz: t, ok: true, titulo: `Cañones ${que}${donde}` };
  }
  const porUb = new Map<string, string[]>();
  res.forEach(({ fila }) => {
    const e = eq.get(fila.equipo_id);
    porUb.set(ubic(e), [...(porUb.get(ubic(e)) ?? []), e?.serial ?? '']);
  });
  // Si ya se dijo la ubicación, solo se nombran los cañones
  const secciones = o.ubicacion
    ? res.map(({ fila }) => paraVoz(eq.get(fila.equipo_id)?.serial ?? ''))
    : [...porUb].map(([u, l]) => (l.length === 1 ? `${paraVoz(l[0])} en ${u}` : `${l.length} en ${u}: ${unir(l.map(paraVoz))}`));
  return {
    texto: `${res.length} ${res.length === 1 ? 'cañón' : 'cañones'} ${que}${donde}:`,
    voz: `${res.length === 1 ? 'Hay un cañón' : `Hay ${res.length} cañones`} ${que}${donde}. ${res.length === 1 ? 'Es el ' : ''}${decirLista(secciones, 4)}.`,
    ok: true,
    lista: res.map(({ fila, insp }) => {
      const f = filaTabla(fila, insp);
      return `${f[0]} · ${f[2]}: ${f[3]}${f[4] ? ` — ${f[4]}` : ''} (${f[5]})`;
    }),
    tabla: { columnas, filas: res.map(({ fila, insp }) => filaTabla(fila, insp)) },
    titulo: `Cañones ${que}${donde}`,
  };
}
