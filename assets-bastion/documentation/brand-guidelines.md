# Bastión — Guía de uso de marca

Versión 1.0 · Octubre 2026

## 1. El isotipo

El isotipo de Bastión es un escudo de tres capas:

1. **Anillo exterior** — la silueta del escudo, en blanco cálido sobre fondo oscuro.
2. **Contorno interior** — una banda color carbón que separa el anillo del núcleo.
3. **Núcleo** — un escudo naranja cuyo lado derecho forma una **B** mediante una muesca en V.

La geometría de los archivos de este paquete se obtuvo **vectorizando el logo aprobado** (`logo/source/bastion-logo-original.jpg`), no redibujándolo. La desviación medida entre el vector y el original es de ≤ 1 px en una imagen de 939 × 1024 px (IoU ≥ 0,998 en cada capa). Ver `previews/fidelity-comparison.png`.

**No se debe** redibujar, simplificar, estirar, rotar, añadir sombras, contornos o degradados, ni cambiar las proporciones entre anillo, banda y núcleo.

## 2. Versiones del logo

| Archivo | Uso |
|---|---|
| `bastion-logo-primary` | **Versión principal.** Fondos oscuros (ideal: carbón `#17191C`). Anillo blanco cálido, banda carbón, núcleo naranja. |
| `bastion-logo-on-light` | Fondos claros. Anillo carbón, banda blanco de interfaz, núcleo naranja. Misma geometría, colores invertidos. |
| `bastion-logo-mono-charcoal` | Una sola tinta (carbón) sobre fondos claros: sellos, grabado, documentos en blanco y negro. La banda queda calada (transparente). |
| `bastion-logo-mono-warm` | Una sola tinta (blanco cálido) sobre fondos oscuros o fotografías oscuras. La banda queda calada. |

Formatos: SVG (vector, escalable) en `logo/svg/` y PNG con transparencia real a 1024 y 2048 px de alto en `logo/png/`.

Las versiones principal y "on-light" tienen la banda interior **rellena**, de modo que el símbolo se ve igual sobre cualquier fondo. Las versiones monocromas la tienen **calada**.

## 3. Área de protección y tamaño mínimo

- **Unidad x** = grosor del anillo exterior (≈ 15 % del ancho del escudo).
- Deja como mínimo **1x de espacio libre** en los cuatro lados. Los archivos incluyen un margen interno pequeño (≈ 0,4x); el resto debe aportarlo la maquetación.
- **Tamaño mínimo** del logo a color: 24 px de alto en pantalla, 10 mm en impresión.
- Por debajo de 24 px usa los iconos de `icons/` (favicon). A 16 px la muesca de la B deja de distinguirse; es una limitación física del tamaño, no se ha simplificado el símbolo.

## 4. Paleta

| Nombre | HEX | RGB | Uso |
|---|---|---|---|
| Naranja | `#FF6A00` | 255 106 0 | Núcleo del isotipo, acentos, llamadas a la acción sobre oscuro |
| Carbón | `#17191C` | 23 25 28 | Fondo principal, contorno interior, texto sobre claro |
| Blanco cálido | `#F4F1EA` | 244 241 234 | Anillo del escudo, texto sobre oscuro |
| Blanco de interfaz | `#FAFAFA` | 250 250 250 | Fondos claros de UI |
| Gris acero | `#8C929A` | 140 146 154 | Texto secundario, bordes, iconos inactivos |

Variables listas en `colors/bastion-colors.css`, `.scss` y `.json`.

### Contraste (WCAG 2.x)

| Combinación | Ratio | Apto para |
|---|---|---|
| Blanco cálido sobre carbón | 15,6 : 1 | Todo texto (AAA) |
| Carbón sobre blanco de interfaz | 16,9 : 1 | Todo texto (AAA) |
| Naranja sobre carbón | 6,1 : 1 | Texto normal (AA) |
| Gris acero sobre carbón | 5,6 : 1 | Texto normal (AA) |
| Gris acero sobre blanco de interfaz | 3,0 : 1 | Solo texto grande / elementos de UI |
| Naranja sobre blanco de interfaz | 2,8 : 1 | **No usar para texto**; solo superficies o formas |

> Nota: el JPG original fue exportado con tonos ligeramente distintos (fondo `#212022`, anillo `#ECE8DD`, naranja `#F16003`, medidos por agrupación de color). Los archivos de este paquete usan los valores **oficiales** de la paleta.

## 5. Iconografía

| Archivo | Tamaño | Uso |
|---|---|---|
| `favicon.ico` | 16, 32, 48 | Favicon clásico |
| `favicon-16.png`, `favicon-32.png` | 16, 32 | Favicon PNG |
| `favicon.svg` | vector | Favicon en navegadores modernos |
| `apple-touch-icon-180.png` | 180 | iOS (sin transparencia, como exige Apple) |
| `icon-192.png`, `icon-512.png` | 192, 512 | PWA / Android, válidos como *maskable* |
| `app-icon.svg` | vector | Fuente de los iconos de app |
| `site.webmanifest` | — | Manifiesto PWA de ejemplo |

Los iconos de favicon colocan el isotipo principal sobre un cuadrado carbón redondeado (se ve bien en pestañas claras y oscuras). Los de app usan fondo carbón a sangre con el logo dentro de la zona segura *maskable* (radio máximo medido: 34,5 % del lado; límite 40 %).

### Código HTML

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon-180.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#17191C">
```

## 6. Usos incorrectos

- Cambiar los colores fuera de las cuatro versiones definidas.
- Usar la versión principal sobre fondos claros (el anillo blanco cálido desaparece).
- Deformar, inclinar o rotar el escudo.
- Añadir sombras, biseles, brillos o degradados.
- Recortar el anillo o colocar elementos dentro del área de protección.
- Sustituir la B del núcleo por una tipografía o por otro trazado.
