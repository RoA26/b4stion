'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Encabezado, { BOTON_PRINCIPAL, CONTROL } from '@/components/Encabezado';
import { NOMBRE_ROL, tokenSesion, useSesion, type Rol } from '@/lib/sesion';

interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  ultimo_ingreso: string | null;
  soy_yo: boolean;
}

const DESCRIPCION_ROL: Record<Rol, string> = {
  admin: 'Todo, incluso crear usuarios, aprobar conteos y ajustes',
  bodeguero: 'Registra entradas y salidas, conteos y listas',
  consulta: 'Solo ve inventario, cañones e informes',
};

async function llamar(metodo: 'GET' | 'POST' | 'PATCH', cuerpo?: unknown) {
  const r = await fetch('/api/usuarios', {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenSesion()}` },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  return { ok: r.ok, datos };
}

export default function Usuarios() {
  const sesion = useSesion();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [faltaLlave, setFaltaLlave] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({ nombre: '', email: '', clave: '', rol: 'bodeguero' as Rol });
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState<{ id: string; campo: 'clave' | 'nombre' } | null>(null);
  const [valorNuevo, setValorNuevo] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    const { ok, datos } = await llamar('GET');
    if (ok) {
      setUsuarios(datos.usuarios);
      setError(null);
    } else {
      setError(datos.error ?? 'No se pudo cargar la lista de usuarios.');
      setFaltaLlave(!!datos.falta_llave);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    if (sesion.esAdmin) cargar();
  }, [sesion.esAdmin, cargar]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  async function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGuardando(true);
    const { ok, datos } = await llamar('POST', nuevo);
    setGuardando(false);
    if (!ok) return setError(datos.error);
    setAviso(`Usuario ${nuevo.nombre} creado. Ya puede ingresar con su correo y clave.`);
    setNuevo({ nombre: '', email: '', clave: '', rol: 'bodeguero' });
    setError(null);
    cargar();
  }

  async function cambiar(u: Usuario, cambios: Partial<Usuario> & { clave?: string }, mensaje: string) {
    const { ok, datos } = await llamar('PATCH', { id: u.id, ...cambios });
    if (!ok) return setError(datos.error);
    setError(null);
    setAviso(mensaje);
    cargar();
  }

  if (!sesion.listo) return <p className="py-24 text-center text-acero">Cargando…</p>;
  if (!sesion.esAdmin)
    return (
      <main className="mx-auto max-w-4xl px-4 pt-6">
        <Encabezado titulo="Usuarios" />
        <p className="mt-6 text-acero">Esta pantalla es solo para el administrador.</p>
      </main>
    );

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <Encabezado titulo="Usuarios" />

      <p className="mt-4 max-w-3xl text-acero">
        Cada persona entra con su propio correo y clave. Así cada movimiento queda a nombre de quien lo hizo y los informes muestran
        quién entregó cada producto.
      </p>

      {faltaLlave && (
        <div className="mt-4 rounded-lg border border-alerta bg-alerta-suave p-4 text-sm">
          <p className="font-semibold text-alerta">Falta configurar la llave secreta de Supabase.</p>
          <p className="mt-1">
            Agregue la línea <code className="rounded bg-white px-1">SUPABASE_SECRET_KEY=...</code> al archivo .env.local y reinicie la app.
          </p>
        </div>
      )}

      {/* Crear usuario */}
      <form onSubmit={crear} className="mt-5 rounded-lg border border-linea bg-white p-4" noValidate>
        <h2 className="font-bold">Crear usuario</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-sm font-medium">Nombre completo</span>
            <input id="u-nombre" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} className={CONTROL} placeholder="Ej: Carlos Martínez" />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Correo</span>
            <input id="u-email" type="email" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} className={CONTROL} placeholder="correo@empresa.com" autoComplete="off" />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Clave inicial (mínimo 8 caracteres)</span>
            <input id="u-clave" type="text" value={nuevo.clave} onChange={(e) => setNuevo({ ...nuevo, clave: e.target.value })} className={CONTROL} autoComplete="new-password" />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Rol</span>
            <select id="u-rol" value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value as Rol })} className={CONTROL}>
              {(Object.keys(NOMBRE_ROL) as Rol[]).map((r) => (
                <option key={r} value={r}>
                  {NOMBRE_ROL[r]}: {DESCRIPCION_ROL[r]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" disabled={guardando} className={`mt-4 ${BOTON_PRINCIPAL}`}>
          {guardando ? 'Creando…' : 'Crear usuario'}
        </button>
      </form>

      {error && <p role="alert" className="mt-4 rounded border border-alerta bg-alerta-suave px-4 py-3 text-sm font-medium text-alerta">{error}</p>}

      {/* Lista */}
      <section className="mt-6">
        {cargando ? (
          <p className="py-8 text-center text-acero">Cargando…</p>
        ) : (
          <ul className="divide-y divide-linea rounded-lg border border-linea bg-white">
            {usuarios.map((u) => (
              <li key={u.id} className={`px-4 py-3 ${u.activo ? '' : 'bg-concreto'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {u.nombre} {u.soy_yo && <span className="text-sm font-normal text-acero">(usted)</span>}
                      {!u.activo && <span className="ml-2 rounded bg-alerta px-2 py-0.5 text-xs font-semibold text-white">Inactivo</span>}
                    </p>
                    <p className="text-sm text-acero">
                      {u.email}
                      {u.ultimo_ingreso
                        ? `. Último ingreso: ${new Date(u.ultimo_ingreso).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`
                        : '. Aún no ha ingresado'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Rol de ${u.nombre}`}
                      value={u.rol}
                      disabled={u.soy_yo}
                      onChange={(e) => cambiar(u, { rol: e.target.value as Rol }, `Rol de ${u.nombre} actualizado`)}
                      className="rounded border border-linea bg-white px-2 py-1.5 text-sm"
                    >
                      {(Object.keys(NOMBRE_ROL) as Rol[]).map((r) => (
                        <option key={r} value={r}>
                          {NOMBRE_ROL[r]}
                        </option>
                      ))}
                    </select>
                    {(['nombre', 'clave'] as const).map((campo) => (
                      <button
                        key={campo}
                        onClick={() => {
                          const mismo = editando?.id === u.id && editando.campo === campo;
                          setEditando(mismo ? null : { id: u.id, campo });
                          setValorNuevo(campo === 'nombre' ? u.nombre : '');
                        }}
                        className="rounded border border-linea px-3 py-1.5 text-sm font-medium hover:border-tinta"
                      >
                        {campo === 'nombre' ? 'Cambiar nombre' : 'Cambiar clave'}
                      </button>
                    ))}
                    {!u.soy_yo && (
                      <button
                        onClick={() =>
                          cambiar(u, { activo: !u.activo }, u.activo ? `${u.nombre} ya no puede ingresar` : `${u.nombre} puede ingresar de nuevo`)
                        }
                        className={`rounded border px-3 py-1.5 text-sm font-medium ${u.activo ? 'border-alerta text-alerta hover:bg-alerta-suave' : 'border-tinta hover:bg-tinta hover:text-white'}`}
                      >
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </div>
                </div>
                {editando?.id === u.id && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      id={`editar-${u.id}`}
                      type="text"
                      value={valorNuevo}
                      onChange={(e) => setValorNuevo(e.target.value)}
                      placeholder={editando.campo === 'clave' ? 'Nueva clave (mínimo 8)' : 'Nombre completo'}
                      className="min-w-0 flex-1 rounded border border-linea px-3 py-2"
                      autoComplete="off"
                    />
                    <button
                      onClick={() => {
                        if (editando.campo === 'clave') cambiar(u, { clave: valorNuevo }, `Clave de ${u.nombre} cambiada`);
                        else cambiar(u, { nombre: valorNuevo }, 'Nombre actualizado');
                        setEditando(null);
                      }}
                      disabled={editando.campo === 'clave' ? valorNuevo.length < 8 : !valorNuevo.trim()}
                      className="rounded bg-tinta px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      Guardar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-acero">
          Un usuario desactivado no puede ingresar, pero sus movimientos se conservan en los informes con su nombre.
        </p>
      </section>

      {aviso && (
        <div role="status" className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[min(92vw,480px)] -translate-x-1/2 rounded-lg bg-poli px-4 py-3 text-center font-semibold text-tinta shadow-lg">
          {aviso}
        </div>
      )}
    </main>
  );
}
