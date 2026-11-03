'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const router = useRouter();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password: clave,
    });

    setEnviando(false);

    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos.'
          : error.message
      );
      return;
    }
    router.replace('/');
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={entrar} className="w-full max-w-sm border-t-4 border-poli bg-white p-6 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-blaster.png" alt="Blaster by Poliway" className="h-9 w-auto" />
        <h1 className="mb-6 text-2xl font-bold">Ingresar al inventario</h1>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium">Correo</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            className="w-full rounded border border-linea px-3 py-2.5 text-base focus:border-poli focus:outline-none focus:ring-2 focus:ring-poli/30"
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-1 block text-sm font-medium">Contraseña</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className="w-full rounded border border-linea px-3 py-2.5 text-base focus:border-poli focus:outline-none focus:ring-2 focus:ring-poli/30"
          />
        </label>

        {error && (
          <p role="alert" className="mb-4 rounded bg-alerta-suave px-3 py-2 text-sm font-medium text-alerta">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded bg-tinta px-4 py-3 font-semibold text-white hover:bg-poli hover:text-tinta disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
        >
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  );
}
