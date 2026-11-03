// "¿Quiso decir…?": cuando Blaster no entiende, busca la pregunta conocida
// que más se parece por sus palabras clave y la ofrece para responder "sí".

const SUGERENCIAS: { frase: string; claves: string[] }[] = [
  { frase: '¿Qué está en el mínimo?', claves: ['minim', 'falt', 'repon', 'pedir', 'compr', 'acab', 'agot', 'escas', 'poco', 'surt', 'abast', 'stock', 'bajo', 'necesit'] },
  { frase: '¿Qué movimientos hubo hoy?', claves: ['movi', 'almac', 'bodeg', 'hoy', 'pasad', 'paso', 'hubo', 'dia'] },
  { frase: '¿Cuáles son los últimos artículos que han salido?', claves: ['ultim', 'salid', 'salie', 'despach', 'entreg', 'sacar', 'saco'] },
  { frase: '¿Qué entró esta semana?', claves: ['entr', 'lleg', 'recib', 'ingres', 'compra'] },
  { frase: '¿Quién pide más?', claves: ['quien', 'pide', 'pidi', 'person', 'funcion', 'gente', 'tecnic'] },
  { frase: '¿Qué es lo que más sale?', claves: ['mas', 'rotac', 'usa', 'gasta', 'consum', 'popular', 'vend'] },
  { frase: '¿Quién nos ha prestado?', claves: ['prest', 'deb', 'devol', 'devuel', 'fiad', 'empres'] },
  { frase: '¿Qué préstamos están vencidos?', claves: ['vencid', 'atras', 'venc'] },
  { frase: '¿Qué viene en camino?', claves: ['brasil', 'camin', 'transit', 'import', 'aduan', 'llega', 'conten', 'barco', 'pedido', 'nacional'] },
  { frase: '¿Qué alertas hay?', claves: ['alert', 'aviso', 'pendien', 'urgent', 'problem', 'novedad'] },
  { frase: '¿Qué cañones tienen fallas?', claves: ['falla', 'dan', 'malo', 'mala', 'canon', 'fuga', 'tapa', 'roto', 'averi', 'revis'] },
  { frase: '¿Cómo fue la última ronda?', claves: ['ronda', 'inspec', 'chequeo', 'check'] },
  { frase: '¿Cuáles cañones no se han inspeccionado?', claves: ['inspeccion', 'revisad', 'sin revis', 'falta revis'] },
  { frase: '¿Cuánto vale el inventario?', claves: ['vale', 'valor', 'plata', 'diner', 'cost', 'precio', 'cuest', 'pesos'] },
  { frase: 'Abre conteo', claves: ['conteo', 'contar', 'fisic'] },
  { frase: 'Abre informes', claves: ['inform', 'report', 'pdf', 'excel'] },
  { frase: '¿Cómo se arma el Capol?', claves: ['arma', 'ensambl', 'mont', 'paso a paso'] },
  { frase: '¿Cuántas piezas tiene el Destroyer?', claves: ['pieza', 'parte', 'despiece', 'compon'] },
  { frase: 'Abre equipos instalados', claves: ['equipo', 'instalad', 'cliente', 'planta'] },
  { frase: 'ayuda', claves: ['ayud', 'puedes', 'sabes', 'entiend', 'funcion'] },
];

export function sugerir(t: string, max = 3): string[] {
  const palabras = t.split(' ').filter((w) => w.length > 2);
  const puntos = SUGERENCIAS.map((s) => ({
    frase: s.frase,
    n: s.claves.filter((c) => (c.includes(' ') ? t.includes(c) : palabras.some((w) => w.startsWith(c)))).length,
  }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  return puntos.slice(0, max).map((x) => x.frase);
}
