import { createClient } from '@supabase/supabase-js';

// Next.js reemplaza estas variables al compilar (deben empezar por NEXT_PUBLIC_)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local. ' +
      'Después de editar el archivo, reinicie "npm run dev".'
  );
}

// Un único cliente para toda la app (se usa desde componentes "use client").
// La sesión del usuario queda guardada en el navegador y se renueva sola.
// La seguridad real la ponen las políticas RLS de la base de datos.
export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
