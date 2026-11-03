// SOLO PARA EL SERVIDOR (rutas /api). Nunca importar desde una página.
// Usa la llave secreta de Supabase, que puede crear usuarios y saltarse las
// políticas RLS. Por eso vive en una variable SIN el prefijo NEXT_PUBLIC_.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function clienteAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.SUPABASE_SECRET_KEY;
  if (!url || !llave) {
    throw new Error('Falta SUPABASE_SECRET_KEY en el archivo .env.local (o en la configuración de Vercel).');
  }
  return createClient(url, llave, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Resultado =
  | { ok: true; admin: SupabaseClient; usuarioId: string }
  | { ok: false; respuesta: Response };

const json = (cuerpo: unknown, status: number) => Response.json(cuerpo, { status });

// Confirma que quien llama tiene sesión y es administrador activo
export async function verificarAdmin(req: Request): Promise<Resultado> {
  let admin: SupabaseClient;
  try {
    admin = clienteAdmin();
  } catch (e) {
    return { ok: false, respuesta: json({ error: (e as Error).message, falta_llave: true }, 500) };
  }
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) return { ok: false, respuesta: json({ error: 'Sesión no válida. Vuelva a iniciar sesión.' }, 401) };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { ok: false, respuesta: json({ error: 'Sesión vencida. Vuelva a iniciar sesión.' }, 401) };

  const { data: perfil } = await admin.from('perfiles').select('rol, activo').eq('id', data.user.id).maybeSingle();
  if (perfil?.rol !== 'admin' || perfil?.activo === false) {
    return { ok: false, respuesta: json({ error: 'Solo el administrador puede hacer esto.' }, 403) };
  }
  return { ok: true, admin, usuarioId: data.user.id };
}
