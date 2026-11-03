'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export type Rol = 'admin' | 'bodeguero' | 'consulta';

export const NOMBRE_ROL: Record<Rol, string> = {
  admin: 'Administrador',
  bodeguero: 'Almacén',
  consulta: 'Consulta',
};

export interface Sesion {
  listo: boolean;
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  puedeEditar: boolean;
  esAdmin: boolean;
}

const VACIA: Sesion = {
  listo: false,
  id: '',
  email: '',
  nombre: '',
  rol: 'consulta',
  activo: false,
  puedeEditar: false,
  esAdmin: false,
};

// Verifica la sesión, trae el perfil (nombre y rol) y envía al login si no hay sesión.
export function useSesion(): Sesion {
  const router = useRouter();
  const [sesion, setSesion] = useState<Sesion>(VACIA);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!vivo) return;
      if (!data.session) {
        router.replace('/login');
        return;
      }
      const usuario = data.session.user;
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('nombre, rol, activo')
        .eq('id', usuario.id)
        .maybeSingle();
      if (!vivo) return;
      const rol = ((perfil?.rol as Rol) ?? 'consulta') as Rol;
      const activo = perfil?.activo !== false;
      setSesion({
        listo: true,
        id: usuario.id,
        email: usuario.email ?? '',
        nombre: perfil?.nombre || usuario.email || '',
        rol,
        activo,
        puedeEditar: activo && (rol === 'admin' || rol === 'bodeguero'),
        esAdmin: activo && rol === 'admin',
      });
    })();
    const { data: escucha } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) router.replace('/login');
    });
    return () => {
      vivo = false;
      escucha.subscription.unsubscribe();
    };
  }, [router]);

  return sesion;
}

// Token de la sesión, para llamar las rutas del servidor (usuarios, alertas)
export async function tokenSesion(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}
