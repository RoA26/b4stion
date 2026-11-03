# Bastión — Brand Assets v1.0

Paquete de identidad visual generado a partir del logo aprobado (`logo/source/bastion-logo-original.jpg`).
Consulta `documentation/brand-guidelines.md` para las reglas de uso y abre `previews/brand-sheet.html` (funciona sin conexión).

```
logo/
  source/   bastion-logo-original.jpg      original sin modificar
  svg/      bastion-logo-*.svg             4 versiones vectoriales
  png/      bastion-logo-*-1024|2048.png   PNG con transparencia real
icons/      favicon.ico (16/32/48), favicon.svg, favicon-16/32.png,
            apple-touch-icon-180.png, icon-192/512.png, app-icon.svg, site.webmanifest
colors/     bastion-colors.css | .scss | .json
documentation/ brand-guidelines.md
previews/   brand-sheet.html, brand-sheet.png, fidelity-comparison.png, icon-legibility.png
```

Versiones: `primary` (fondo oscuro), `on-light` (fondo claro), `mono-charcoal`, `mono-warm`.

Fidelidad: vectorizado con potrace desde el original ampliado ×4; desviación máxima ≤ 1 px, IoU ≥ 0,998 por capa.
