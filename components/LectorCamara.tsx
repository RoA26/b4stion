'use client';

import { useEffect, useRef, useState } from 'react';
import type { Html5Qrcode } from 'html5-qrcode';

const ID_VISOR = 'visor-camara';

// Lee códigos QR y de barras con la cámara trasera del celular.
// Solo enciende la cámara mientras "activo" es true, para ahorrar batería
// y no leer dos veces el mismo código mientras se llena el formulario.
export default function LectorCamara({
  activo,
  onCodigo,
}: {
  activo: boolean;
  onCodigo: (codigo: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const callback = useRef(onCodigo);
  callback.current = onCodigo;

  useEffect(() => {
    if (!activo) return;

    if (!window.isSecureContext) {
      setError(
        'La cámara solo funciona en páginas seguras (https) o en localhost. En el celular use la versión publicada en Vercel.'
      );
      return;
    }

    let lector: Html5Qrcode | null = null;
    let cancelado = false;
    let ultimo = { codigo: '', hora: 0 };
    setError(null);
    setIniciando(true);

    (async () => {
      // Import dinámico: la librería usa "window" y no puede cargarse en el servidor
      const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = await import('html5-qrcode');
      if (cancelado) return;

      lector = new Html5Qrcode(ID_VISOR, {
        verbose: false,
        formatsToSupport: [F.QR_CODE, F.CODE_128, F.CODE_39, F.EAN_13, F.EAN_8, F.UPC_A],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      });

      try {
        await lector.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: (ancho, alto) => ({
              width: Math.floor(Math.min(ancho * 0.85, 340)),
              height: Math.floor(Math.min(alto * 0.6, 220)),
            }),
          },
          (texto) => {
            const ahora = Date.now();
            // Evita disparar dos veces el mismo código en menos de 2 segundos
            if (texto === ultimo.codigo && ahora - ultimo.hora < 2000) return;
            ultimo = { codigo: texto, hora: ahora };
            callback.current(texto.trim());
          },
          () => undefined // "no encontré código en este cuadro": se ignora
        );
        if (cancelado && lector.isScanning) await lector.stop();
      } catch (e) {
        const nombre = (e as { name?: string })?.name ?? String(e);
        setError(
          /NotAllowed|Permission/i.test(nombre)
            ? 'No se dio permiso para usar la cámara. Actívelo en la configuración del navegador y recargue la página.'
            : /NotFound|Overconstrained/i.test(nombre)
              ? 'No se encontró una cámara en este equipo. Use el campo de código o un escáner USB.'
              : `No se pudo iniciar la cámara (${nombre}).`
        );
      } finally {
        if (!cancelado) setIniciando(false);
      }
    })();

    return () => {
      cancelado = true;
      const l = lector;
      if (l?.isScanning) {
        l.stop()
          .then(() => l.clear())
          .catch(() => undefined);
      }
    };
  }, [activo]);

  if (!activo) return null;

  return (
    <div className="overflow-hidden rounded-lg border-2 border-tinta bg-black">
      <div id={ID_VISOR} className="aspect-[4/3] w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
      {(iniciando || error) && (
        <p
          role={error ? 'alert' : 'status'}
          className={`px-4 py-3 text-sm font-medium ${error ? 'bg-alerta-suave text-alerta' : 'bg-tinta text-white'}`}
        >
          {error ?? 'Encendiendo cámara…'}
        </p>
      )}
    </div>
  );
}
