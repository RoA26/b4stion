// Despiece de cada cañón sobre los dibujos del catálogo Blaster (posiciones en % de la imagen).
// - zonas: área de cada pieza en el dibujo
// - globos: dónde está el número del despiece (①, ②…) para poder tocarlo
// - grupo: tipo de componente, para filtrar en la pantalla
// El "sku" es el código del catálogo, igual al SKU del inventario.
export type Grupo = 'cuerpo' | 'piston' | 'resortes' | 'sellos' | 'tornilleria' | 'disparo' | 'tanque';
export type PiezaDespiece = { n: number; nombre: string; sku: string; grupo: Grupo };
export type ZonaDespiece = { x: number; y: number; w: number; h: number; piezas: PiezaDespiece[] };
export type Globo = { n: number; x: number; y: number };
export type Canon = {
  nombre: string;
  imagen: string;
  ancho: number;
  alto: number;
  zonas: ZonaDespiece[];
  globos: Globo[];
  vista: { imagen: string; titulo: string } | null;
};

export const GRUPOS: Record<Grupo, string> = {
  cuerpo: 'Cuerpo y tapas',
  piston: 'Pistón, émbolos y guías',
  resortes: 'Resortes',
  sellos: 'Sellos y empaques',
  disparo: 'Disparo, escape y control',
  tornilleria: 'Tornillería',
  tanque: 'Tanque y salida',
};

export const CANONES: Record<'destroyer' | 'xhv' | 'capol', Canon> = {
  "destroyer": {
    "nombre": "Destroyer",
    "imagen": "/canones/destroyer-v6.jpg",
    "ancho": 846,
    "alto": 2178,
    "zonas": [
      {
        "x": 28.84,
        "y": 79.16,
        "w": 43.26,
        "h": 13.04,
        "piezas": [
          {
            "n": 22,
            "nombre": "Asiento del pistón",
            "sku": "2CAR-SED-DES-AL",
            "grupo": "cuerpo"
          }
        ]
      },
      {
        "x": 22.93,
        "y": 37.28,
        "w": 55.08,
        "h": 9.73,
        "piezas": [
          {
            "n": 1,
            "nombre": "Tapa válvula Destroyer",
            "sku": "2CAR-TPA-DES-AL",
            "grupo": "cuerpo"
          }
        ]
      },
      {
        "x": 32.39,
        "y": 73.74,
        "w": 36.17,
        "h": 5.05,
        "piezas": [
          {
            "n": 20,
            "nombre": "Pistón",
            "sku": "2CAR-PT-DES-AL",
            "grupo": "piston"
          }
        ]
      },
      {
        "x": 34.75,
        "y": 64.55,
        "w": 31.44,
        "h": 5.51,
        "piezas": [
          {
            "n": 19,
            "nombre": "Resorte pistón",
            "sku": "2CAR-MO-DES-BO",
            "grupo": "resortes"
          }
        ]
      },
      {
        "x": 44.92,
        "y": 49.4,
        "w": 11.35,
        "h": 7.71,
        "piezas": [
          {
            "n": 6,
            "nombre": "Émbolo válvula de escape",
            "sku": "2CAR-EV-VED-ALT",
            "grupo": "piston"
          }
        ]
      },
      {
        "x": 29.08,
        "y": 30.76,
        "w": 12.29,
        "h": 6.61,
        "piezas": [
          {
            "n": 23,
            "nombre": "Silenciador",
            "sku": "2CAR-ABAF-DES-AL",
            "grupo": "cuerpo"
          }
        ]
      },
      {
        "x": 63.59,
        "y": 30.76,
        "w": 12.29,
        "h": 6.61,
        "piezas": [
          {
            "n": 23,
            "nombre": "Silenciador",
            "sku": "2CAR-ABAF-DES-AL",
            "grupo": "cuerpo"
          }
        ]
      },
      {
        "x": 39.01,
        "y": 12.86,
        "w": 22.7,
        "h": 3.21,
        "piezas": [
          {
            "n": 11,
            "nombre": "Tapa válvula de escape",
            "sku": "2CAR-TER-DES-AL",
            "grupo": "cuerpo"
          }
        ]
      },
      {
        "x": 39.72,
        "y": 58.03,
        "w": 21.28,
        "h": 3.12,
        "piezas": [
          {
            "n": 17,
            "nombre": "Amortiguador de impacto válvula",
            "sku": "2CAR-APD-DES-BO",
            "grupo": "sellos"
          }
        ]
      },
      {
        "x": 39.95,
        "y": 8.45,
        "w": 21.51,
        "h": 3.03,
        "piezas": [
          {
            "n": 16,
            "nombre": "Tornillo tapa válvula de escape",
            "sku": "5FIX-PF-SX-1/4X1-AG",
            "grupo": "tornilleria"
          }
        ]
      },
      {
        "x": 30.73,
        "y": 47.93,
        "w": 39.24,
        "h": 1.47,
        "piezas": [
          {
            "n": 21,
            "nombre": "Anillo O-ring tapa válvula Destroyer",
            "sku": "5VE-AO-VED-6.73X0.09-BO",
            "grupo": "sellos"
          }
        ]
      },
      {
        "x": 29.31,
        "y": 93.3,
        "w": 42.08,
        "h": 1.29,
        "piezas": [
          {
            "n": 26,
            "nombre": "Anillo O-ring de sellado asiento pistón",
            "sku": "5VE-AO-VED-7.48X0.1-BO",
            "grupo": "sellos"
          }
        ]
      },
      {
        "x": 33.81,
        "y": 62.17,
        "w": 33.1,
        "h": 1.56,
        "piezas": [
          {
            "n": 18,
            "nombre": "Anillo de impacto resorte",
            "sku": "2CAR-AIM-DES-BO",
            "grupo": "sellos"
          }
        ]
      },
      {
        "x": 44.21,
        "y": 30.12,
        "w": 12.06,
        "h": 4.04,
        "piezas": [
          {
            "n": 3,
            "nombre": "Resorte de válvula de escape",
            "sku": "2CAR-MO-VED-A",
            "grupo": "resortes"
          }
        ]
      },
      {
        "x": 33.81,
        "y": 70.71,
        "w": 33.1,
        "h": 1.38,
        "piezas": [
          {
            "n": 18,
            "nombre": "Anillo de impacto resorte",
            "sku": "2CAR-AIM-DES-BO",
            "grupo": "sellos"
          }
        ]
      },
      {
        "x": 44.92,
        "y": 4.41,
        "w": 14.66,
        "h": 2.94,
        "piezas": [
          {
            "n": 15,
            "nombre": "Seguro del pasador",
            "sku": "2CAR-PIS-VED-A",
            "grupo": "disparo"
          }
        ]
      },
      {
        "x": 36.41,
        "y": 95.22,
        "w": 28.13,
        "h": 1.38,
        "piezas": [
          {
            "n": 25,
            "nombre": "Anillo O-ring de sellado asiento de tubo",
            "sku": "5VE-AO-VED-4.5X0.27-BO",
            "grupo": "sellos"
          }
        ]
      },
      {
        "x": 36.41,
        "y": 97.06,
        "w": 28.13,
        "h": 1.38,
        "piezas": [
          {
            "n": 25,
            "nombre": "Anillo O-ring de sellado asiento de tubo",
            "sku": "5VE-AO-VED-4.5X0.27-BO",
            "grupo": "sellos"
          }
        ]
      },
      {
        "x": 41.37,
        "y": 20.94,
        "w": 17.97,
        "h": 1.38,
        "piezas": [
          {
            "n": 10,
            "nombre": "Anillo O-ring tapa válvula escape",
            "sku": "5VE-AO-VED-2.86X1.03-BO",
            "grupo": "sellos"
          }
        ]
      },
      {
        "x": 43.26,
        "y": 28.28,
        "w": 14.66,
        "h": 1.47,
        "piezas": [
          {
            "n": 4,
            "nombre": "Pistón válvula de escape",
            "sku": "2CAR-PT-VED-AL",
            "grupo": "piston"
          }
        ]
      },
      {
        "x": 42.55,
        "y": 26.54,
        "w": 15.6,
        "h": 1.38,
        "piezas": [
          {
            "n": 5,
            "nombre": "Diafragma válvula de escape",
            "sku": "2CAR-DER-DES-PU",
            "grupo": "sellos"
          }
        ]
      },
      {
        "x": 46.57,
        "y": 11.48,
        "w": 12.06,
        "h": 1.65,
        "piezas": [
          {
            "n": 13,
            "nombre": "Palanca de disparo manual",
            "sku": "12CAR-EDVED-AL",
            "grupo": "disparo"
          }
        ]
      },
      {
        "x": 46.34,
        "y": 2.85,
        "w": 9.46,
        "h": 1.65,
        "piezas": [
          {
            "n": 14,
            "nombre": "Pin pasador",
            "sku": "5FIX-PIL1/4X1.1/4",
            "grupo": "disparo"
          }
        ]
      },
      {
        "x": 48.23,
        "y": 17.72,
        "w": 4.49,
        "h": 3.4,
        "piezas": [
          {
            "n": 9,
            "nombre": "Émbolo de disparo manual",
            "sku": "2CAR-ED-VED-AL",
            "grupo": "disparo"
          }
        ]
      },
      {
        "x": 47.99,
        "y": 34.44,
        "w": 5.2,
        "h": 2.57,
        "piezas": [
          {
            "n": 2,
            "nombre": "Cojinete de bronce",
            "sku": "2CAR-BU-DES-BRO",
            "grupo": "piston"
          }
        ]
      },
      {
        "x": 30.26,
        "y": 37.47,
        "w": 4.26,
        "h": 3.12,
        "piezas": [
          {
            "n": 8,
            "nombre": "Tornillo galvanizado de 1/4\" x 7/8\"",
            "sku": "5FIX-PF-SX-1/4X7/8-AG",
            "grupo": "tornilleria"
          }
        ]
      },
      {
        "x": 47.99,
        "y": 22.5,
        "w": 4.02,
        "h": 2.94,
        "piezas": [
          {
            "n": 8,
            "nombre": "Tornillo galvanizado de 1/4\" x 7/8\"",
            "sku": "5FIX-PF-SX-1/4X7/8-AG",
            "grupo": "tornilleria"
          }
        ]
      },
      {
        "x": 47.75,
        "y": 39.12,
        "w": 6.15,
        "h": 1.65,
        "piezas": [
          {
            "n": 24,
            "nombre": "Fijador de tapa de 3/8\"",
            "sku": "5FE-TP-SX-3/8-G",
            "grupo": "tornilleria"
          }
        ]
      },
      {
        "x": 26.95,
        "y": 40.5,
        "w": 7.8,
        "h": 1.29,
        "piezas": [
          {
            "n": 7,
            "nombre": "Arandela de presión de 1/4\"",
            "sku": "5FIX-AR-P-1/4-AG",
            "grupo": "tornilleria"
          }
        ]
      },
      {
        "x": 46.81,
        "y": 16.16,
        "w": 6.62,
        "h": 1.38,
        "piezas": [
          {
            "n": 12,
            "nombre": "Anillo O-ring émbolo válvula de escape",
            "sku": "5VE-AO-VED-0.48X0.13-BO",
            "grupo": "sellos"
          }
        ]
      },
      {
        "x": 46.81,
        "y": 25.25,
        "w": 6.62,
        "h": 1.1,
        "piezas": [
          {
            "n": 7,
            "nombre": "Arandela de presión de 1/4\"",
            "sku": "5FIX-AR-P-1/4-AG",
            "grupo": "tornilleria"
          }
        ]
      }
    ],
    "globos": [
      {
        "n": 1,
        "x": 93.62,
        "y": 42.88
      },
      {
        "n": 2,
        "x": 84.4,
        "y": 39.67
      },
      {
        "n": 3,
        "x": 14.66,
        "y": 28.74
      },
      {
        "n": 4,
        "x": 17.73,
        "y": 25.99
      },
      {
        "n": 5,
        "x": 91.02,
        "y": 28.28
      },
      {
        "n": 6,
        "x": 83.22,
        "y": 56.38
      },
      {
        "n": 7,
        "x": 26.24,
        "y": 23.51
      },
      {
        "n": 7,
        "x": 5.67,
        "y": 43.25
      },
      {
        "n": 8,
        "x": 83.92,
        "y": 25.34
      },
      {
        "n": 8,
        "x": 12.29,
        "y": 40.5
      },
      {
        "n": 9,
        "x": 84.87,
        "y": 20.75
      },
      {
        "n": 10,
        "x": 17.02,
        "y": 19.38
      },
      {
        "n": 11,
        "x": 93.38,
        "y": 16.07
      },
      {
        "n": 12,
        "x": 17.97,
        "y": 14.33
      },
      {
        "n": 13,
        "x": 87.94,
        "y": 13.59
      },
      {
        "n": 14,
        "x": 28.61,
        "y": 2.39
      },
      {
        "n": 15,
        "x": 77.54,
        "y": 6.8
      },
      {
        "n": 16,
        "x": 18.2,
        "y": 8.45
      },
      {
        "n": 17,
        "x": 17.02,
        "y": 61.8
      },
      {
        "n": 18,
        "x": 92.67,
        "y": 64.74
      },
      {
        "n": 19,
        "x": 84.87,
        "y": 69.61
      },
      {
        "n": 20,
        "x": 91.25,
        "y": 76.77
      },
      {
        "n": 21,
        "x": 4.96,
        "y": 51.61
      },
      {
        "n": 22,
        "x": 8.51,
        "y": 85.22
      },
      {
        "n": 23,
        "x": 96.93,
        "y": 33.79
      },
      {
        "n": 24,
        "x": 86.05,
        "y": 46.1
      },
      {
        "n": 25,
        "x": 5.2,
        "y": 96.69
      },
      {
        "n": 26,
        "x": 90.31,
        "y": 94.49
      }
    ],
    "vista": {
      "imagen": "/canones/destroyer-vista-v6.jpg",
      "titulo": "Vista lateral sombreada (catálogo)"
    }
  },
  "xhv": {
    "nombre": "XHV",
    "imagen": "/canones/xhv-v6.jpg",
    "ancho": 500,
    "alto": 740,
    "zonas": [
      {
        "x": 27.14,
        "y": 56.08,
        "w": 42.6,
        "h": 36.7,
        "piezas": [
          {
            "n": 1,
            "nombre": "Tanque",
            "sku": "4926",
            "grupo": "tanque"
          }
        ]
      },
      {
        "x": 33.53,
        "y": 29.46,
        "w": 29.18,
        "h": 19.43,
        "piezas": [
          {
            "n": 2,
            "nombre": "Cuerpo válvula",
            "sku": "397",
            "grupo": "cuerpo"
          }
        ]
      },
      {
        "x": 5.63,
        "y": 46.01,
        "w": 18.11,
        "h": 14.39,
        "piezas": [
          {
            "n": 14,
            "nombre": "Flange de salida",
            "sku": "438",
            "grupo": "tanque"
          }
        ]
      },
      {
        "x": 17.34,
        "y": 43.13,
        "w": 18.32,
        "h": 11.51,
        "piezas": [
          {
            "n": 7,
            "nombre": "Asiento de pistón XHV",
            "sku": "388",
            "grupo": "cuerpo"
          }
        ]
      },
      {
        "x": 81.24,
        "y": 17.95,
        "w": 14.06,
        "h": 14.1,
        "piezas": [
          {
            "n": 3,
            "nombre": "Tapa de válvula",
            "sku": "387",
            "grupo": "cuerpo"
          }
        ]
      },
      {
        "x": 57.81,
        "y": 29.17,
        "w": 12.35,
        "h": 9.21,
        "piezas": [
          {
            "n": 6,
            "nombre": "Cojinete GU TFL 165 x 170 x 75 mm",
            "sku": "546",
            "grupo": "piston"
          }
        ]
      },
      {
        "x": 38.64,
        "y": 50.33,
        "w": 19.17,
        "h": 5.76,
        "piezas": [
          {
            "n": 12,
            "nombre": "Empaque válvula/tanque",
            "sku": "4943",
            "grupo": "sellos"
          }
        ]
      },
      {
        "x": 74.0,
        "y": 23.7,
        "w": 7.24,
        "h": 10.36,
        "piezas": [
          {
            "n": 4,
            "nombre": "Resorte de compresión",
            "sku": "428",
            "grupo": "resortes"
          }
        ]
      },
      {
        "x": 15.85,
        "y": 8.59,
        "w": 12.14,
        "h": 6.04,
        "piezas": [
          {
            "n": 15,
            "nombre": "Válvula solenoide 1/4\" @220 V",
            "sku": "514",
            "grupo": "disparo"
          }
        ]
      },
      {
        "x": 23.3,
        "y": 21.98,
        "w": 11.08,
        "h": 6.33,
        "piezas": [
          {
            "n": 9,
            "nombre": "Tapa válvula escape rápido",
            "sku": "4960",
            "grupo": "disparo"
          }
        ]
      },
      {
        "x": 68.46,
        "y": 26.87,
        "w": 8.09,
        "h": 8.35,
        "piezas": [
          {
            "n": 5,
            "nombre": "Pistón con uretano",
            "sku": "392",
            "grupo": "piston"
          }
        ]
      },
      {
        "x": 5.84,
        "y": 17.23,
        "w": 7.24,
        "h": 6.48,
        "piezas": [
          {
            "n": 8,
            "nombre": "Cuerpo válvula escape rápido",
            "sku": "4961",
            "grupo": "disparo"
          }
        ]
      },
      {
        "x": 59.94,
        "y": 74.79,
        "w": 8.52,
        "h": 4.75,
        "piezas": [
          {
            "n": 17,
            "nombre": "Válvula de seguridad",
            "sku": "390",
            "grupo": "disparo"
          }
        ]
      },
      {
        "x": 71.87,
        "y": 57.24,
        "w": 7.24,
        "h": 5.04,
        "piezas": [
          {
            "n": 16,
            "nombre": "Manómetro 1/4\" con glicerina (0-14 bar)",
            "sku": "516",
            "grupo": "disparo"
          }
        ]
      },
      {
        "x": 8.39,
        "y": 13.63,
        "w": 5.33,
        "h": 4.32,
        "piezas": [
          {
            "n": 18,
            "nombre": "Niple",
            "sku": "5060",
            "grupo": "tanque"
          }
        ]
      },
      {
        "x": 79.54,
        "y": 28.74,
        "w": 4.47,
        "h": 3.89,
        "piezas": [
          {
            "n": 13,
            "nombre": "Anillo O-ring 261",
            "sku": "393",
            "grupo": "sellos"
          }
        ]
      },
      {
        "x": 16.91,
        "y": 20.54,
        "w": 5.33,
        "h": 3.17,
        "piezas": [
          {
            "n": 10,
            "nombre": "Diafragma válvula de escape rápido",
            "sku": "391",
            "grupo": "sellos"
          }
        ]
      },
      {
        "x": 12.66,
        "y": 19.67,
        "w": 3.83,
        "h": 2.88,
        "piezas": [
          {
            "n": 11,
            "nombre": "Anillo O-ring 6708",
            "sku": "395",
            "grupo": "sellos"
          }
        ]
      }
    ],
    "globos": [
      {
        "n": 1,
        "x": 75.6,
        "y": 64.59
      },
      {
        "n": 2,
        "x": 45.2,
        "y": 26.49
      },
      {
        "n": 3,
        "x": 94.0,
        "y": 15.68
      },
      {
        "n": 4,
        "x": 73.6,
        "y": 18.11
      },
      {
        "n": 5,
        "x": 69.2,
        "y": 20.81
      },
      {
        "n": 6,
        "x": 62.4,
        "y": 21.89
      },
      {
        "n": 7,
        "x": 18.8,
        "y": 38.38
      },
      {
        "n": 8,
        "x": 6.4,
        "y": 27.3
      },
      {
        "n": 9,
        "x": 38.0,
        "y": 17.84
      },
      {
        "n": 10,
        "x": 32.0,
        "y": 14.86
      },
      {
        "n": 11,
        "x": 18.8,
        "y": 29.73
      },
      {
        "n": 12,
        "x": 64.4,
        "y": 47.84
      },
      {
        "n": 13,
        "x": 83.2,
        "y": 37.3
      },
      {
        "n": 14,
        "x": 8.0,
        "y": 38.38
      },
      {
        "n": 15,
        "x": 27.6,
        "y": 4.32
      },
      {
        "n": 16,
        "x": 86.0,
        "y": 50.0
      },
      {
        "n": 17,
        "x": 78.0,
        "y": 72.16
      },
      {
        "n": 18,
        "x": 3.6,
        "y": 7.57
      }
    ],
    "vista": null
  },
  "capol": {
    "nombre": "Capol",
    "imagen": "/canones/capol-v6.jpg",
    "ancho": 1408,
    "alto": 1006,
    "zonas": [
      {
        "x": 43.67,
        "y": 48.48,
        "w": 15.37,
        "h": 24.98,
        "piezas": [
          {
            "n": 4,
            "nombre": "Asiento de pistón",
            "sku": "377",
            "grupo": "cuerpo"
          }
        ]
      },
      {
        "x": 19.13,
        "y": 65.3,
        "w": 13.88,
        "h": 25.15,
        "piezas": [
          {
            "n": 1,
            "nombre": "Tapa válvula XHV/Capol",
            "sku": "387",
            "grupo": "cuerpo"
          }
        ]
      },
      {
        "x": 54.45,
        "y": 38.76,
        "w": 13.01,
        "h": 23.07,
        "piezas": [
          {
            "n": 5,
            "nombre": "Tornillo galvanizado de 5/8\" x 2 1/2\"",
            "sku": "736",
            "grupo": "tornilleria"
          },
          {
            "n": 6,
            "nombre": "Arandela de presión de 5/8\"",
            "sku": "557",
            "grupo": "tornilleria"
          },
          {
            "n": 7,
            "nombre": "Arandela galvanizada de 5/8\"",
            "sku": "608",
            "grupo": "tornilleria"
          }
        ]
      },
      {
        "x": 37.47,
        "y": 57.15,
        "w": 10.41,
        "h": 15.61,
        "piezas": [
          {
            "n": 3,
            "nombre": "Pistón válvula XHV/Capol",
            "sku": "392",
            "grupo": "piston"
          }
        ]
      },
      {
        "x": 30.03,
        "y": 66.17,
        "w": 9.17,
        "h": 13.01,
        "piezas": [
          {
            "n": 2,
            "nombre": "Resorte de válvula",
            "sku": "428",
            "grupo": "resortes"
          }
        ]
      },
      {
        "x": 2.77,
        "y": 72.24,
        "w": 7.93,
        "h": 12.66,
        "piezas": [
          {
            "n": 8,
            "nombre": "Válvula de escape rápido",
            "sku": "389",
            "grupo": "disparo"
          }
        ]
      },
      {
        "x": 36.23,
        "y": 69.98,
        "w": 5.45,
        "h": 13.88,
        "piezas": [
          {
            "n": 9,
            "nombre": "Válvula solenoide 1/4 110/220 V",
            "sku": "4196",
            "grupo": "disparo"
          }
        ]
      },
      {
        "x": 71.92,
        "y": 70.16,
        "w": 5.7,
        "h": 8.5,
        "piezas": [
          {
            "n": 11,
            "nombre": "Manómetro",
            "sku": "516",
            "grupo": "disparo"
          }
        ]
      },
      {
        "x": 71.8,
        "y": 4.07,
        "w": 4.34,
        "h": 6.94,
        "piezas": [
          {
            "n": 10,
            "nombre": "Válvula de seguridad 1 kgf/cm² - 1/2\"",
            "sku": "390",
            "grupo": "disparo"
          }
        ]
      }
    ],
    "globos": [
      {
        "n": 1,
        "x": 18.89,
        "y": 62.03
      },
      {
        "n": 2,
        "x": 31.39,
        "y": 56.66
      },
      {
        "n": 3,
        "x": 49.01,
        "y": 80.52
      },
      {
        "n": 4,
        "x": 60.09,
        "y": 76.34
      },
      {
        "n": 5,
        "x": 83.52,
        "y": 69.18
      },
      {
        "n": 6,
        "x": 85.37,
        "y": 69.18
      },
      {
        "n": 7,
        "x": 87.22,
        "y": 69.18
      },
      {
        "n": 8,
        "x": 12.64,
        "y": 69.78
      },
      {
        "n": 9,
        "x": 33.38,
        "y": 87.08
      },
      {
        "n": 10,
        "x": 83.38,
        "y": 4.57
      }
    ],
    "vista": null
  }
};
