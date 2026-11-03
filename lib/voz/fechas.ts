// Períodos dichos en palabras -> rango de fechas (hora de Colombia).
// Entiende: hoy, ayer, esta semana, la semana pasada, este mes, el mes pasado,
// este año, "de octubre", "octubre de 2026", "los últimos 15 días".

export interface Periodo {
  desde: string; // AAAA-MM-DD
  hasta: string;
  texto: string; // para decirlo en la respuesta
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Fecha de hoy en Colombia (el computador puede tener otra zona horaria)
export function hoyColombia(): Date {
  const t = new Date(Date.now() - 5 * 3600e3);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dias = (d: Date, n: number) => new Date(d.getTime() + n * 86400e3);

export function leerPeriodo(t: string): Periodo | null {
  const hoy = hoyColombia();
  const anio = hoy.getUTCFullYear();
  const mes = hoy.getUTCMonth();

  if (/\bhoy\b/.test(t)) return { desde: iso(hoy), hasta: iso(hoy), texto: 'hoy' };
  if (/\bantier\b|\banteayer\b/.test(t)) return { desde: iso(dias(hoy, -2)), hasta: iso(dias(hoy, -2)), texto: 'antier' };
  if (/\bayer\b/.test(t)) return { desde: iso(dias(hoy, -1)), hasta: iso(dias(hoy, -1)), texto: 'ayer' };

  const ultimos = t.match(/\bultim[oa]s (\d+) (dias|semanas|meses)\b/);
  if (ultimos) {
    const n = Number(ultimos[1]) * (ultimos[2] === 'semanas' ? 7 : ultimos[2] === 'meses' ? 30 : 1);
    return { desde: iso(dias(hoy, -n + 1)), hasta: iso(hoy), texto: `los últimos ${ultimos[1]} ${ultimos[2]}` };
  }

  const lunes = dias(hoy, -((hoy.getUTCDay() + 6) % 7));
  if (/\bsemana pasada\b|\bpasada semana\b/.test(t)) return { desde: iso(dias(lunes, -7)), hasta: iso(dias(lunes, -1)), texto: 'la semana pasada' };
  if (/\b(esta|la) semana\b/.test(t)) return { desde: iso(lunes), hasta: iso(hoy), texto: 'esta semana' };

  if (/\bmes pasado\b|\bpasado mes\b/.test(t)) {
    const d = new Date(Date.UTC(anio, mes - 1, 1));
    return { desde: iso(d), hasta: iso(new Date(Date.UTC(anio, mes, 0))), texto: `el mes pasado (${MESES[d.getUTCMonth()]})` };
  }
  if (/\b(este|el) mes\b|\beste mes\b/.test(t)) return { desde: iso(new Date(Date.UTC(anio, mes, 1))), hasta: iso(hoy), texto: 'este mes' };
  if (/\b(este|el) ano\b|\bano pasado\b/.test(t)) {
    if (/ano pasado/.test(t)) return { desde: `${anio - 1}-01-01`, hasta: `${anio - 1}-12-31`, texto: `el año ${anio - 1}` };
    return { desde: `${anio}-01-01`, hasta: iso(hoy), texto: 'este año' };
  }

  // "de octubre", "en septiembre", "octubre de 2025"
  for (let m = 0; m < 12; m++) {
    const r = new RegExp(`\\b${MESES[m]}(?: (?:de|del) (\\d{4}))?\\b`);
    const x = t.match(r);
    if (!x) continue;
    // Si el mes todavía no ha llegado este año, es del año pasado
    const a = x[1] ? Number(x[1]) : m > mes ? anio - 1 : anio;
    const fin = new Date(Date.UTC(a, m + 1, 0));
    return {
      desde: `${a}-${String(m + 1).padStart(2, '0')}-01`,
      hasta: iso(fin > hoy ? hoy : fin),
      texto: `${MESES[m]}${a !== anio ? ` de ${a}` : ''}`,
    };
  }
  return null;
}

export function periodoEsteMes(): Periodo {
  const hoy = hoyColombia();
  return { desde: iso(new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1))), hasta: iso(hoy), texto: 'este mes' };
}

// Quita del texto las palabras de período, para que no confundan la búsqueda del producto
export function quitarPeriodo(t: string): string {
  return t
    .replace(/\b(de |en |durante |del? )?(hoy|ayer|antier|anteayer)\b/g, ' ')
    .replace(/\b(de |en |durante )?(los )?ultim[oa]s \d+ (dias|semanas|meses)\b/g, ' ')
    .replace(/\b(de |en |durante )?(la |esta )?(semana pasada|pasada semana|esta semana|la semana)\b/g, ' ')
    .replace(/\b(de |en |durante |del )?(el |este )?(mes pasado|pasado mes|este mes|el mes)\b/g, ' ')
    .replace(/\b(de |en |durante |del )?(el |este )?(este ano|el ano|ano pasado)\b/g, ' ')
    .replace(new RegExp(`\\b(de |en |durante |del )?(${MESES.join('|')})( (de|del) \\d{4})?\\b`, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
