// "95.000" o "95000" o "95000,50" o "$ 12.000" -> número (formato colombiano o normal)
export function leerMonto(texto: string | number | null | undefined): number {
  if (typeof texto === 'number') return texto;
  const t = String(texto ?? '').trim().replace(/\s|\$/g, '');
  if (!t) return NaN;
  // Con punto y coma a la vez, el que va de último es el decimal: 1.234,56 o 1,234.56
  if (t.includes(',') && t.includes('.')) {
    return t.lastIndexOf(',') > t.lastIndexOf('.')
      ? Number(t.replace(/\./g, '').replace(',', '.'))
      : Number(t.replace(/,/g, ''));
  }
  if (t.includes(',')) {
    if (/^-?\d{1,3}(,\d{3})+$/.test(t)) return Number(t.replace(/,/g, '')); // 185,000
    return Number(t.replace(',', '.')); // 12,5
  }
  if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, '')); // 185.000
  return Number(t);
}

export const UNIDADES: Record<string, string> = { UND: 'und', M: 'm', M2: 'm²', KG: 'kg', ROLLO: 'rollos', JUEGO: 'juegos' };
export const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
export const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
