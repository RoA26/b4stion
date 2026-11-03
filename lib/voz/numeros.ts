// Convierte números dichos en palabras a cifras, como los entiende el asistente:
// "dos" -> 2, "doce y medio" -> 12.5, "media docena" -> 6, "350 mil" -> 350000,
// "tres mil quinientos" -> 3500, "dos millones y medio" -> 2500000, "3.500" -> 3500.

const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
  veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80,
  noventa: 90, cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600,
  setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
};

// "3.500" / "3,5" / "12" -> número (en Colombia el punto separa miles)
function cifra(t: string): number | null {
  if (!/^\d+([.,]\d+)*$/.test(t)) return null;
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
  if (/^\d{1,3}(,\d{3})+$/.test(t)) return Number(t.replace(/,/g, ''));
  return Number(t.replace(',', '.'));
}

const esPalabraNumero = (w: string) =>
  w in UNIDADES || cifra(w) != null || ['mil', 'millon', 'millones', 'y', 'medio', 'media', 'docena', 'docenas'].includes(w);

/* Lee un número que empieza en la palabra i. Devuelve el valor y cuántas palabras usó. */
export function leerNumeroEn(palabras: string[], i: number): { valor: number; usadas: number } | null {
  const w0 = palabras[i];
  if (w0 == null) return null;
  // "media docena", "una docena", "2 docenas"
  if ((w0 === 'media' || w0 === 'medio') && palabras[i + 1]?.startsWith('docena')) return { valor: 6, usadas: 2 };
  if (!(w0 in UNIDADES) && cifra(w0) == null) return null;

  let total = 0; // millones y miles ya cerrados
  let actual = 0; // lo que va antes de "mil" o "millones"
  let j = i;
  let usadas = 0;
  let hubo = false;
  while (j < palabras.length) {
    const w = palabras[j];
    const c = cifra(w);
    if (c != null) {
      if (hubo && actual !== 0 && !['mil', 'millon', 'millones'].includes(palabras[j + 1] ?? '')) break; // "2 3" son dos números
      actual += c;
    } else if (w in UNIDADES) {
      actual += UNIDADES[w];
    } else if (w === 'mil') {
      total += (actual || 1) * 1000;
      actual = 0;
    } else if (w === 'millon' || w === 'millones') {
      total = (total + (actual || 1)) * 1_000_000;
      actual = 0;
    } else if (w === 'y' && hubo) {
      const sig = palabras[j + 1];
      if (sig === 'medio' || sig === 'media') {
        // "dos millones y medio" = 2.500.000; "doce y medio" = 12,5
        if (total >= 1_000_000 && actual === 0) total += 500_000;
        else if (total >= 1000 && actual === 0) total += 500;
        else actual += 0.5;
        j += 2;
        usadas = j - i;
        continue;
      }
      if (sig && (sig in UNIDADES || cifra(sig) != null)) {
        j++;
        continue;
      }
      break;
    } else if (w.startsWith('docena') && hubo) {
      actual = (actual || 1) * 12;
    } else break;
    hubo = true;
    j++;
    usadas = j - i;
  }
  if (!hubo) return null;
  return { valor: Math.round((total + actual) * 1000) / 1000, usadas };
}

/* Reemplaza en el texto todos los números dichos en palabras por cifras.
   "una" y "un" solo se convierten cuando van antes de algo que se cuenta,
   para no cambiar frases como "una salida" en "1 salida". */
export function numerosACifras(texto: string, convertirUno = true): string {
  const p = texto.split(' ').filter(Boolean);
  const fuera: string[] = [];
  for (let i = 0; i < p.length; ) {
    const w = p[i];
    if ((w === 'un' || w === 'una') && !convertirUno) {
      fuera.push(w);
      i++;
      continue;
    }
    const n = esPalabraNumero(w) ? leerNumeroEn(p, i) : null;
    if (n && n.usadas > 0) {
      fuera.push(String(n.valor));
      i += n.usadas;
    } else {
      fuera.push(w);
      i++;
    }
  }
  return fuera.join(' ');
}
