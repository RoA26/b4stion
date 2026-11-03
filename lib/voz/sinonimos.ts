// Diccionario de sinónimos de Blaster: muchas formas de decir lo mismo se
// convierten en la forma que el intérprete ya entiende. El texto llega
// normalizado (sin tildes, en minúscula, sin signos).

const REGLAS: [RegExp, string][] = [
  // Palabras para "productos": mercancía, material, insumos, artículos…
  [/\b(la |las |los |el )?(mercancias?|mercaderias?|materiales|insumos|existencias de bodega)\b/g, ' productos '],

  // Lo que hay que reponer / comprar → "en el minimo"
  [
    /\b(que|cual|cuales|cuantos|cuantas)?\s*(productos )?(nos )?(falta|faltan|hace falta|hacen falta|toca|tocaria|hay que|habria que|debemos|tenemos que|necesitamos|se necesita|se necesitan|conviene|esta pendiente|estan pendientes)\s*(por |de |para )?(reponer|surtir|resurtir|abastecer|reabastecer|comprar|pedir|reponerse|traer|encargar|ordenar)\b/g,
    ' que esta en el minimo ',
  ],
  [/\b(reposicion|reabastecimiento|resurtido|por reponer|para reponer|reponer|surtir|resurtir|reabastecer|abastecer)\b/g, ' en el minimo '],
  [/\b(se (esta|estan|va|van) (acabando|agotando|terminando|a acabar|a agotar|a terminar))\b/g, ' en el minimo '],
  [/\b(queda|quedan|hay) (muy )?(poco|pocos|pocas|poquito|poquitos|bajito)\b/g, ' en el minimo '],
  [/\b(escase\w*|escas[oa]s?|por debajo del minimo|debajo del minimo|bajo de (stock|inventario|existencia)|poca existencia|casi agotad\w*|en rojo|stock bajo|inventario bajo|existencia baja)\b/g, ' en el minimo '],
  // Lo que se acabó → "agotados"
  [/\b(que|cuales)( productos)? se (acabo|acabaron|agoto|agotaron|termino|terminaron)\b/g, ' que productos estan agotados '],
  [/\b(sin existencia|sin stock|en cero|existencia cero|ya no hay nada)\b/g, ' agotados '],

  // Pedidos a Brasil
  [/\b(contenedor(es)?|embarques?|el barco|en el barco|por barco|en el mar|la importacion|importaciones|lo importado|lo de brasil|mercancia de brasil|productos de brasil|desde brasil)\b/g, ' transito '],

  // Préstamos
  [/\b(fiad[oa]s?|nos fiaron|le fiamos|les fiamos)\b/g, ' prestado '],
];

export function aplicarSinonimos(t: string): string {
  let r = ` ${t} `;
  for (const [re, por] of REGLAS) r = r.replace(re, por);
  return r.replace(/\s+/g, ' ').trim();
}
