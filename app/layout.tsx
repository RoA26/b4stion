import type { Metadata } from 'next';
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
  title: 'Inventario Poliway',
  description: 'Control de inventario de bandas, cauchos y accesorios',
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
