// Administración de usuarios: solo el administrador.
// GET: lista | POST: crear | PATCH: cambiar nombre, rol, estado o clave
import { verificarAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const ROLES = ['admin', 'bodeguero', 'consulta'];
const BLOQUEO = '876000h'; // ~100 años: así se "desactiva" un usuario en Supabase
const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status });

export async function GET(req: Request) {
  const v = await verificarAdmin(req);
  if (!v.ok) return v.respuesta;

  const { data: lista, error } = await v.admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return json({ error: error.message }, 500);
  const { data: perfiles } = await v.admin.from('perfiles').select('id, nombre, rol, activo');
  const porId = new Map((perfiles ?? []).map((p) => [p.id, p]));

  const usuarios = lista.users
    .map((u) => {
      const p = porId.get(u.id);
      return {
        id: u.id,
        email: u.email ?? '',
        nombre: p?.nombre ?? u.email ?? '',
        rol: p?.rol ?? 'consulta',
        activo: p?.activo !== false,
        ultimo_ingreso: u.last_sign_in_at ?? null,
        creado: u.created_at,
        soy_yo: u.id === v.usuarioId,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return json({ usuarios });
}

export async function POST(req: Request) {
  const v = await verificarAdmin(req);
  if (!v.ok) return v.respuesta;

  const { nombre, email, clave, rol } = (await req.json().catch(() => ({}))) as Record<string, string>;
  if (!nombre?.trim()) return json({ error: 'Escriba el nombre del usuario.' }, 400);
  if (!email?.trim() || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Escriba un correo válido.' }, 400);
  if (!clave || clave.length < 8) return json({ error: 'La clave debe tener al menos 8 caracteres.' }, 400);
  if (!ROLES.includes(rol)) return json({ error: 'Escoja un rol válido.' }, 400);

  const { data, error } = await v.admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password: clave,
    email_confirm: true,
    user_metadata: { nombre: nombre.trim() },
  });
  if (error) {
    const yaExiste = /already|registered|exists/i.test(error.message);
    return json({ error: yaExiste ? 'Ya existe un usuario con ese correo.' : error.message }, 400);
  }
  // El perfil lo crea automáticamente la base de datos; aquí se le pone nombre y rol
  const { error: e2 } = await v.admin
    .from('perfiles')
    .upsert({ id: data.user.id, nombre: nombre.trim(), rol, activo: true });
  if (e2) return json({ error: `Usuario creado, pero no se pudo asignar el rol: ${e2.message}` }, 500);
  return json({ ok: true, id: data.user.id });
}

export async function PATCH(req: Request) {
  const v = await verificarAdmin(req);
  if (!v.ok) return v.respuesta;

  const cuerpo = (await req.json().catch(() => ({}))) as {
    id?: string;
    nombre?: string;
    rol?: string;
    activo?: boolean;
    clave?: string;
  };
  if (!cuerpo.id) return json({ error: 'Falta el usuario.' }, 400);

  // Protección para no quedarse sin administrador
  if (cuerpo.id === v.usuarioId && (cuerpo.activo === false || (cuerpo.rol && cuerpo.rol !== 'admin'))) {
    return json({ error: 'No puede quitarse a usted mismo el rol de administrador ni desactivarse.' }, 400);
  }

  const cambios: Record<string, unknown> = {};
  if (cuerpo.nombre !== undefined) {
    if (!cuerpo.nombre.trim()) return json({ error: 'El nombre no puede quedar vacío.' }, 400);
    cambios.nombre = cuerpo.nombre.trim();
  }
  if (cuerpo.rol !== undefined) {
    if (!ROLES.includes(cuerpo.rol)) return json({ error: 'Rol inválido.' }, 400);
    cambios.rol = cuerpo.rol;
  }
  if (cuerpo.activo !== undefined) cambios.activo = cuerpo.activo;

  if (Object.keys(cambios).length) {
    const { error } = await v.admin.from('perfiles').update(cambios).eq('id', cuerpo.id);
    if (error) return json({ error: error.message }, 500);
  }

  const auth: Record<string, string> = {};
  if (cuerpo.activo !== undefined) auth.ban_duration = cuerpo.activo ? 'none' : BLOQUEO;
  if (cuerpo.clave !== undefined) {
    if (cuerpo.clave.length < 8) return json({ error: 'La clave debe tener al menos 8 caracteres.' }, 400);
    auth.password = cuerpo.clave;
  }
  if (Object.keys(auth).length) {
    const { error } = await v.admin.auth.admin.updateUserById(cuerpo.id, auth);
    if (error) return json({ error: error.message }, 500);
  }
  return json({ ok: true });
}
