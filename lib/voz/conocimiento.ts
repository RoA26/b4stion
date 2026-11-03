// =====================================================================
//  BASE DE CONOCIMIENTO DEL ASISTENTE BLASTER
//  Todo lo que el asistente "sabe" de los cañones y sus repuestos.
//  Para agregar o corregir información, se edita este archivo.
//
//  Fuentes:
//   - CATÁLOGO: Catálogo de cañones de aire y accesorios Blaster by Poliway
//     (modelos, piezas, códigos, medidas, presiones, tiempos, garantía, contactos).
//   - GENERAL: descripción general de cómo trabajan los cañones de aire de
//     pistón. La función de cada pieza debe confirmarla ingeniería de Poliway.
// =====================================================================

export type ClaveCanon = 'destroyer' | 'xhv' | 'capol';

export const NOTA_GENERAL = 'Función descrita de forma general según cómo trabajan los cañones de aire de pistón; por confirmar con ingeniería de Poliway.';

/* ------------------------------ Generalidades ------------------------------ */

export const QUE_ES =
  'Un cañón de aire guarda aire comprimido en un tanque y lo suelta de golpe, en una fracción de segundo, por un tubo de descarga dentro del silo, la tolva o el ducto. ' +
  'Esa onda de choque despega el material pegado y evita atascos. Poliway los fabrica para cemento, minería e industria de alimentos.';

export const COMO_FUNCIONA = [
  'Llenado: el aire comprimido entra al tanque y a la cámara que queda detrás del pistón. El resorte y la presión mantienen el pistón cerrado contra su asiento.',
  'Disparo: el tablero activa la válvula solenoide. Esta abre la válvula de escape (o escape rápido), que vacía en un instante el aire que está detrás del pistón.',
  'Descarga: al quedar sin presión por detrás, el pistón retrocede de golpe y todo el aire del tanque sale por el asiento hacia el tubo de descarga y la boquilla.',
  'Cierre: el resorte devuelve el pistón a su asiento, el cañón se vuelve a llenar y queda listo para el siguiente disparo.',
];

export const DATOS_GENERALES = {
  material: 'aluminio estructural',
  fuerza: '5.500 N',
  presionOptima: '90 a 100 psi (unos 6,2 a 6,9 bar)',
  presionMinima: '60 psi (unos 4,1 bar)',
  alcance: 'según la gráfica del catálogo, el chorro tiene un alcance de impacto efectivo de 1,2 a 2,4 metros',
  compatibilidad: 'Los repuestos son 100 % compatibles con Martin.',
};

export const SEGURIDAD = [
  'Corte la energía de la válvula solenoide y bloquee el tablero (bloqueo y etiquetado).',
  'Cierre la entrada de aire comprimido al cañón.',
  'Vacíe por completo el tanque y confirme que el manómetro marque cero antes de aflojar cualquier pieza.',
  'Nunca se ubique frente a la salida de descarga ni meta las manos en el tubo.',
  'Si el cañón está en un horno o torre en operación, use la válvula de seguridad STD Safety 4" con candado: según el catálogo, permite hacer el mantenimiento con el horno funcionando.',
];

export const MANTENIMIENTO = [
  'Purgue el agua condensada del tanque con frecuencia: la humedad daña sellos y diafragmas.',
  'Use aire limpio y seco (filtro y secador en la línea de aire).',
  'Revise fugas: si sale aire continuamente por el escape o por la descarga, revise diafragmas, O-rings y la cara de uretano del pistón.',
  'Revise el manómetro: debe marcar entre 90 y 100 psi cuando el cañón está cargado.',
  'Cambie juntos los sellos (O-rings, empaques y diafragmas) en cada mantenimiento mayor.',
  'Revise el ajuste de tornillos y arandelas: la vibración de los disparos los afloja.',
];

export const GARANTIA =
  'Según el catálogo, los productos Poliway tienen garantía de 12 meses o 7.000 horas de uso (lo primero que ocurra) por defectos de fabricación. ' +
  'No cubre piezas reparadas o modificadas sin autorización, el mal uso, la mala instalación ni los repuestos que no sean originales. ' +
  'Las piezas no fabricadas por Poliway (motores, equipo eléctrico, etc.) tienen la garantía de su propio fabricante.';

export const CONTACTOS = [
  'Colombia, Ecuador y Venezuela: Manuel Osorio, ventas23@poliway.com.br, (+57) 313 507 0219.',
  'Planta de producción Colombia: Carrera 10 # 5-18, Bodega 31, Centro Industrial SENTEL, vía a la playa, Barranquilla. Teléfono +57 304 242 9063.',
  'Brasil: José Silva Junior, junior@poliway.com.br, (+55) 319 715 0737. Planta en Vespasiano, Minas Gerais.',
  'Guatemala, Honduras y El Salvador: Alberto López, ventas24@poliway.com.br, (+503) 7769 8730.',
  'Costa Rica y Nicaragua: BIPSA, Alejandro Herrera, ventas1@bipsacr.com, (+506) 8539 8864.',
  'Página web: poliway.com.br',
];

export const CLIENTES = [
  'Grupo Votorantim: venden para todas sus unidades.',
  'Grupo Cemex (México): 80 cañones en funcionamiento.',
  'InterCement: 187 cañones en funcionamiento.',
  'Cementos Nacional: 20 cañones.',
  'Cementos Supremo: 10 cañones.',
  'El 80 % de las unidades cementeras de Brasil.',
];

export const ACCESORIOS = [
  'Boquillas Thunder con sistema retráctil: para zonas de difícil acceso; se extienden hacia el fuego y se retraen para protegerse del calor. Limpian 4 lados, funcionan con todos los cañones (mejor con el de 150 L), las controla una solenoide de 110, 220 o 24 V, reemplazan la limpieza con CO2 y no dañan el refractario. Códigos: tubo de descarga Thunder retráctil 2CAR-TDD-YTR-4-AIFU (Martin 38984), soporte en Y de cambio rápido 2CAR-TDD-P-300-IFU, extensor 2CAR-TDD-EXT-300-IFU (Martin 38983-NW).',
  'Tubos de descarga con cambio rápido de boquillas: sistema en Y para cambiar tubos y boquillas en altas temperaturas. Tubos y bridas en acero al carbono, boquilla de 4" en acero fundido cromo-níquel.',
  'Sistema TR Poliway: cambio de boquilla sin romper el refractario y sin retirar el cañón. Soporte en Y 2CAR-TDD-YTR-24-AIFU (Martin 39183Y), tubo de 4" 2CAR-TDD-TR-24-AIFU (Martin 39184Y-NW), boquilla inoxidable de 4" 2CAR-TDD-P-12-IFU.',
  'Boquillas en acero inoxidable fundido cromo-níquel 25-20, para altas temperaturas: recta 2CAR-BDR-4-IFU (Martin 38366), tubular de 4" 2CAR-TDD-4-IFU, a 90° 2CAR-BD90-4-IFU (Martin 29953).',
  'Válvula de seguridad STD Safety 4" 2CAR-VSAF-4-A (Martin 38189-4F): con o sin brida, con seguro de candado; sirve para todos los modelos y permite el mantenimiento con el horno funcionando.',
];

/* ------------------------------ Cada cañón ------------------------------ */

export interface InfoCanon {
  nombre: string;
  descripcion: string;
  tanques?: string[];
  medidas?: string[];
  tiempos?: string[];
  volumen?: string[];
  sinDatos?: string;
}

export const INFO_CANONES: Record<ClaveCanon, InfoCanon> = {
  destroyer: {
    nombre: 'Destroyer',
    descripcion:
      'Cañón de aire con válvula Destroyer: más fuerza y mayor potencia de salida, ideal para altas temperaturas y de fácil instalación. Tiene válvula de escape con diafragma, silenciadores y palanca de disparo manual. Tanques de 35, 70, 100 y 150 litros. Repuestos 100 % compatibles con Martin.',
    tanques: ['35 L', '70 L', '100 L', '150 L'],
    medidas: [
      'Destroyer 35 L (2CAR-CADES-35-AAL): A 558 mm, B 436 mm, C 510 mm, peso 44 kg.',
      'Destroyer 70 L (2CAR-CADES-70-AAL): A 708 mm, B 584 mm, C 510 mm, peso 50 kg.',
      'Destroyer 150 L (2CAR-CADES-150-AAL): A 1.005 mm, B 881 mm, C 510 mm, peso 79 kg.',
      'El catálogo no trae las medidas ni el número de parte del Destroyer de 100 L.',
    ],
    tiempos: [
      '35 L: descarga en 0,20 segundos y se rellena en 17 segundos (a 100 psi).',
      '70 L: descarga en 0,25 s y se rellena en 33 s.',
      '100 L: descarga en 0,27 s y se rellena en 44 s.',
      '150 L: descarga en 0,35 s y se rellena en 61 s.',
    ],
    volumen: [
      'A 100 psi: el de 35 L suelta 273 litros de aire libre, el de 70 L 547 litros y el de 150 L 1.173 litros.',
      'A 90 psi: 250, 499 y 1.021 litros.',
      'A 80 psi: 225, 451 y 967 litros.',
      'A 60 psi: 177, 356 y 763 litros.',
    ],
  },
  xhv: {
    nombre: 'XHV',
    descripcion:
      'Cañón de aire con válvula XHV montada sobre el tanque. Trabaja con pistón con cara de uretano, resorte de compresión y cojinete de teflón. Se dispara con una válvula solenoide de 1/4" a 220 V que activa una válvula de escape rápido. Trae manómetro con glicerina y válvula de seguridad.',
    sinDatos: 'El catálogo no trae medidas, pesos ni tiempos del XHV. Lo único que se sabe, por el plano de ingeniería CAPOL-150-XHV de Poliway (17/04/2018, ingeniero José Silva Júnior), es que el tanque es de 150 litros y el material es acero. Si Poliway entrega más datos, se agregan.',
  },
  capol: {
    nombre: 'Capol',
    descripcion:
      'Cañón de aire Capol: usa la misma válvula de la familia XHV/Capol (tapa 387, resorte 428 y pistón 392), con asiento propio (377), válvula de escape rápido, solenoide de 110/220 V, manómetro y válvula de seguridad. La válvula se fija con tornillos y arandelas de 5/8".',
    sinDatos: 'El catálogo no trae medidas, pesos ni tiempos del Capol, ni el número de parte del tanque. Si Poliway los entrega, se agregan.',
  },
};

/* ------------------------------ Cada pieza ------------------------------ */

export interface InfoPieza {
  funcion: string;
  desgaste?: string; // cuándo revisarla o cambiarla
}

export const PIEZAS: Record<string, InfoPieza> = {
  // ---------------- Destroyer ----------------
  '2CAR-TPA-DES-AL': { funcion: 'Tapa principal de la válvula Destroyer, en aluminio. Cierra la parte de atrás de la válvula, forma la cámara detrás del pistón y sobre ella van la válvula de escape y los silenciadores.' },
  '2CAR-BU-DES-BRO': { funcion: 'Buje guía de bronce: dentro de él se desliza el émbolo de la válvula de escape, con poca fricción.', desgaste: 'Cámbielo si tiene juego o el émbolo se traba.' },
  '2CAR-MO-VED-A': { funcion: 'Resorte que devuelve la válvula de escape a su posición cerrada después de cada disparo.', desgaste: 'Cámbielo si está deformado o el cañón no recarga bien.' },
  '2CAR-PT-VED-AL': { funcion: 'Pistón pequeño de la válvula de escape: abre y cierra la salida del aire que está detrás del pistón principal. Cuando abre, el cañón dispara.' },
  '2CAR-DER-DES-PU': { funcion: 'Diafragma de poliuretano de la válvula de escape: es la membrana que sella el escape y reacciona a la señal de aire de la solenoide.', desgaste: 'Pieza de desgaste. Si sale aire todo el tiempo por el escape, o el cañón no carga o dispara solo, revise si está roto o endurecido.' },
  '2CAR-EV-VED-ALT': { funcion: 'Émbolo (vástago) de la válvula de escape: transmite el movimiento para abrirla. Se desliza dentro del cojinete de bronce.' },
  '5FIX-AR-P-1/4-AG': { funcion: 'Arandela de presión de 1/4": evita que los tornillos de 1/4" se aflojen con la vibración de los disparos.', desgaste: 'Cámbiela cada vez que desarme, si está aplastada.' },
  '5FIX-PF-SX-1/4X7/8-AG': { funcion: 'Tornillo galvanizado de 1/4" x 7/8" que fija piezas de la válvula de escape.' },
  '2CAR-ED-VED-AL': { funcion: 'Émbolo de disparo manual: al empujarlo con la palanca, abre la válvula de escape y dispara el cañón a mano, sin la solenoide (para pruebas).' },
  '5VE-AO-VED-2.86X1.03-BO': { funcion: 'Anillo O-ring que sella la tapa de la válvula de escape contra su cuerpo. Evita fugas de aire.', desgaste: 'Cámbielo en cada mantenimiento o si hay fuga.' },
  '2CAR-TER-DES-AL': { funcion: 'Tapa de la válvula de escape: la cierra y sostiene el mecanismo de disparo manual.' },
  '5VE-AO-VED-0.48X0.13-BO': { funcion: 'Anillo O-ring pequeño que sella alrededor del émbolo de la válvula de escape.', desgaste: 'Cámbielo en cada mantenimiento.' },
  '12CAR-EDVED-AL': { funcion: 'Palanca de disparo manual: permite disparar el cañón a mano para probarlo o si falla la solenoide. Úsela solo con el área despejada.' },
  '5FIX-PIL1/4X1.1/4': { funcion: 'Pin pasador: el eje sobre el que gira la palanca de disparo manual.' },
  '2CAR-PIS-VED-A': { funcion: 'Seguro del pasador: evita que el pin de la palanca se salga.' },
  '5FIX-PF-SX-1/4X1-AG': { funcion: 'Tornillo de 1/4" x 1" que fija la tapa de la válvula de escape.' },
  '2CAR-APD-DES-BO': { funcion: 'Amortiguador de caucho: recibe el golpe del pistón principal cuando retrocede al disparar. Protege la tapa y reduce el ruido.', desgaste: 'Pieza de desgaste: cámbielo si está agrietado o aplastado.' },
  '2CAR-AIM-DES-BO': { funcion: 'Anillo de impacto: asiento amortiguado donde se apoya el resorte del pistón.', desgaste: 'Revíselo junto con el amortiguador.' },
  '2CAR-MO-DES-BO': { funcion: 'Resorte del pistón principal: lo empuja contra el asiento para mantener el cañón cerrado mientras se llena, y lo regresa después de cada disparo.', desgaste: 'Cámbielo si perdió fuerza: el cañón fuga por la descarga o no carga.' },
  '2CAR-PT-DES-AL': { funcion: 'Pistón principal: es el corazón del cañón. Tapa la salida del tanque; al disparar retrocede de golpe y deja salir todo el aire.', desgaste: 'Revise la superficie de cierre: si está marcada, el cañón fuga.' },
  '5VE-AO-VED-6.73X0.09-BO': { funcion: 'Anillo O-ring grande que sella la tapa de la válvula Destroyer contra el cuerpo.', desgaste: 'Cámbielo cada vez que abra la válvula.' },
  '2CAR-SED-DES-AL': { funcion: 'Asiento del pistón: la pieza donde cierra el pistón y por donde sale el aire hacia el tubo de descarga. Une la válvula con el tanque.' },
  '2CAR-ABAF-DES-AL': { funcion: 'Silenciador: reduce el ruido del aire que sale por el escape en cada disparo.', desgaste: 'Límpielo si se tapa; un silenciador tapado hace que el cañón dispare débil.' },
  '5FE-TP-SX-3/8-G': { funcion: 'Fijador de 3/8" que asegura la tapa de la válvula.' },
  '5VE-AO-VED-4.5X0.27-BO': { funcion: 'Anillo O-ring que sella la unión entre el asiento y el tubo de descarga.', desgaste: 'Cámbielo cuando desmonte el asiento.' },
  '5VE-AO-VED-7.48X0.1-BO': { funcion: 'Anillo O-ring que sella el asiento del pistón contra el cuerpo de la válvula.', desgaste: 'Cámbielo cuando desmonte el asiento.' },
  // ---------------- XHV ----------------
  '4926': { funcion: 'Tanque (vaso) XHV de 150 litros, según el plano de ingeniería: recipiente a presión que guarda el aire comprimido que se suelta en cada disparo.', desgaste: 'Purgue el agua condensada con frecuencia y revise corrosión y golpes.' },
  '397': { funcion: 'Cuerpo de la válvula XHV: la carcasa que contiene el pistón, el resorte y el cojinete. Va montada sobre el tanque.' },
  '387': { funcion: 'Tapa de la válvula (sirve para XHV y Capol): cierra la parte de atrás del cuerpo y forma la cámara de aire detrás del pistón.' },
  '428': { funcion: 'Resorte de compresión (XHV y Capol): mantiene el pistón cerrado contra el asiento y lo regresa después del disparo.', desgaste: 'Cámbielo si perdió fuerza o está deformado.' },
  '392': { funcion: 'Pistón con cara de uretano (XHV y Capol): sella la salida contra el asiento; al disparar retrocede y libera todo el aire del tanque.', desgaste: 'Pieza de desgaste: si la cara de uretano está marcada o rota, el cañón fuga por la descarga.' },
  '546': { funcion: 'Cojinete GU TFL de 165 x 170 x 75 mm: buje de baja fricción (teflón) que guía el pistón dentro del cuerpo de la válvula.', desgaste: 'Cámbielo si el pistón queda con juego o se traba.' },
  '388': { funcion: 'Asiento del pistón XHV: anillo donde cierra el pistón y por donde sale el aire hacia la descarga.', desgaste: 'Revise que la superficie de cierre esté lisa.' },
  '4961': { funcion: 'Cuerpo de la válvula de escape rápido: con la señal de la solenoide, vacía en un instante el aire de detrás del pistón para que el cañón dispare.' },
  '4960': { funcion: 'Tapa de la válvula de escape rápido.' },
  '391': { funcion: 'Diafragma de la válvula de escape rápido: la membrana que abre y cierra el escape.', desgaste: 'Pieza de desgaste: si el cañón no carga o fuga por el escape, revíselo.' },
  '395': { funcion: 'Anillo O-ring 6708: sello del conjunto de la válvula.', desgaste: 'Cámbielo en cada mantenimiento.' },
  '4943': { funcion: 'Empaque entre la válvula y el tanque: evita fugas en esa unión.', desgaste: 'Cámbielo cada vez que separe la válvula del tanque.' },
  '393': { funcion: 'Anillo O-ring 261: sello de la tapa de la válvula.', desgaste: 'Cámbielo en cada mantenimiento.' },
  '438': { funcion: 'Flange (brida) de salida: une la salida de la válvula con el tubo de descarga que va al silo o ducto.' },
  '514': { funcion: 'Válvula solenoide de 1/4" a 220 V: es el "gatillo". Recibe la señal eléctrica del tablero o temporizador y deja pasar el aire que activa la válvula de escape rápido.', desgaste: 'Si el cañón no dispara, revise primero la señal eléctrica y la bobina.' },
  '516': { funcion: 'Manómetro de 1/4" con glicerina, de 0 a 14 bar (XHV y Capol): muestra la presión del tanque. La glicerina amortigua la vibración de los disparos.', desgaste: 'Con el cañón cargado debe marcar entre 90 y 100 psi (unos 6,2 a 6,9 bar).' },
  '390': { funcion: 'Válvula de seguridad de 1/2" para XHV y Capol: protege el tanque liberando aire si la presión pasa de su ajuste. Según el plano de ingeniería de Poliway es de 11 kgf/cm² (unos 156 psi); el catálogo dice 1 kgf/cm², que parece un error de digitación.', desgaste: 'Nunca la bloquee ni la retire.' },
  '5060': { funcion: 'Niple: conexión roscada corta entre accesorios de aire, como la solenoide y la válvula de escape.' },
  // ---------------- Capol ----------------
  '377': { funcion: 'Asiento del pistón del Capol: donde cierra el pistón y por donde sale el aire hacia la descarga.', desgaste: 'Revise que la superficie de cierre esté lisa.' },
  '736': { funcion: 'Tornillo galvanizado de 5/8" x 2 1/2": fija la válvula del Capol.', desgaste: 'Revise el apriete en cada mantenimiento.' },
  '557': { funcion: 'Arandela de presión de 5/8": evita que los tornillos de 5/8" se aflojen con la vibración.', desgaste: 'Cámbiela si está aplastada.' },
  '608': { funcion: 'Arandela galvanizada (plana) de 5/8": reparte la fuerza del tornillo y protege la superficie.' },
  '389': { funcion: 'Válvula de escape rápido del Capol: con la señal de la solenoide, vacía el aire de detrás del pistón para que el cañón dispare.' },
  '4196': { funcion: 'Válvula solenoide de 1/4" de 110/220 V del Capol: el "gatillo" que recibe la señal eléctrica y activa la válvula de escape rápido.', desgaste: 'Si el cañón no dispara, revise primero la señal eléctrica y la bobina.' },
};

/* ------------------------------ Modo armado ------------------------------ */
// Orden en que se arma cada cañón, paso a paso (número de ítem del despiece).
// Sigue la vista explosionada del catálogo, de la base hacia afuera.
// Por confirmar con ingeniería de Poliway.

export const NOTA_ARMADO = 'Orden de armado según la vista explosionada del catálogo; por confirmar con ingeniería de Poliway.';

export const ARMADO: Record<ClaveCanon, { n: number; texto?: string }[]> = {
  destroyer: [
    { n: 22, texto: 'Se parte del asiento del pistón, la pieza que une la válvula con el tanque y por donde sale el aire.' },
    { n: 25, texto: 'Se colocan los dos anillos O-ring que sellan el asiento contra el tubo de descarga.' },
    { n: 26, texto: 'Luego el O-ring que sella el asiento del pistón.' },
    { n: 20, texto: 'Se monta el pistón principal sobre el asiento.' },
    { n: 18, texto: 'Va el anillo de impacto, donde se apoya el resorte.' },
    { n: 19, texto: 'Se coloca el resorte del pistón, que lo mantiene cerrado.' },
    { n: 17, texto: 'Encima, el amortiguador de caucho que recibe el golpe del pistón al disparar.' },
    { n: 6, texto: 'Se inserta el émbolo de la válvula de escape.' },
    { n: 21, texto: 'Se pone el O-ring grande que sella la tapa de la válvula.' },
    { n: 1, texto: 'Se cierra con la tapa de la válvula Destroyer.' },
    { n: 24, texto: 'Se asegura con el fijador de tapa de tres octavos.' },
    { n: 8, texto: 'Se aprietan los tornillos de un cuarto con sus arandelas de presión.' },
    { n: 2, texto: 'En la tapa va el cojinete de bronce, que guía el émbolo.' },
    { n: 23, texto: 'Se instalan los dos silenciadores del escape.' },
    { n: 3, texto: 'Comienza la válvula de escape: primero su resorte.' },
    { n: 4, texto: 'Luego el pistón de la válvula de escape.' },
    { n: 5, texto: 'Encima, el diafragma de poliuretano.' },
    { n: 7, texto: 'La arandela de presión.' },
    { n: 10, texto: 'El O-ring que sella la tapa de la válvula de escape.' },
    { n: 9, texto: 'El émbolo de disparo manual.' },
    { n: 12, texto: 'Su O-ring pequeño.' },
    { n: 11, texto: 'Se cierra con la tapa de la válvula de escape.' },
    { n: 16, texto: 'Se aprietan los tres tornillos de la tapa.' },
    { n: 13, texto: 'Se coloca la palanca de disparo manual.' },
    { n: 15, texto: 'Se pasa el seguro del pasador.' },
    { n: 14, texto: 'Y por último el pin pasador de la palanca. La válvula Destroyer queda armada.' },
  ],
  xhv: [
    { n: 1, texto: 'Se parte del tanque de 150 litros, que guarda el aire comprimido.' },
    { n: 12, texto: 'Sobre la boca del tanque va el empaque entre la válvula y el tanque.' },
    { n: 2, texto: 'Se monta el cuerpo de la válvula XHV.' },
    { n: 7, texto: 'En la salida del cuerpo se coloca el asiento del pistón.' },
    { n: 14, texto: 'Y la contra flange de salida, que conecta con el tubo de descarga.' },
    { n: 6, texto: 'Dentro del cuerpo va el cojinete de teflón que guía el pistón.' },
    { n: 5, texto: 'Se introduce el pistón con cara de uretano.' },
    { n: 4, texto: 'Detrás, el resorte de compresión.' },
    { n: 13, texto: 'El O-ring 261 que sella la tapa.' },
    { n: 3, texto: 'Se cierra con la tapa de la válvula.' },
    { n: 17, texto: 'En el tanque se instala la válvula de seguridad.' },
    { n: 16, texto: 'Y el manómetro con glicerina.' },
    { n: 8, texto: 'Se arma la válvula de escape rápido: primero su cuerpo.' },
    { n: 11, texto: 'El O-ring 6708.' },
    { n: 10, texto: 'El diafragma de la válvula de escape rápido.' },
    { n: 9, texto: 'Se cierra con su tapa.' },
    { n: 18, texto: 'Se conecta el niple de una pulgada.' },
    { n: 15, texto: 'Y por último la válvula solenoide, el gatillo del disparo. El cañón XHV queda armado.' },
  ],
  capol: [
    { n: 4, texto: 'Se parte del asiento del pistón, que va en la boca del tanque.' },
    { n: 5, texto: 'Se fija con los tornillos galvanizados de cinco octavos.' },
    { n: 6, texto: 'Con sus arandelas de presión.' },
    { n: 7, texto: 'Y sus arandelas planas.' },
    { n: 3, texto: 'Se monta el pistón de la válvula XHV y Capol.' },
    { n: 2, texto: 'Detrás va el resorte de la válvula.' },
    { n: 1, texto: 'Se cierra con la tapa de la válvula.' },
    { n: 8, texto: 'Se instala la válvula de escape rápido.' },
    { n: 9, texto: 'Con la válvula solenoide que da la señal de disparo.' },
    { n: 10, texto: 'Arriba del tanque, la válvula de seguridad.' },
    { n: 11, texto: 'Y por último el manómetro. El cañón Capol queda armado.' },
  ],
};
