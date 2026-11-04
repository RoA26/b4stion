import type { Metadata, Viewport } from 'next';
import { Barlow } from 'next/font/google';
import './globals.css';
import AsistenteVoz from '@/components/AsistenteVoz';

// Barlow: tipografía de estilo industrial, muy legible en pantallas de bodega
const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-barlow',
});

export const metadata: Metadata = {
  title: { default: 'Bastión · Inventario Poliway', template: '%s · Bastión' },
  description: 'Bastión: control de inventario, préstamos e inspecciones de Poliway',
  applicationName: 'Bastión',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon-180.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#17191C',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body className={`${barlow.variable} font-sans antialiased`}>
        {children}
        <AsistenteVoz />
      </body>
    </html>
  );
}
