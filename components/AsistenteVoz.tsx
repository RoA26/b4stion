'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { numero, pesos, UNIDADES } from '@/lib/formato';
import { periodoEsteMes } from '@/lib/voz/fechas';
import { interpretar, leerEleccion, type Contexto, type Orden, type ProductoVoz } from '@/lib/voz/interpretar';
import { publicarOrden, useEscucharPantallas } from '@/lib/voz/bus';
import { responderSaber, type DatosBodega } from '@/lib/voz/saber';
import { limpiarFrase } from '@/lib/voz/interpretar';
import MiniDespiece, { type Ver } from '@/components/MiniDespiece';
import { responderInspeccion, type InspVoz } from '@/lib/voz/inspeccionVoz';
import { cargarAlertas, NOMBRE_GRUPO, ORDEN_GRUPO } from '@/lib/alertas';
import { exportarExcel, exportarPdf, type Columna } from '@/lib/exportar';
import type { ListaHablada, PasoHablado } from '@/lib/voz/saber';
import { sugerir } from '@/lib/voz/sugerir';
import { dejarPedidoPendiente } from '@/lib/archivoPendiente';

/* =====================================================================
   Asistente de voz "Blaster": botón de micrófono fijo en todas las
   pantallas. Se le habla (o escribe) una orden en español, la ejecuta
   dentro de la app y responde en el panel y en voz alta.
   No usa inteligencia artificial: reglas propias (lib/voz/interpretar).
   ===================================================================== */

interface Respuesta {
  texto: string;
  ok: boolean;
  lista?: string[];
  opciones?: ProductoVoz[];
  nota?: string;
  ver?: Ver; // pieza o cañón que se muestra en el dibujo
  tabla?: { columnas: string[]; filas: string[][] }; // para el PDF de la respuesta
  titulo?: string;
  leerLista?: boolean; // (ya no se usa: toda lista se lee completa)
  noLeer?: boolean; // la lista solo se muestra (la ayuda)
  vozIntro?: string; // cómo empieza a hablar antes de leer la lista
  sugerencias?: string[]; // "¿Quiso decir…?"
  vozFinal?: string; // lo que dice después de leer la lista (una pregunta, por ejemplo)
  vozCubre?: boolean; // la voz propia puede reemplazar la lectura de la lista (catálogo)
}
// Lo que se ve en pantalla se dice más natural: sin viñetas, rayas ni códigos entre paréntesis
const paraHablar = (t: string) =>
  t
    .replace(/\s*\((?=[^)]*\d)[A-Z0-9][A-Z0-9\-/. ]*\)/g, '')
    .replace(/\s*·\s*/g, ', ')
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
// El navegador corta las frases muy largas: se habla por pedazos de unas 200 letras
function partirParaHablar(t: string): string[] {
  const frases = t.split(/(?<=[.;:!?])\s+/);
  const out: string[] = [];
  let actual = '';
  for (const f of frases) {
    if (actual && (actual + ' ' + f).length > 200) {
      out.push(actual);
      actual = f;
    } else actual = actual ? `${actual} ${f}` : f;
  }
  if (actual) out.push(actual);
  return out.length ? out : [t];
}
// Última respuesta con información, para «genérame un PDF de eso»
interface UltimaRespuesta {
  titulo: string;
  pregunta: string;
  texto: string;
  lista?: string[];
  tabla?: { columnas: string[]; filas: string[][] };
}
interface Historia {
  texto: string;
  ok: boolean;
  hora: string;
}
interface Perfil {
  rol: 'admin' | 'bodeguero' | 'consulta';
  puedeEditar: boolean;
  esAdmin: boolean;
}
type Pendiente = { orden: Extract<Orden, { candidatos: ProductoVoz[] }>; opciones: ProductoVoz[] } | null;

// Tipos mínimos del reconocimiento de voz del navegador (Chrome y Edge)
interface ResultadoVoz {
  isFinal: boolean;
  0: { transcript: string };
}
interface Reconocedor {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ResultadoVoz> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

const CLAVE_HISTORIAL = 'poliway.blaster.historial';
const CLAVE_SILENCIO = 'poliway.blaster.silencio';

const ERRORES_MIC: Record<string, string> = {
  'not-allowed': 'El micrófono está bloqueado. Haga clic en el candado junto a la dirección de la página, permita el micrófono y vuelva a intentar.',
  'service-not-allowed': 'El navegador no permite usar el micrófono en esta página. Use Chrome o Edge.',
  'audio-capture': 'No se encontró un micrófono. Conecte uno o revise que no lo esté usando otro programa.',
  network: 'Sin internet: el reconocimiento de voz necesita conexión. Puede escribir la orden.',
  'no-speech': 'No le escuché. Toque el micrófono y hable más cerca.',
  aborted: '',
};

const EJEMPLOS = [
  '¿Cuántos pistones Destroyer hay?',
  '¿Qué mercancía falta por reponer?',
  '¿Cuál ha sido el movimiento de los niples?',
  '¿Dónde están los pistones?',
  '¿Quién nos ha prestado?',
  '¿Cuántas piezas tiene el Capol?',
  '¿Para qué sirve el diafragma?',
  'Salida de 2 pistones Destroyer para Andrés, área mantenimiento',
  'Entrada de 10 tornillos 736 a 3.500, factura 123',
  'Inventario de repuestos XHV en PDF',
  '¿Qué se le entregó a Andrés este mes?',
  'Abre cañones XHV',
];

const AYUDA = [
  'Consultas: «¿Cuántos pistones Destroyer hay?», «¿Qué está en el mínimo?», «¿Qué está agotado?», «¿Cuánto vale el inventario?» o «¿cuánto vale lo de XHV?».',
  'Entregas: «¿Qué se le entregó a Andrés este mes?», «¿Qué se llevó mantenimiento en octubre?», «¿Cuántos pistones salieron la semana pasada?».',
  'Equipos: «¿Qué repuestos lleva el cañón de Cementos?».',
  'Entradas y salidas: «Salida de 2 pistones Destroyer para Andrés Gómez, área mantenimiento», «Entrada de 10 tornillos 736 a 3.500, factura 123». Llena el formulario; usted revisa y dice «confirmar».',
  'Conteo físico (con un conteo abierto): «Pistón Destroyer 4», «O-ring 261, 12», «Suma 2 tornillos 736».',
  'Informes: «Inventario de repuestos XHV en PDF», «Compras sugeridas en Excel», «Movimientos de octubre», «Salidas de Andrés del mes pasado en PDF».',
  'Etiquetas: «Etiquetas de los repuestos Capol», «Imprime etiquetas del pistón Destroyer».',
  'Cañones y piezas: «¿Cuántas piezas tiene el Capol?», «Nómbrame las piezas del XHV», «¿Para qué sirve el diafragma?», «¿En qué cañones va el 387?», «¿Qué piezas del Destroyer están agotadas?», «¿Cuánto vale un juego completo del XHV?», «¿Cuál es la pieza 5 del Capol?», «¿Cómo funciona un cañón de aire?».',
  'Datos técnicos: «Medidas del Destroyer», «Tiempo de descarga», «¿A qué presión trabaja?», «Garantía», «Boquillas», «Contacto de Poliway», «¿Qué precauciones antes de desarmar?», «Mantenimiento del cañón».',
  'Armado: «¿Cómo se arma el Capol?» muestra paso a paso, en el dibujo, cómo se arma el cañón (con pausa, anterior y siguiente).',
  'Voz: Blaster lee todo lo que sale en pantalla. Mientras habla, use ⏹ Parar para callarlo, ⏸ Pausa y ▶ Seguir; ⏮ Repetir (o diga «repite») vuelve a decir la última respuesta. Si no le entiende, le propone la pregunta más parecida: diga «sí».',
  'Pedidos de Brasil: «¿Qué viene en camino?», «¿En qué va el pedido 4521?», «¿Qué viene en el contenedor?».',
  '¿Dónde está?: «¿Dónde están las válvulas?», «¿Ya llegaron los sellos?», «¿Todavía están en Brasil los pistones?», «¿Cuándo llegan los amortiguadores?» (bodega, prestado, en Brasil, en tránsito, en aduana o ya llegó).',
  'Préstamos: «¿Quién nos ha prestado?», «¿A quién le hemos prestado?», «¿Qué nos prestó Argos?», «¿Quién tiene válvulas prestadas?», «¿Qué préstamos están vencidos?», «¿Qué tenemos que devolver esta semana?», «¿Cuál préstamo no tiene acta firmada?».',
  'Movimiento de un producto: «¿Cuál ha sido el movimiento de los niples?», «Kárdex del amortiguador en octubre», «¿Qué ha pasado con el pistón?» (entradas, a quién salió y cuánto queda).',
  'Lo que falta: «¿Qué mercancía falta por reponer?», «¿Qué se está acabando?», «¿Qué toca comprar?». Si es administrador, Blaster le ofrece armar el pedido a Brasil.',
  'Inspecciones: «¿Dónde están las tapas dañadas?», «¿Qué cañones tienen fugas?», «¿Qué fallas hay en el Horno?», «¿Cómo está el cañón A01-21?», «¿Qué cañones fallan seguido?», «¿Cuáles no se han inspeccionado?», «¿Cómo fue la última ronda?».',
  'Movimientos: «¿Cuáles son los últimos artículos que han salido?», «¿Qué movimientos hubo hoy?», «¿Qué ha pedido Andrés?», «¿Qué ha pedido el taller de cañones este mes?», «¿Qué es lo que más sale?», «¿Quién pide más?», «¿Qué área gasta más?», «¿Qué entró esta semana?», «¿Qué ha salido de la bodega 2?».',
  'Alertas: «¿Qué alertas hay?», «¿Qué hay pendiente?» (también en la campanita 🔔 de arriba).',
  'PDF o Excel de cualquier respuesta: después de preguntar, diga «Genérame un PDF de eso» o «Pásalo a Excel».',
  'Pantallas: «Abre conteo», «Abre cañones XHV», «Equipos instalados», «Inicio».',
  'Asistente: «Modo conversación» (escucha seguido; se sale con «terminar»), «Silencio» o «Habla».',
];

function leerLocal<T>(clave: string, defecto: T): T {
  try {
    const v = localStorage.getItem(clave);
    return v ? (JSON.parse(v) as T) : defecto;
  } catch {
    return defecto;
  }
}
function guardarLocal(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}
const hora = () => new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
const und = (u: string) => UNIDADES[u] ?? u.toLowerCase();
const limpiarNombre = (s: string) => s.replace(/\s*\(demo\)/i, '');
const hoyISO = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const diasHasta = (f: string | null) =>
  f ? Math.round((new Date(`${f.slice(0, 10)}T12:00:00`).getTime() - new Date(`${hoyISO()}T12:00:00`).getTime()) / 86400e3) : null;
const fechaLarga = (f: string) => new Date(`${f.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
const fechaCorta = (f: string) => new Date(`${f.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
const dia = (f: string) => new Date(f).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;
const cuandoLlega = (eta: string | null) => {
  const d = diasHasta(eta);
  if (d == null || !eta) return 'sin fecha de llegada';
  if (d < 0) return `debía llegar el ${fechaLarga(eta)} (atrasado ${dias(-d)})`;
  if (d === 0) return 'llega hoy';
  if (d === 1) return 'llega mañana';
  return `llega aprox. el ${fechaLarga(eta)} (en ${dias(d)})`;
};
// Etapas de un pedido a Brasil, dichas como pregunta "¿dónde está?"
const ETAPA_DONDE: Record<string, string> = {
  PEDIDO: 'pedido a Brasil, todavía no ha salido de allá',
  SALIO: 'ya salió de Brasil',
  TRANSITO: 'en tránsito, viene en camino',
  ADUANA: 'en la aduana en Colombia',
};
interface FilaTransito {
  transito_id: number;
  numero: string;
  proveedor: string;
  estado: string;
  fecha_salida: string | null;
  eta: string | null;
  nacionalizado: string | null;
  producto_id: string | null;
  sku: string;
  producto: string;
  unidad_medida: string;
  cantidad: number;
  recibido: number | null;
}
// Pedidos a Brasil sin costos (script 14): los ve cualquier usuario
async function cargarTransito(productoId?: string): Promise<FilaTransito[]> {
  const { data, error } = await supabase.rpc('transito_sin_costos', productoId ? { p_producto_id: productoId } : {});
  if (error) throw new Error(/function|could not find|does not exist/i.test(error.message) ? 'Para ver los pedidos de Brasil falta ejecutar el script 14 en Supabase.' : error.message);
  return ((data ?? []) as FilaTransito[]).map((f) => ({ ...f, cantidad: Number(f.cantidad), recibido: f.recibido == null ? null : Number(f.recibido) }));
}
interface Mov {
  fecha: string;
  tipo: string;
  sku: string;
  producto: string;
  cantidad: number;
  unidad_medida: string;
  funcionario: string | null;
  area: string | null;
  cliente: string | null;
  equipo: string | null;
  proveedor: string | null;
  ubicacion: string | null;
  documento_ref: string | null;
  destino: string | null;
}
const esPrestamo = (m: Mov) => m.destino === 'PRESTAMO' || /^pr[eé]stamo/i.test(m.documento_ref ?? '');
const quienMov = (m: Mov) =>
  m.tipo === 'ENTRADA'
    ? m.proveedor ?? m.documento_ref ?? 'Entrada'
    : esPrestamo(m)
      ? `Préstamo${m.documento_ref ? ` (${m.documento_ref})` : ''}`
      : m.funcionario
        ? `${limpiarNombre(m.funcionario)}${m.area ? ` · ${m.area}` : ''}`
        : m.cliente
          ? `${limpiarNombre(m.cliente)}${m.equipo ? ` · ${m.equipo}` : ''}`
          : m.tipo === 'AJUSTE'
            ? 'Ajuste de conteo'
            : '—';

export default function AsistenteVoz() {
  const ruta = usePathname();
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [parcial, setParcial] = useState('');
  const [entrada, setEntrada] = useState('');
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);
  const [historial, setHistorial] = useState<Historia[]>([]);
  const [silencio, setSilencio] = useState(false);
  const [conversacion, setConversacion] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [soportaVoz, setSoportaVoz] = useState(true);

  const ctx = useRef<Contexto | null>(null);
  const pendiente = useRef<Pendiente>(null);
  // Pregunta de sí o no que dejó el asistente ("¿Quiere que se las nombre?")
  const pendienteSi = useRef<ListaHablada | null>(null);
  // Acción que espera un "sí" (por ejemplo, mover un pedido de etapa)
  const accionSi = useRef<{ hacer: () => Promise<string>; ruta?: string } | null>(null);
  // Pregunta que Blaster sugirió cuando no entendió ("¿Quiso decir…?")
  const sugerida = useRef<string | null>(null);
  const turnoVoz = useRef(0); // para cortar una lectura larga cuando el usuario vuelve a hablar
  const ultimaVoz = useRef<{ texto: string; partes?: PasoHablado[] } | null>(null);
  const [hablando, setHablando] = useState(false);
  const [pausado, setPausado] = useState(false);
  const reconocedor = useRef<Reconocedor | null>(null);
  const textoFinal = useRef('');
  const fallos = useRef(0);
  const conversacionRef = useRef(false);
  const silencioRef = useRef(false);
  const abiertoRef = useRef(false);
  conversacionRef.current = conversacion;
  silencioRef.current = silencio;
  abiertoRef.current = abierto;

  /* ------------------------- Sesión y datos ------------------------- */

  useEffect(() => {
    setHistorial(leerLocal<Historia[]>(CLAVE_HISTORIAL, []));
    setSilencio(leerLocal<boolean>(CLAVE_SILENCIO, false));
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSoportaVoz(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    let vivo = true;
    async function revisar() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return vivo && setPerfil(null);
      const { data: p } = await supabase.from('perfiles').select('rol, activo').eq('id', data.session.user.id).maybeSingle();
      if (!vivo) return;
      const rol = (p?.rol ?? 'consulta') as Perfil['rol'];
      const activo = p?.activo !== false;
      setPerfil({ rol, puedeEditar: activo && (rol === 'admin' || rol === 'bodeguero'), esAdmin: activo && rol === 'admin' });
    }
    revisar();
    const { data: escucha } = supabase.auth.onAuthStateChange(() => revisar());
    return () => {
      vivo = false;
      escucha.subscription.unsubscribe();
    };
  }, []);

  // Catálogo, listas y equipos: se cargan al abrir el panel (así siempre están al día)
  const cargarContexto = useCallback(async () => {
    const [inv, cats, func, ars, clis, ubic, eqs] = await Promise.all([
      supabase.from('v_inventario').select('producto_id, sku, codigo_barras, nombre, categoria, unidad_medida'),
      supabase.from('categorias').select('nombre'),
      supabase.from('funcionarios').select('id, nombre').eq('activo', true),
      supabase.from('areas').select('id, nombre').eq('activo', true),
      supabase.from('clientes').select('id, nombre').eq('activo', true),
      supabase.from('ubicaciones').select('id, nombre').eq('activo', true),
      supabase.from('equipos').select('id, cliente_id, modelo, serial, planta').eq('activo', true),
    ]);
    const pres = await supabase.from('v_prestamos').select('empresa');
    const productos = new Map<string, ProductoVoz>();
    (inv.data ?? []).forEach((f) =>
      productos.set(f.producto_id, {
        id: f.producto_id,
        sku: f.sku,
        codigo_barras: f.codigo_barras,
        nombre: f.nombre,
        categoria: f.categoria,
        unidad_medida: f.unidad_medida,
      })
    );
    ctx.current = {
      productos: [...productos.values()],
      categorias: (cats.data ?? []).map((c) => c.nombre as string),
      funcionarios: func.data ?? [],
      areas: ars.data ?? [],
      clientes: clis.data ?? [],
      ubicaciones: ubic.data ?? [],
      equipos: (eqs.data ?? []) as Contexto['equipos'],
      empresas: [...new Set(((pres.data ?? []) as { empresa: string }[]).map((x) => x.empresa))],
      ruta: '/',
    };
  }, []);

  /* ------------------------------ Voz ------------------------------ */

  const escucharRef = useRef<() => void>(() => {});

  const rutaRef = useRef(ruta);
  rutaRef.current = ruta;
  // Muestra una pieza: en el panel y, si está abierta la pantalla Cañones, en el dibujo grande
  const mostrar = useCallback((ver: Ver | undefined) => {
    if (!ver) return;
    setRespuesta((r) => (r ? { ...r, ver } : r));
    if (rutaRef.current === '/canones') publicarOrden('canon', ver);
  }, []);

  // Habla una o varias partes seguidas; al empezar cada parte se resalta su pieza
  const hablar = useCallback(
    (texto: string, partes?: PasoHablado[]) => {
      const turno = ++turnoVoz.current;
      if (texto || partes?.length) ultimaVoz.current = { texto, partes };
      setPausado(false);
      const seguir = () => {
        if (turno !== turnoVoz.current) return;
        setHablando(false);
        if (conversacionRef.current && abiertoRef.current) setTimeout(() => escucharRef.current(), 250);
      };
      const lista = partes?.length ? partes : partirParaHablar(texto).map((x) => ({ texto: x, ver: undefined as unknown as Ver }));
      const sinVoz = silencioRef.current || typeof window === 'undefined' || !('speechSynthesis' in window);
      if (sinVoz) {
        // Sin voz: se recorren las piezas en pantalla, una cada 1,5 segundos
        if (partes?.length) {
          partes.forEach((p, i) =>
            setTimeout(() => {
              if (turno === turnoVoz.current) mostrar(p.ver);
            }, i * 1500)
          );
          setTimeout(seguir, partes.length * 1500);
        } else seguir();
        return;
      }
      const s = window.speechSynthesis;
      s.cancel();
      if (s.paused) s.resume();
      setHablando(true);
      const voces = s.getVoices();
      const voz = voces.find((v) => v.lang === 'es-CO') ?? voces.find((v) => v.lang.startsWith('es-')) ?? null;
      lista.forEach((p, i) => {
        const u = new SpeechSynthesisUtterance(p.texto.replace(/[«»"]/g, '').replace(/\b(1|un|una) und\b/g, '$1 unidad').replace(/\bund\b/g, 'unidades'));
        u.lang = 'es-CO';
        u.voice = voz;
        u.rate = 1.05;
        u.onstart = () => {
          if (turno === turnoVoz.current && p.ver) mostrar(p.ver);
        };
        if (i === lista.length - 1) {
          u.onend = seguir;
          u.onerror = seguir;
        }
        s.speak(u);
      });
    },
    [mostrar]
  );

  const ultima = useRef<UltimaRespuesta | null>(null);
  const noGuardarUltima = useRef(false);

  const responder = useCallback(
    (r: Respuesta, voz?: string, frase?: string, partes?: PasoHablado[]) => {
      setRespuesta(r);
      // Se guarda la última respuesta con información, para poder sacarla en PDF
      if (noGuardarUltima.current) noGuardarUltima.current = false;
      else if (frase && r.ok && (r.lista?.length || r.tabla || r.texto.length > 30))
        ultima.current = { titulo: r.titulo ?? 'Consulta a Blaster', pregunta: frase, texto: r.texto, lista: r.lista, tabla: r.tabla };
      if (r.ver && rutaRef.current === '/canones') publicarOrden('canon', r.ver);
      if (frase) {
        setHistorial((h) => {
          const n = [{ texto: frase, ok: r.ok, hora: hora() }, ...h.filter((x) => x.texto !== frase)].slice(0, 20);
          guardarLocal(CLAVE_HISTORIAL, n);
          return n;
        });
      }
      if (voz === '') return; // la pantalla responde cuando termine (registro, conteo)
      // Todo lo que sale en pantalla se lee completo, de una vez (se corta con ⏹ Parar)
      if (r.lista?.length && !r.noLeer && !partes) {
        const unida = r.lista.map((x) => paraHablar(x).replace(/[.;:,]\s*$/, '')).join('. ');
        // Solo el catálogo (saber) trae una voz que ya dice toda la lista
        const vozCubre = !!voz && !r.vozIntro && !!r.vozCubre && paraHablar(voz).length >= unida.length * 0.6;
        if (!vozCubre) {
          const intro = paraHablar(r.vozIntro ?? r.texto).replace(/:\s*$/, '.');
          return hablar(`${intro} ${unida}.${r.vozFinal ? ` ${r.vozFinal}` : ''}`);
        }
      }
      if (r.vozFinal) return hablar(`${voz ?? r.texto} ${r.vozFinal}`);
      hablar(voz ?? r.texto, partes);
    },
    [hablar]
  );

  // Las pantallas avisan cómo terminó una orden (registro hecho, conteo guardado…)
  useEscucharPantallas((texto, ok) => {
    if (abiertoRef.current) responder({ texto, ok });
  });

  /* ------------------------- Ejecutar órdenes ------------------------- */

  const ejecutar = useCallback(
    async (frase: string): Promise<void> => {
      const texto = frase.trim();
      if (!texto) return;
      setParcial('');
      setEntrada('');
      if (!ctx.current) await cargarContexto();
      const c = { ...ctx.current!, ruta };

      // ¿Está confirmando una acción que el asistente preguntó?
      const accion = accionSi.current;
      accionSi.current = null;
      if (accion) {
        const r = limpiarFrase(texto);
        if (/^(si|claro|dale|de una|bueno|hagale|okey|confirmo|confirmar|confirma|correcto|listo|adelante|si senor|hazlo|marcalo)( (por favor|senor|claro))?$/.test(r)) {
          setTrabajando(true);
          try {
            const t = await accion.hacer();
            return responder({ texto: t, ok: true }, t, texto);
          } catch (e) {
            return responder({ texto: (e as Error).message, ok: false }, undefined, texto);
          } finally {
            setTrabajando(false);
          }
        }
        if (/^(no|no gracias|no senor|cancela|cancelar|despues|luego|dejalo asi)$/.test(r)) return responder({ texto: 'Listo, no lo cambié.', ok: true }, undefined, texto);
      }

      // ¿Acepta la pregunta que Blaster le sugirió?
      const sug = sugerida.current;
      sugerida.current = null;
      if (sug) {
        const r = limpiarFrase(texto);
        if (/^(si|claro|dale|de una|bueno|hagale|okey|correcto|eso|esa|exacto|si senor|si esa|si eso)( (por favor|senor|claro))?$/.test(r)) return ejecutarRef.current(sug);
      }

      // ¿Está respondiendo sí o no a una pregunta del asistente?
      const si = pendienteSi.current;
      pendienteSi.current = null;
      if (si) {
        const r = limpiarFrase(texto);
        if (!r || /^(si|claro|dale|de una|bueno|hagale|okey|nombralas|nombralos|nombrelas|nombrelos|por supuesto|si senor|adelante|listo)( (por favor|senor|claro))?$/.test(r))
          return responder({ texto: si.texto, ok: true, lista: si.lista, ver: si.ver }, si.voz, texto, si.secuencia);
        if (/^(no|no gracias|no senor|despues|luego|asi esta bien)$/.test(r)) return responder({ texto: 'Listo.', ok: true }, undefined, texto);
      }

      // ¿Está escogiendo una de las opciones que se le dieron?
      let orden: Orden;
      const p = pendiente.current;
      const eleccion = p ? leerEleccion(texto, p.opciones.length) : null;
      if (p && eleccion != null) orden = { ...p.orden, candidatos: [p.opciones[eleccion]] } as Orden;
      else if (p && (p.orden.tipo === 'kardex' || p.orden.tipo === 'donde') && /^(todos|todas|todos ellos|de todos|los dos|las dos|ambos|todos los anteriores)$/.test(limpiarFrase(texto)))
        orden = { ...p.orden, candidatos: p.opciones, todos: true } as Orden;
      else orden = interpretar(texto, c);
      pendiente.current = null;

      setTrabajando(true);
      try {
        await atender(orden, texto, c);
      } catch (e) {
        responder({ texto: `Algo falló: ${(e as Error).message}`, ok: false }, 'Algo falló. Intente de nuevo.', texto);
      }
      setTrabajando(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ruta, perfil, cargarContexto, responder]
  );

  function pedirEleccion(orden: NonNullable<Pendiente>['orden'], opciones: ProductoVoz[], frase: string) {
    pendiente.current = { orden, opciones };
    const lista = opciones.map((p, i) => `${i + 1}. ${p.nombre}${p.categoria ? ` (${p.categoria})` : ''}`);
    const conTodos = orden.tipo === 'kardex' || orden.tipo === 'donde';
    responder(
      {
        texto: `Encontré ${opciones.length} productos parecidos. ¿Cuál? Diga el número o tóquelo${conTodos ? ', o diga «todos»' : ''}.`,
        ok: true,
        opciones,
        sugerencias: conTodos ? ['todos'] : undefined,
      },
      `Encontré ${opciones.length}. ${lista.map((l) => l.replace(/\s*\(.*?\)/, '')).join('. ')}. ¿Cuál?${conTodos ? ' O diga todos.' : ''}`,
      frase
    );
  }

  const noPuede = (frase: string, que: string) =>
    responder({ texto: `Su usuario es de consulta: no puede ${que}. Puede preguntar y sacar informes.`, ok: false }, undefined, frase);

  function ir(destino: string) {
    if (ruta !== destino) router.push(destino);
  }

  // Deja listo el pedido a Brasil (solo administrador): Blaster pregunta y con "sí" abre ➕ Registrar con el pedido armado
  async function ofrecerPedido(items: { sku: string; nombre: string; cantidad: number }[]): Promise<string | undefined> {
    if (!perfil?.esAdmin || !items.length) return undefined;
    accionSi.current = {
      hacer: async () => {
        const { data } = await supabase.rpc('costos_productos');
        const costos = new Map(((data ?? []) as { sku: string; costo_unitario: number }[]).map((x) => [x.sku, Number(x.costo_unitario ?? 0)]));
        dejarPedidoPendiente(items.map((x) => ({ codigo: x.sku, descripcion: x.nombre, cantidad: x.cantidad, valor: (costos.get(x.sku) ?? 0) > 0 ? costos.get(x.sku)! : null })));
        if (rutaRef.current === '/admin') {
          router.push('/');
          setTimeout(() => router.push('/admin'), 400);
        } else router.push('/admin');
        return `Listo: abrí Administración con el pedido a Brasil de ${items.length} ${items.length === 1 ? 'producto' : 'productos'}. Revise las cantidades, póngale el número y guárdelo.`;
      },
    };
    return `¿Le armo el pedido a Brasil con ${items.length === 1 ? 'ese producto' : `esos ${items.length} productos`}? Diga sí.`;
  }

  async function atender(orden: Orden, frase: string, c: Contexto): Promise<void> {
    const editar = !!perfil?.puedeEditar;
    // Los valores en pesos solo se le dicen al administrador
    const plata = (v: number) => (perfil?.esAdmin && v > 0 ? `, por ${pesos.format(v)}` : '');
    switch (orden.tipo) {
      case 'ayuda':
        return responder({ texto: 'Esto es lo que entiendo:', ok: true, lista: AYUDA, noLeer: true }, 'Le muestro en pantalla lo que entiendo.', frase);

      case 'conversacion':
        setConversacion(orden.activar);
        conversacionRef.current = orden.activar;
        fallos.current = 0;
        return responder(
          { texto: orden.activar ? 'Modo conversación activado: después de cada respuesta vuelvo a escuchar. Diga «terminar» para salir.' : 'Modo conversación terminado.', ok: true },
          orden.activar ? 'Modo conversación activado.' : 'Listo, terminamos.',
          frase
        );

      case 'silencio':
        setSilencio(orden.activar);
        silencioRef.current = orden.activar;
        guardarLocal(CLAVE_SILENCIO, orden.activar);
        return responder({ texto: orden.activar ? 'Listo, respondo solo en pantalla.' : 'Listo, vuelvo a hablar.', ok: true }, undefined, frase);

      case 'confirmar':
        if (ruta !== '/escanear') return responder({ texto: 'No hay ningún movimiento esperando confirmación.', ok: false }, undefined, frase);
        publicarOrden('confirmar');
        return responder({ texto: 'Registrando…', ok: true }, '', frase);

      case 'cancelar':
        if (ruta === '/escanear') publicarOrden('cancelar');
        return responder({ texto: 'Cancelado.', ok: true }, undefined, frase);

      case 'navegar': {
        const soloEditar = ['/conteo', '/etiquetas', '/listas', '/prestamos'];
        const soloAdmin = ['/importar', '/usuarios', '/admin'];
        if (soloEditar.includes(orden.ruta) && !editar) return noPuede(frase, `abrir ${orden.nombre}`);
        if (soloAdmin.includes(orden.ruta) && !perfil?.esAdmin)
          return responder({ texto: `${orden.nombre} es solo para el administrador.`, ok: false }, undefined, frase);
        ir(orden.ruta);
        if (orden.modelo) publicarOrden('canon', { modelo: orden.modelo });
        const extra = orden.modelo ? ` ${orden.modelo.toUpperCase().replace('DESTROYER', 'Destroyer').replace('CAPOL', 'Capol')}` : '';
        return responder({ texto: `Abriendo ${orden.nombre}${extra}.`, ok: true }, undefined, frase);
      }

      case 'existencia': {
        if (orden.candidatos.length > 1) return pedirEleccion(orden, orden.candidatos, frase);
        const p = orden.candidatos[0];
        const { data } = await supabase.from('v_inventario').select('ubicacion, cantidad, stock_minimo').eq('producto_id', p.id);
        const filas = (data ?? []).map((f) => ({ ubicacion: f.ubicacion as string | null, cantidad: Number(f.cantidad ?? 0), minimo: Number(f.stock_minimo ?? 0) }));
        const total = filas.reduce((a, f) => a + f.cantidad, 0);
        const minimo = filas[0]?.minimo ?? 0;
        const u = und(p.unidad_medida);
        const porUbic = filas.filter((f) => f.ubicacion && f.cantidad > 0);
        const estado = total <= 0 ? 'Está agotado.' : minimo > 0 && total <= minimo ? `Está en el mínimo (${numero.format(minimo)}).` : minimo > 0 ? `El mínimo es ${numero.format(minimo)}.` : '';
        return responder(
          {
            texto: `${p.nombre} (${p.sku}): ${total > 0 ? `hay ${numero.format(total)} ${u}` : 'no hay existencia'}. ${estado}`,
            ok: true,
            lista: porUbic.length > 1 ? porUbic.map((f) => `${limpiarNombre(f.ubicacion ?? '')}: ${numero.format(f.cantidad)} ${u}`) : undefined,
            vozIntro: `${total > 0 ? `Hay ${numero.format(total)} ${u}` : 'No hay'} de ${p.nombre}. ${estado}${porUbic.length > 1 ? ' Por bodega:' : ''}`,
          },
          `${total > 0 ? `Hay ${numero.format(total)} ${u}` : 'No hay'} de ${p.nombre}. ${estado}`,
          frase
        );
      }

      case 'valor': {
        if (!perfil?.esAdmin) return responder({ texto: 'Los valores del inventario solo los ve el administrador.', ok: false }, undefined, frase);
        let q = supabase.from('v_inventario').select('producto_id, cantidad, valor_total, categoria');
        if (orden.categoria) q = q.eq('categoria', orden.categoria);
        const { data } = await q;
        const valor = (data ?? []).reduce((a, f) => a + Number(f.valor_total ?? 0), 0);
        const conExistencia = new Set((data ?? []).filter((f) => Number(f.cantidad) > 0).map((f) => f.producto_id)).size;
        const de = orden.categoria ? `de ${orden.categoria}` : 'en bodega';
        return responder(
          { texto: `El inventario ${de} vale ${pesos.format(valor)}, en ${conExistencia} referencias con existencia.`, ok: true },
          `El inventario ${de} vale ${pesos.format(valor)}.`,
          frase
        );
      }

      case 'minimo': {
        let q = supabase.from('v_inventario').select('producto_id, sku, nombre, cantidad, stock_minimo, unidad_medida, categoria');
        if (orden.categoria) q = q.eq('categoria', orden.categoria);
        const [{ data }, tr] = await Promise.all([q, cargarTransito().catch(() => [] as FilaTransito[])]);
        // Lo que ya viene de Brasil
        const viene = new Map<string, number>();
        tr.filter((x) => x.estado !== 'NACIONALIZADO').forEach((x) => viene.set(x.sku, (viene.get(x.sku) ?? 0) + x.cantidad));
        const porSku = new Map<string, { sku: string; nombre: string; cantidad: number; minimo: number; unidad: string }>();
        (data ?? []).forEach((f) => {
          const x = porSku.get(f.sku) ?? { sku: f.sku, nombre: f.nombre, cantidad: 0, minimo: Number(f.stock_minimo ?? 0), unidad: f.unidad_medida };
          x.cantidad += Number(f.cantidad ?? 0);
          porSku.set(f.sku, x);
        });
        const lista = [...porSku.values()]
          .filter((x) => (orden.agotados ? x.cantidad <= 0 && x.minimo > 0 : x.minimo > 0 && x.cantidad <= x.minimo))
          .sort((a, b) => a.cantidad / a.minimo - b.cantidad / b.minimo);
        const que = orden.agotados ? 'agotados' : 'en el stock mínimo';
        const de = orden.categoria ? ` de ${orden.categoria}` : '';
        if (!lista.length)
          return responder({ texto: `No hay productos${de} ${que}. (Solo cuentan los que tienen un mínimo definido.)`, ok: true }, `No hay productos${de} ${que}.`, frase);
        // Para el pedido: hasta el doble del mínimo, descontando lo que ya viene en camino
        const porPedir = lista
          .map((x) => {
            const bruto = Math.max(0, x.minimo * 2 - x.cantidad - (viene.get(x.sku) ?? 0));
            return { sku: x.sku, nombre: x.nombre, cantidad: ['M', 'M2', 'KG'].includes(x.unidad) ? Math.round(bruto * 100) / 100 : Math.ceil(bruto) };
          })
          .filter((x) => x.cantidad > 0);
        const pregunta = await ofrecerPedido(porPedir);
        return responder(
          {
            texto: `${lista.length} ${lista.length === 1 ? 'producto está' : 'productos están'}${de} ${que}:`,
            ok: true,
            lista: lista.map(
              (x) =>
                `${x.nombre}: ${x.cantidad <= 0 ? 'agotado' : `hay ${numero.format(x.cantidad)} ${und(x.unidad)}`}, mínimo ${numero.format(x.minimo)}${viene.get(x.sku) ? `; vienen ${numero.format(viene.get(x.sku)!)} de Brasil` : ''}`
            ),
            vozFinal: pregunta,
            nota: pregunta ? 'Diga «sí» y le dejo armado el pedido a Brasil en Administración.' : undefined,
            titulo: `Productos ${que}`,
          },
          `${lista.length} ${lista.length === 1 ? 'producto está' : 'productos están'} ${que}. ${lista
            .slice(0, 4)
            .map((x) => x.nombre)
            .join(', ')}${lista.length > 4 ? ', y otros' : ''}.`,
          frase
        );
      }

      case 'entregas': {
        if (orden.candidatos.length > 1 && orden.candidatos.length <= 6 && !orden.funcionario && !orden.area && !orden.cliente)
          return pedirEleccion(orden, orden.candidatos, frase);
        const periodo = orden.periodo ?? periodoEsteMes();
        let q = supabase
          .from('v_movimientos')
          .select('sku, producto, cantidad, unidad_medida, valor, funcionario, area, cliente, categoria')
          .eq('tipo', 'SALIDA')
          .gte('fecha', `${periodo.desde}T00:00:00-05:00`)
          .lte('fecha', `${periodo.hasta}T23:59:59-05:00`)
          .limit(5000);
        if (orden.funcionario) q = q.eq('funcionario', orden.funcionario.nombre);
        if (orden.area) q = q.eq('area', orden.area.nombre);
        if (orden.cliente) q = q.eq('cliente', orden.cliente.nombre);
        if (orden.categoria) q = q.eq('categoria', orden.categoria);
        if (orden.candidatos.length === 1) q = q.eq('sku', orden.candidatos[0].sku);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        const quien = [orden.funcionario && limpiarNombre(orden.funcionario.nombre), orden.area && `el área ${orden.area.nombre}`, orden.cliente && limpiarNombre(orden.cliente.nombre)]
          .filter(Boolean)
          .join(', ');
        const titulo = `${orden.candidatos.length === 1 ? `Salidas de ${orden.candidatos[0].nombre}` : 'Entregas'}${quien ? ` a ${quien}` : ''}${orden.categoria ? ` (${orden.categoria})` : ''}, ${periodo.texto}`;
        if (!data?.length) return responder({ texto: `${titulo}: no hay salidas registradas.`, ok: true }, undefined, frase);
        const porProducto = new Map<string, { producto: string; cantidad: number; unidad: string; valor: number }>();
        data.forEach((m) => {
          const x = porProducto.get(m.sku) ?? { producto: m.producto, cantidad: 0, unidad: m.unidad_medida, valor: 0 };
          x.cantidad += Math.abs(Number(m.cantidad ?? 0));
          x.valor += Number(m.valor ?? 0);
          porProducto.set(m.sku, x);
        });
        const lista = [...porProducto.values()].sort((a, b) => b.valor - a.valor || b.cantidad - a.cantidad);
        const valor = lista.reduce((a, x) => a + x.valor, 0);
        return responder(
          {
            texto: `${titulo}: ${data.length} ${data.length === 1 ? 'salida' : 'salidas'}${plata(valor)}.`,
            ok: true,
            leerLista: true,
            lista: lista.map((x) => `${x.producto}: ${numero.format(x.cantidad)} ${und(x.unidad)}${x.valor ? ` (${pesos.format(x.valor)})` : ''}`),
          },
          `${data.length} ${data.length === 1 ? 'salida' : 'salidas'} ${periodo.texto}${plata(valor)}. ${lista
            .slice(0, 3)
            .map((x) => `${numero.format(x.cantidad)} ${und(x.unidad)} de ${x.producto}`)
            .join(', ')}.`,
          frase
        );
      }

      case 'equipo': {
        if (!orden.equipo) {
          const lista = c.equipos.filter((e) => !orden.cliente || String(e.cliente_id) === String(orden.cliente.id));
          return responder(
            {
              texto: lista.length
                ? `¿De cuál equipo? Diga el cliente y el modelo o el serial, por ejemplo «¿Qué repuestos lleva el XHV de Cementos?».`
                : 'No encontré equipos instalados con esos datos.',
              ok: false,
              lista: lista.slice(0, 8).map((e) => `${e.modelo} ${e.serial ?? ''} · ${limpiarNombre(c.clientes.find((x) => String(x.id) === String(e.cliente_id))?.nombre ?? '')}`),
            },
            undefined,
            frase
          );
        }
        const { data } = await supabase.from('v_movimientos').select('fecha, producto, cantidad, unidad_medida, valor').eq('equipo_id', orden.equipo.id).order('fecha', { ascending: false });
        const e = orden.equipo;
        const nombre = `${e.modelo} ${e.serial ?? ''}`.trim();
        if (!data?.length) return responder({ texto: `Al equipo ${nombre} todavía no se le han registrado repuestos.`, ok: true }, undefined, frase);
        const valor = data.reduce((a, m) => a + Number(m.valor ?? 0), 0);
        return responder(
          {
            texto: `Equipo ${nombre}: ${data.length} ${data.length === 1 ? 'repuesto registrado' : 'repuestos registrados'}${plata(valor)}.`,
            ok: true,
            lista: data
              .slice(0, 12)
              .map((m) => `${new Date(m.fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}: ${numero.format(Math.abs(Number(m.cantidad)))} ${und(m.unidad_medida)} de ${m.producto}`),
          },
          `Al equipo ${nombre} se le ${data.length === 1 ? 'ha registrado 1 repuesto' : `han registrado ${data.length} repuestos`}${plata(valor)}.`,
          frase
        );
      }

      case 'movimiento': {
        if (!editar) return noPuede(frase, 'registrar entradas ni salidas');
        if (!orden.candidatos.length)
          return responder({ texto: 'No encontré el producto. Dígalo otra vez con el código o con más palabras del nombre.', ok: false }, undefined, frase);
        if (orden.candidatos.length > 1) return pedirEleccion(orden, orden.candidatos, frase);
        const p = orden.candidatos[0];
        ir('/escanear');
        publicarOrden('movimiento', {
          sku: p.sku,
          tipo: orden.movimiento,
          cantidad: orden.cantidad,
          costo: orden.costo,
          documento: orden.documento,
          ubicacionId: orden.ubicacion ? String(orden.ubicacion.id) : null,
          destino: orden.cliente ? 'CLIENTE' : orden.funcionario || orden.area ? 'FUNCIONARIO' : null,
          funcionarioId: orden.funcionario ? String(orden.funcionario.id) : null,
          areaId: orden.area ? String(orden.area.id) : null,
          clienteId: orden.cliente ? String(orden.cliente.id) : null,
          equipoId: orden.equipo ? String(orden.equipo.id) : null,
        });
        const u = und(p.unidad_medida);
        const cuanto = orden.cantidad != null ? `${numero.format(orden.cantidad)} ${u} de ` : '';
        const para =
          orden.movimiento === 'SALIDA'
            ? orden.cliente
              ? ` para ${limpiarNombre(orden.cliente.nombre)}${orden.equipo ? `, equipo ${orden.equipo.modelo} ${orden.equipo.serial ?? ''}` : ''}`
              : orden.funcionario || orden.area
                ? ` para ${[orden.funcionario && limpiarNombre(orden.funcionario.nombre), orden.area?.nombre].filter(Boolean).join(', área ')}`
                : ''
            : `${orden.costo != null && perfil?.esAdmin ? ` a ${pesos.format(orden.costo)} c/u` : ''}${orden.documento ? `, ${orden.documento}` : ''}`;
        const faltan = [
          orden.cantidad == null && 'la cantidad',
          orden.movimiento === 'SALIDA' && !orden.cliente && !(orden.funcionario && orden.area) && (orden.funcionario ? 'el área' : orden.area ? 'el funcionario' : 'a quién se entrega'),
        ].filter(Boolean);
        const texto = `${orden.movimiento === 'ENTRADA' ? 'Entrada' : 'Salida'} de ${cuanto}${p.nombre}${para}. ${
          faltan.length ? `Falta ${faltan.join(' y ')}: complételo en la pantalla.` : 'Revise en la pantalla y diga «confirmar» o presione Registrar.'
        }`;
        return responder({ texto, ok: true }, texto, frase);
      }

      case 'conteo': {
        if (!editar) return noPuede(frase, 'registrar conteos');
        if (orden.candidatos.length > 1) return pedirEleccion(orden, orden.candidatos, frase);
        const p = orden.candidatos[0];
        ir('/conteo');
        publicarOrden('conteo', { sku: p.sku, cantidad: orden.cantidad ?? 1, sumar: orden.sumar });
        return responder({ texto: `Contando ${p.nombre}…`, ok: true }, '', frase);
      }

      case 'informe': {
        ir('/informes');
        publicarOrden('informe', {
          vista: orden.vista,
          formato: orden.formato,
          categoria: orden.categoria,
          desde: orden.periodo?.desde ?? null,
          hasta: orden.periodo?.hasta ?? null,
          tipo: orden.movimiento,
          funcionario: orden.funcionario?.nombre ?? null,
          area: orden.area?.nombre ?? null,
          cliente: orden.cliente?.nombre ?? null,
          estado: orden.estado,
        });
        const nombres = { movimientos: 'movimientos', inventario: 'inventario actual', compras: 'compras sugeridas', consumo: 'consumo' };
        const detalle = [
          orden.categoria ?? (orden.vista === 'inventario' || orden.vista === 'compras' ? 'todas las categorías' : ''),
          orden.periodo?.texto,
          orden.funcionario && limpiarNombre(orden.funcionario.nombre),
          orden.area?.nombre,
          orden.cliente && limpiarNombre(orden.cliente.nombre),
        ]
          .filter(Boolean)
          .join(', ');
        const texto = `Informe de ${nombres[orden.vista]}${detalle ? ` (${detalle})` : ''}. ${orden.formato ? `Descargando en ${orden.formato === 'excel' ? 'Excel' : 'PDF'}.` : 'Lo dejo en pantalla; diga «en PDF» o «en Excel» si lo quiere descargar.'}`;
        return responder({ texto, ok: true }, texto, frase);
      }

      case 'etiquetas': {
        if (!editar) return noPuede(frase, 'generar etiquetas');
        if (orden.candidatos.length > 1 && !orden.categoria) return pedirEleccion(orden, orden.candidatos, frase);
        ir('/etiquetas');
        publicarOrden('etiquetas', { categoria: orden.categoria, sku: orden.candidatos[0]?.sku ?? null, generar: orden.generar });
        const que = orden.categoria ?? orden.candidatos[0]?.nombre ?? 'todos los productos';
        return responder({ texto: `Etiquetas de ${que}: ${orden.generar ? 'generando el PDF.' : 'quedan marcadas; diga «imprime» o presione el botón para generar el PDF.'}`, ok: true }, undefined, frase);
      }

      case 'transito': {
        if (orden.candidatos.length > 1) return pedirEleccion(orden, orden.candidatos, frase);
        // Un producto: se responde con todo lo que se sabe de él (bodega, préstamos, pedidos)
        if (orden.candidatos.length === 1) return atender({ tipo: 'donde', candidatos: orden.candidatos }, frase, c);
        const filas = await cargarTransito();
        const pedidos = new Map<number, { numero: string; proveedor: string; estado: string; eta: string | null; fecha_salida: string | null; nacionalizado: string | null; items: FilaTransito[] }>();
        filas.forEach((f) => {
          const x = pedidos.get(f.transito_id) ?? { numero: f.numero, proveedor: f.proveedor, estado: f.estado, eta: f.eta, fecha_salida: f.fecha_salida, nacionalizado: f.nacionalizado, items: [] };
          x.items.push(f);
          pedidos.set(f.transito_id, x);
        });
        let lista = [...pedidos.values()];
        const compactar = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (orden.numero) lista = lista.filter((x) => compactar(x.numero).includes(compactar(orden.numero!)));
        else lista = lista.filter((x) => x.estado !== 'NACIONALIZADO');
        if (!lista.length)
          return responder(
            { texto: orden.numero ? `No encontré el pedido ${orden.numero.toUpperCase()} entre los pedidos en camino o que llegaron en los últimos 60 días.` : 'No hay mercancía en camino desde Brasil.', ok: !orden.numero },
            undefined,
            frase
          );
        const unidades = (x: (typeof lista)[number]) => x.items.reduce((a, i) => a + i.cantidad, 0);
        const estadoDe = (x: (typeof lista)[number]) =>
          x.estado === 'NACIONALIZADO'
            ? `Pedido ${x.numero}: ya llegó; entró al inventario el ${fechaLarga(x.nacionalizado ?? '')}.`
            : `Pedido ${x.numero} (${x.proveedor}): ${ETAPA_DONDE[x.estado] ?? x.estado}${x.fecha_salida && x.estado !== 'PEDIDO' ? `, salió el ${fechaLarga(x.fecha_salida)}` : ''}; ${cuandoLlega(x.eta)}.`;
        const linea = (x: (typeof lista)[number]) =>
          `${estadoDe(x)} Trae ${numero.format(unidades(x))} unidades de ${x.items.length} ${x.items.length === 1 ? 'producto' : 'productos'}.`;
        if (orden.numero && lista.length === 1) {
          const x = lista[0];
          return responder(
            {
              texto: linea(x),
              ok: true,
              lista: x.items.map((i) => `${i.producto}: ${numero.format(i.cantidad)} ${und(i.unidad_medida)}${i.recibido != null ? ` (llegaron ${numero.format(i.recibido)})` : ''}`),
              vozIntro: `${estadoDe(x)} Trae estos productos:`,
              titulo: `Pedido ${x.numero}`,
            },
            undefined,
            frase
          );
        }
        const atrasados = lista.filter((x) => x.estado !== 'NACIONALIZADO' && (diasHasta(x.eta) ?? 1) < 0).length;
        return responder(
          {
            texto: `${lista.length} ${lista.length === 1 ? 'pedido' : 'pedidos'} de Brasil en camino${atrasados ? `, ${atrasados} ${atrasados === 1 ? 'atrasado' : 'atrasados'}` : ''}:`,
            ok: true,
            lista: lista.map(linea),
            titulo: 'Pedidos de Brasil en camino',
            tabla: {
              columnas: ['Pedido', 'Proveedor', 'Etapa', 'Salió', 'Llega', 'Producto', 'Cantidad'],
              filas: lista.flatMap((x) =>
                x.items.map((i) => [x.numero, x.proveedor, ETAPA_DONDE[x.estado] ?? 'Llegó', x.fecha_salida ? fechaCorta(x.fecha_salida) : '', x.eta ? fechaCorta(x.eta) : '', i.producto, `${numero.format(i.cantidad)} ${und(i.unidad_medida)}`])
              ),
            },
            nota: 'Diga «genérame un PDF de eso» o «pásalo a Excel».',
          },
          undefined,
          frase
        );
      }

      case 'etapa': {
        if (!perfil?.esAdmin) return responder({ texto: 'La mercancía en tránsito solo la maneja el administrador.', ok: false }, undefined, frase);
        const { data } = await supabase.from('transitos').select('id, numero, estado').ilike('numero', `%${orden.numero}%`);
        const lista = (data ?? []) as { id: number; numero: string; estado: string }[];
        const exacto = lista.filter((x) => x.numero.toLowerCase().replace(/[^a-z0-9]/g, '') === orden.numero.replace(/[^a-z0-9]/g, ''));
        const pedidos = exacto.length ? exacto : lista;
        if (!pedidos.length) return responder({ texto: `No encontré el pedido ${orden.numero.toUpperCase()}.`, ok: false }, undefined, frase);
        if (pedidos.length > 1)
          return responder({ texto: `Hay varios pedidos con ese número: ${pedidos.map((x) => x.numero).join(', ')}. Dígame el número completo.`, ok: false }, undefined, frase);
        const ped = pedidos[0];
        if (ped.estado === 'NACIONALIZADO' || ped.estado === 'ANULADO')
          return responder({ texto: `El pedido ${ped.numero} ya está ${ped.estado === 'NACIONALIZADO' ? 'nacionalizado y en el inventario' : 'anulado'}.`, ok: false }, undefined, frase);
        if (orden.estado === 'NACIONALIZAR') {
          ir('/admin');
          publicarOrden('transito', { id: ped.id, nacionalizar: true });
          const t = `Abrí el pedido ${ped.numero} para nacionalizarlo. Revise cuánto llegó de cada producto, anote las novedades y oprima Confirmar nacionalización.`;
          return responder({ texto: t, ok: true }, t, frase);
        }
        const ORDEN_ETAPAS = ['PEDIDO', 'SALIO', 'TRANSITO', 'ADUANA'];
        const NOMBRE: Record<string, string> = { PEDIDO: 'pedido', SALIO: 'salió de Brasil', TRANSITO: 'en tránsito', ADUANA: 'en aduana' };
        if (ORDEN_ETAPAS.indexOf(orden.estado) <= ORDEN_ETAPAS.indexOf(ped.estado))
          return responder({ texto: `El pedido ${ped.numero} ya está ${NOMBRE[ped.estado]}.`, ok: true }, undefined, frase);
        const destino = orden.estado;
        accionSi.current = {
          hacer: async () => {
            const { error } = await supabase.rpc('avanzar_transito', { p_transito_id: ped.id, p_estado: destino, p_nota: 'Marcado por voz' });
            if (error) throw new Error(error.message);
            if (rutaRef.current === '/admin') publicarOrden('transito', { id: ped.id });
            return `Listo: el pedido ${ped.numero} quedó ${NOMBRE[destino]}.`;
          },
        };
        const t = `¿Marco el pedido ${ped.numero} como ${NOMBRE[destino]}? Diga sí para confirmar.`;
        return responder({ texto: t, ok: true }, t, frase);
      }

      case 'alertas': {
        const a = await cargarAlertas(true);
        if (!a.length) return responder({ texto: 'No hay alertas. Todo está al día.', ok: true }, undefined, frase);
        const urgentes = a.filter((x) => x.alta).length;
        const grupos = [...new Set(a.map((x) => x.grupo))].map((g) => `${a.filter((x) => x.grupo === g).length} de ${NOMBRE_GRUPO[g].toLowerCase()}`);
        return responder(
          {
            texto: `${a.length} ${a.length === 1 ? 'alerta' : 'alertas'}${urgentes ? `, ${urgentes} ${urgentes === 1 ? 'urgente' : 'urgentes'}` : ''} (${grupos.join(', ')}):`,
            ok: true,
            leerLista: true,
            // Primero lo más urgente: pedidos atrasados, préstamos vencidos, agotados
            lista: [...a]
              .sort((x, y) => Number(y.alta) - Number(x.alta) || ORDEN_GRUPO.indexOf(x.grupo) - ORDEN_GRUPO.indexOf(y.grupo))
              .map((x) => x.texto),
            titulo: 'Alertas',
            nota: 'Toda la lista está en la pantalla Alertas (la campanita 🔔).',
          },
          undefined,
          frase
        );
      }

      case 'movs': {
        // Sin período: los últimos movimientos; las demás consultas miran los últimos 3 meses
        const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
        const periodo =
          orden.periodo ??
          (orden.consulta === 'ultimos' ? null : { desde: new Date(Date.now() - 5 * 3600e3 - 90 * 86400e3).toISOString().slice(0, 10), hasta: hoy, texto: 'en los últimos 3 meses' });
        let q = supabase
          .from('v_movimientos')
          .select('fecha, tipo, sku, producto, cantidad, unidad_medida, valor, funcionario, area, cliente, equipo, proveedor, ubicacion, documento_ref, destino, categoria')
          .order('fecha', { ascending: false })
          .limit(orden.consulta === 'ultimos' && !periodo ? 10 : 5000);
        if (orden.movimiento) q = q.eq('tipo', orden.movimiento);
        else q = q.in('tipo', ['ENTRADA', 'SALIDA']);
        if (periodo) q = q.gte('fecha', `${periodo.desde}T00:00:00-05:00`).lte('fecha', `${periodo.hasta}T23:59:59-05:00`);
        if (orden.funcionario) q = q.eq('funcionario', orden.funcionario.nombre);
        if (orden.area) q = q.eq('area', orden.area.nombre);
        if (orden.cliente) q = q.eq('cliente', orden.cliente.nombre);
        if (orden.ubicacion) q = q.eq('ubicacion', orden.ubicacion.nombre);
        if (orden.categoria) q = q.eq('categoria', orden.categoria);
        if (orden.candidatos.length === 1) q = q.eq('sku', orden.candidatos[0].sku);
        else if (orden.candidatos.length > 1) q = q.in('sku', orden.candidatos.map((x) => x.sku));
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        type M = { fecha: string; tipo: string; sku: string; producto: string; cantidad: number; unidad_medida: string; valor: number | null; funcionario: string | null; area: string | null; cliente: string | null; equipo: string | null; proveedor: string | null; ubicacion: string | null; documento_ref: string | null; destino: string | null };
        const movs = ((data ?? []) as M[]).map((m) => ({ ...m, cantidad: Math.abs(Number(m.cantidad ?? 0)), valor: m.valor == null ? null : Number(m.valor) }));
        const quienDe = (m: M) =>
          m.tipo === 'ENTRADA'
            ? m.proveedor ?? m.documento_ref ?? 'Entrada'
            : m.destino === 'PRESTAMO'
              ? `Préstamo${m.documento_ref ? ` (${m.documento_ref})` : ''}`
              : m.funcionario
                ? `${limpiarNombre(m.funcionario)}${m.area ? ` · ${m.area}` : ''}`
                : m.cliente
                  ? `${limpiarNombre(m.cliente)}${m.equipo ? ` · ${m.equipo}` : ''}`
                  : '—';
        const dia = (f: string) => new Date(f).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
        const filtros = [
          orden.funcionario && limpiarNombre(orden.funcionario.nombre),
          orden.area && `el área ${orden.area.nombre}`,
          orden.cliente && limpiarNombre(orden.cliente.nombre),
          orden.ubicacion && orden.ubicacion.nombre,
          orden.categoria,
          orden.candidatos.length === 1 && orden.candidatos[0].nombre,
        ]
          .filter(Boolean)
          .join(', ');
        const cuando = periodo ? ` ${periodo.texto}` : '';
        const tablaMovs = () => ({
          columnas: ['Fecha', 'Movimiento', 'Código', 'Producto', 'Cantidad', 'Entregado a / origen', 'Bodega', 'Documento'],
          filas: movs.map((m) => [
            new Date(m.fecha).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }),
            m.tipo === 'ENTRADA' ? 'Entrada' : 'Salida',
            m.sku,
            m.producto,
            `${numero.format(m.cantidad)} ${und(m.unidad_medida)}`,
            quienDe(m),
            m.ubicacion ?? '',
            m.documento_ref ?? '',
          ]),
        });
        if (!movs.length)
          return responder({ texto: `No hay ${orden.movimiento === 'ENTRADA' ? 'entradas' : orden.movimiento === 'SALIDA' ? 'salidas' : 'movimientos'}${filtros ? ` de ${filtros}` : ''}${cuando}.`, ok: true }, undefined, frase);

        if (orden.consulta === 'ultimos' || orden.consulta === 'detalle') {
          const palabra = orden.movimiento === 'ENTRADA' ? 'entradas' : orden.movimiento === 'SALIDA' ? 'salidas' : 'movimientos';
          const linea = (m: M) =>
            `${dia(m.fecha)}: ${m.tipo === 'ENTRADA' ? 'entraron' : 'salieron'} ${numero.format(m.cantidad)} ${und(m.unidad_medida)} de ${m.producto}${m.tipo === 'SALIDA' ? ` para ${quienDe(m)}` : ''}`;
          let titulo = `${orden.consulta === 'ultimos' && !periodo ? `Últimas ${palabra}` : palabra[0].toUpperCase() + palabra.slice(1)}${filtros ? ` de ${filtros}` : ''}${cuando}`;
          let texto = `${titulo}: ${movs.length}${plata(movs.reduce((a, m) => a + (m.valor ?? 0), 0))}.`;
          let voz = `${movs.length === 1 ? 'Hay un movimiento' : `Estos son ${movs.length > 5 ? 'los más recientes' : `los ${movs.length}`}`}: ${movs
            .slice(0, 4)
            .map(linea)
            .join('; ')}${movs.length > 4 ? `; y ${movs.length - 4} más en pantalla` : ''}.`;
          if (orden.consulta === 'detalle') {
            const quien = filtros || 'ese funcionario';
            const unidades = movs.reduce((a, m) => a + m.cantidad, 0);
            const distintos = new Set(movs.map((m) => m.sku)).size;
            const top = new Map<string, number>();
            movs.forEach((m) => top.set(m.producto, (top.get(m.producto) ?? 0) + m.cantidad));
            const masPedido = [...top].sort((a, b) => b[1] - a[1])[0];
            titulo = `Lo que ha pedido ${quien}${cuando}`;
            texto = `${quien}${cuando}: ${movs.length} ${movs.length === 1 ? 'salida' : 'salidas'}, ${numero.format(unidades)} unidades de ${distintos} ${distintos === 1 ? 'artículo' : 'artículos'}${plata(movs.reduce((a, m) => a + (m.valor ?? 0), 0))}.`;
            voz = `${quien} ha pedido ${distintos} ${distintos === 1 ? 'artículo' : 'artículos distintos'} en ${movs.length} ${movs.length === 1 ? 'salida' : 'salidas'}${cuando}. Lo que más ha pedido es ${masPedido[0]}, ${numero.format(masPedido[1])} unidades. Lo último fue ${numero.format(movs[0].cantidad)} ${und(movs[0].unidad_medida)} de ${movs[0].producto}, el ${dia(movs[0].fecha)}.`;
          }
          return responder(
            { texto, ok: true, lista: movs.slice(0, 30).map(linea), vozIntro: orden.consulta === 'detalle' ? `${voz} Este es el detalle:` : texto, tabla: tablaMovs(), titulo, nota: 'Diga «genérame un PDF de eso» o «pásalo a Excel».' },
            voz,
            frase
          );
        }

        // Rankings: lo que más sale, quién o qué área pide más
        const grupos = new Map<string, { nombre: string; salidas: number; unidades: number; valor: number; unidad: string }>();
        movs.forEach((m) => {
          const k = orden.consulta === 'top_productos' ? m.sku : orden.consulta === 'top_areas' ? m.area ?? (m.cliente ? `Cliente ${limpiarNombre(m.cliente)}` : 'Sin área') : m.funcionario ? limpiarNombre(m.funcionario) : m.cliente ? limpiarNombre(m.cliente) : 'Préstamos';
          const nombre = orden.consulta === 'top_productos' ? m.producto : k;
          const x = grupos.get(k) ?? { nombre, salidas: 0, unidades: 0, valor: 0, unidad: m.unidad_medida };
          x.salidas += 1;
          x.unidades += m.cantidad;
          x.valor += m.valor ?? 0;
          grupos.set(k, x);
        });
        const ranking = [...grupos.values()].sort((a, b) => b.salidas - a.salidas || b.unidades - a.unidades).slice(0, 15);
        const titulo =
          orden.consulta === 'top_productos' ? `Lo que más sale${filtros ? ` (${filtros})` : ''}${cuando}` : orden.consulta === 'top_areas' ? `Áreas que más piden${cuando}` : `Quién pide más${cuando}`;
        const lineaR = (x: (typeof ranking)[number], i: number) =>
          `${i + 1}. ${x.nombre}: ${x.salidas} ${x.salidas === 1 ? 'salida' : 'salidas'}, ${numero.format(x.unidades)} ${orden.consulta === 'top_productos' ? und(x.unidad) : x.unidades === 1 ? 'unidad' : 'unidades'}${perfil?.esAdmin && x.valor ? ` (${pesos.format(x.valor)})` : ''}`;
        return responder(
          {
            texto: `${titulo}:`,
            ok: true,
            lista: ranking.map(lineaR),
            leerLista: true,
            tabla: {
              columnas: [orden.consulta === 'top_productos' ? 'Artículo' : orden.consulta === 'top_areas' ? 'Área' : 'Funcionario o cliente', 'Salidas', 'Unidades', ...(perfil?.esAdmin ? ['Valor'] : [])],
              filas: ranking.map((x) => [x.nombre, String(x.salidas), numero.format(x.unidades), ...(perfil?.esAdmin ? [pesos.format(x.valor)] : [])]),
            },
            titulo,
            nota: 'Diga «genérame un PDF de eso» o «pásalo a Excel».',
          },
          `${titulo}: ${ranking
            .slice(0, 3)
            .map((x, i) => `${i === 0 ? 'primero' : i === 1 ? 'segundo' : 'tercero'}, ${x.nombre}, con ${x.salidas} ${x.salidas === 1 ? 'salida' : 'salidas'}`)
            .join('; ')}.`,
          frase
        );
      }

      case 'inspeccion': {
        const [ins, eqs, movs] = await Promise.all([
          supabase
            .from('inspecciones')
            .select('id, tipo, fecha, inspeccion_equipos(inspeccion_id, equipo_id, resultados, hallazgos, observacion)')
            .order('fecha', { ascending: false })
            .limit(200),
          supabase.from('equipos').select('id, serial, modelo, planta').eq('activo', true),
          orden.equipos.length
            ? supabase.from('v_movimientos').select('equipo_id, producto, cantidad, fecha').in('equipo_id', orden.equipos).order('fecha', { ascending: false })
            : Promise.resolve({ data: [] as { equipo_id: number; producto: string; cantidad: number; fecha: string }[] }),
        ]);
        if (ins.error) throw new Error(ins.error.message);
        const r = responderInspeccion(
          orden,
          (ins.data ?? []) as InspVoz[],
          (eqs.data ?? []) as { id: number; serial: string | null; modelo: string; planta: string | null }[],
          ((movs.data ?? []) as { equipo_id: number; producto: string; cantidad: number; fecha: string }[]).map((m) => ({ ...m, cantidad: Math.abs(Number(m.cantidad)) }))
        );
        return responder(
          { texto: r.texto, ok: r.ok, lista: r.lista, leerLista: !!r.lista?.length, tabla: r.tabla, titulo: r.titulo, nota: r.tabla ? 'Diga «genérame un PDF de eso» para descargarlo.' : undefined },
          r.voz,
          frase
        );
      }

      case 'pdfUltimo': {
        const u = ultima.current;
        noGuardarUltima.current = true;
        if (!u) return responder({ texto: 'Primero hágame una pregunta y luego le genero el PDF de la respuesta.', ok: false }, undefined, frase);
        type Fila = string[];
        const cols = u.tabla
          ? u.tabla.columnas.map((t, i) => ({ t, i })).filter((c) => c.t)
          : [{ t: 'Detalle', i: 0 }];
        const filas: Fila[] = u.tabla ? u.tabla.filas : (u.lista?.length ? u.lista : [u.texto]).map((x) => [x]);
        const columnas: Columna<Fila>[] = cols.map((c) => ({
          titulo: c.t,
          ancho: /observ|detalle|falla/i.test(c.t) ? 30 : /ubicaci/i.test(c.t) ? 18 : 12,
          tipo: 'texto',
          valor: (f) => f[c.i] ?? '',
        }));
        await (orden.formato === 'excel' ? exportarExcel<Fila> : exportarPdf<Fila>)({
          titulo: u.titulo,
          archivo: `blaster_${u.titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').toLowerCase().slice(0, 40)}`,
          detalle: [`Pregunta a Blaster: «${u.pregunta}»`, u.texto, `Generado el ${new Date().toLocaleString('es-CO')}`],
          columnas,
          filas,
        });
        const que = orden.formato === 'excel' ? 'el Excel' : 'el PDF';
        return responder({ texto: `Listo, descargué ${que}: ${u.titulo}.`, ok: true }, `Listo, ya descargué ${que}.`, frase);
      }

      case 'prestamos': {
        if (!editar) return noPuede(frase, 'ver los préstamos');
        let q = supabase
          .from('v_prestamos')
          .select('id, sentido, empresa, contacto, sku, producto, unidad_medida, cantidad, devuelto, pendiente, fecha, fecha_devolucion, vencido, tiene_firma, firmo')
          .in('estado', ['PENDIENTE', 'PARCIAL'])
          .order('fecha_devolucion', { ascending: true, nullsFirst: false });
        if (orden.sentido) q = q.eq('sentido', orden.sentido);
        if (orden.empresa) q = q.eq('empresa', orden.empresa);
        if (orden.candidatos.length) q = q.in('sku', orden.candidatos.map((p) => p.sku));
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        type P = { id: number; sentido: string; empresa: string; contacto: string | null; sku: string; producto: string; unidad_medida: string; cantidad: number; devuelto: number; pendiente: number; fecha: string; fecha_devolucion: string | null; vencido: boolean; tiene_firma: boolean; firmo: string | null };
        let filas = ((data ?? []) as P[]).map((f) => ({ ...f, cantidad: Number(f.cantidad), devuelto: Number(f.devuelto), pendiente: Number(f.pendiente), dias: diasHasta(f.fecha_devolucion) }));
        if (orden.consulta === 'vencidos') filas = filas.filter((f) => f.vencido);
        if (orden.consulta === 'pronto') filas = filas.filter((f) => !f.vencido && f.dias != null && f.dias <= 7);
        if (orden.consulta === 'sin_acta') filas = filas.filter((f) => !f.tiene_firma);
        // Primero lo vencido (lo más atrasado arriba), luego por fecha de devolución
        filas.sort((a, b) => Number(b.vencido) - Number(a.vencido) || (a.dias ?? 9999) - (b.dias ?? 9999));

        const que = [
          orden.consulta === 'vencidos' ? 'vencidos' : orden.consulta === 'pronto' ? 'que vencen en los próximos 7 días' : orden.consulta === 'sin_acta' ? 'sin acta firmada' : 'pendientes',
          orden.sentido === 'SALIDA' ? 'que nos deben' : orden.sentido === 'ENTRADA' ? 'que debemos devolver' : '',
          orden.empresa ? `con ${limpiarNombre(orden.empresa)}` : '',
          orden.candidatos.length === 1 ? `de ${orden.candidatos[0].nombre}` : orden.candidatos.length ? 'de esos productos' : '',
        ]
          .filter(Boolean)
          .join(' ');
        if (!filas.length) return responder({ texto: `No hay préstamos ${que}.`, ok: true }, undefined, frase);

        const linea = (f: (typeof filas)[number]) => {
          const u = und(f.unidad_medida);
          const emp = limpiarNombre(f.empresa);
          const cabeza = f.sentido === 'SALIDA' ? `Le prestamos a ${emp} ${numero.format(f.cantidad)} ${u} de ${f.producto}` : `${emp} nos prestó ${numero.format(f.cantidad)} ${u} de ${f.producto}`;
          const devuelto = f.devuelto > 0 ? `; ${f.sentido === 'SALIDA' ? 'han devuelto' : 'hemos devuelto'} ${numero.format(f.devuelto)}, faltan ${numero.format(f.pendiente)}` : '';
          const quien = f.sentido === 'SALIDA' ? 'debían devolverlo' : 'debíamos devolverlo';
          const cuando =
            f.dias == null || !f.fecha_devolucion
              ? 'sin fecha de devolución'
              : f.vencido
                ? `${quien} el ${fechaCorta(f.fecha_devolucion)}, lleva ${dias(-f.dias)} vencido`
                : f.dias === 0
                  ? 'se vence hoy'
                  : `${f.sentido === 'SALIDA' ? 'lo devuelven' : 'hay que devolverlo'} el ${fechaCorta(f.fecha_devolucion)} (en ${dias(f.dias)})`;
          const acta = f.tiene_firma ? `Acta firmada por ${f.firmo ?? 'el que recibió'}` : 'Sin acta firmada';
          return `${cabeza} el ${fechaCorta(f.fecha)}${devuelto}; ${cuando}. ${acta}.`;
        };
        const nos = filas.filter((f) => f.sentido === 'SALIDA');
        const deb = filas.filter((f) => f.sentido === 'ENTRADA');
        const venc = filas.filter((f) => f.vencido).length;
        const empresas = (xs: typeof filas) => new Set(xs.map((f) => f.empresa)).size;
        const resumen = [
          !orden.sentido && nos.length && `${nos.length} que nos deben (${empresas(nos)} ${empresas(nos) === 1 ? 'empresa' : 'empresas'})`,
          !orden.sentido && deb.length && `${deb.length} que debemos devolver (${empresas(deb)} ${empresas(deb) === 1 ? 'empresa' : 'empresas'})`,
          orden.consulta !== 'vencidos' && venc && `${venc} ${venc === 1 ? 'vencido' : 'vencidos'}`,
        ]
          .filter(Boolean)
          .join(', ');
        // Concordancia: "1 préstamo pendiente", "2 préstamos vencidos", "1 préstamo que vence…"
        const uno = filas.length === 1;
        const queN = uno ? que.replace(/^pendientes/, 'pendiente').replace(/^vencidos/, 'vencido').replace(/^que vencen/, 'que vence') : que;
        return responder(
          {
            texto: `${filas.length} ${uno ? 'préstamo' : 'préstamos'} ${queN}${resumen ? `: ${resumen}` : ''}.`,
            ok: true,
            lista: filas.map(linea),
            titulo: `Préstamos ${que}`,
            tabla: {
              columnas: ['Tipo', 'Empresa', 'Código', 'Producto', 'Prestado', 'Devuelto', 'Pendiente', 'Fecha', 'Devolver el', 'Estado', 'Acta'],
              filas: filas.map((f) => [
                f.sentido === 'SALIDA' ? 'Nos deben' : 'Debemos',
                limpiarNombre(f.empresa),
                f.sku,
                f.producto,
                numero.format(f.cantidad),
                numero.format(f.devuelto),
                numero.format(f.pendiente),
                fechaCorta(f.fecha),
                f.fecha_devolucion ? fechaCorta(f.fecha_devolucion) : '',
                f.vencido && f.dias != null ? `Vencido (${dias(-f.dias)})` : 'Al día',
                f.tiene_firma ? `Firmada (${f.firmo ?? ''})` : 'Sin firma',
              ]),
            },
            nota: 'Diga «genérame un PDF de eso» o «pásalo a Excel».',
          },
          undefined,
          frase
        );
      }

      case 'parar': {
        turnoVoz.current++;
        window.speechSynthesis?.cancel();
        setHablando(false);
        setPausado(false);
        return responder({ texto: 'Listo.', ok: true }, '', frase);
      }

      case 'kardex': {
        if (orden.candidatos.length > 1 && !orden.todos) return pedirEleccion(orden, orden.candidatos, frase);
        const periodo = orden.periodo ?? periodoEsteMes();
        const skus = orden.candidatos.map((p) => p.sku);
        let q = supabase
          .from('v_movimientos')
          .select('fecha, tipo, sku, producto, cantidad, unidad_medida, funcionario, area, cliente, equipo, proveedor, ubicacion, documento_ref, destino')
          .gte('fecha', `${periodo.desde}T00:00:00-05:00`)
          .lte('fecha', `${periodo.hasta}T23:59:59-05:00`)
          .order('fecha', { ascending: false })
          .limit(5000);
        let qi = supabase.from('v_inventario').select('sku, nombre, cantidad, stock_minimo, unidad_medida');
        if (orden.categoria) {
          q = q.eq('categoria', orden.categoria);
          qi = qi.eq('categoria', orden.categoria);
        } else {
          q = q.in('sku', skus);
          qi = qi.in('sku', skus);
        }
        const [{ data, error }, { data: inv }] = await Promise.all([q, qi]);
        if (error) throw new Error(error.message);
        const movs = ((data ?? []) as Mov[]).map((m) => ({ ...m, cantidad: Number(m.cantidad ?? 0) }));
        const existencia = new Map<string, { nombre: string; cantidad: number; minimo: number; unidad: string }>();
        (inv ?? []).forEach((f) => {
          const x = existencia.get(f.sku) ?? { nombre: f.nombre, cantidad: 0, minimo: Number(f.stock_minimo ?? 0), unidad: f.unidad_medida };
          x.cantidad += Number(f.cantidad ?? 0);
          existencia.set(f.sku, x);
        });
        const tabla = {
          columnas: ['Fecha', 'Movimiento', 'Código', 'Producto', 'Cantidad', 'Entregado a / origen', 'Bodega', 'Documento'],
          filas: movs.map((m) => [
            new Date(m.fecha).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }),
            esPrestamo(m) ? `Préstamo (${m.tipo === 'ENTRADA' ? 'entrada' : 'salida'})` : m.tipo === 'ENTRADA' ? 'Entrada' : m.tipo === 'SALIDA' ? 'Salida' : 'Ajuste',
            m.sku,
            m.producto,
            `${numero.format(Math.abs(m.cantidad))} ${und(m.unidad_medida)}`,
            quienMov(m),
            limpiarNombre(m.ubicacion ?? ''),
            m.documento_ref ?? '',
          ]),
        };
        const sumar = (xs: Mov[]) => xs.reduce((a, m) => a + Math.abs(m.cantidad), 0);

        // Un solo producto: entradas con fecha, salidas por persona, préstamos, ajustes y saldo
        if (!orden.categoria && orden.candidatos.length === 1) {
          const p = orden.candidatos[0];
          const u = und(p.unidad_medida);
          const ex = existencia.get(p.sku);
          const saldo = `Quedan ${numero.format(ex?.cantidad ?? 0)} ${u}${ex?.minimo ? `. El mínimo es ${numero.format(ex.minimo)}` : ''}.`;
          if (!movs.length) {
            const { data: ult } = await supabase
              .from('v_movimientos')
              .select('fecha, tipo, sku, producto, cantidad, unidad_medida, funcionario, area, cliente, equipo, proveedor, ubicacion, documento_ref, destino')
              .eq('sku', p.sku)
              .order('fecha', { ascending: false })
              .limit(1);
            const m = (ult ?? [])[0] as Mov | undefined;
            const texto = `${p.nombre} no ha tenido movimiento ${periodo.texto}.${
              m ? ` El último fue el ${dia(m.fecha)}: ${m.tipo === 'ENTRADA' ? 'entraron' : 'salieron'} ${numero.format(Math.abs(Number(m.cantidad)))} ${u}${m.tipo === 'SALIDA' ? ` para ${quienMov(m)}` : ''}.` : ' No tiene movimientos registrados.'
            } ${saldo}`;
            return responder({ texto, ok: true }, texto, frase);
          }
          const entradas = movs.filter((m) => m.tipo === 'ENTRADA' && !esPrestamo(m));
          const salidas = movs.filter((m) => m.tipo === 'SALIDA' && !esPrestamo(m));
          const prestamos = movs.filter(esPrestamo);
          const ajustes = movs.filter((m) => m.tipo === 'AJUSTE');
          const porQuien = new Map<string, { cantidad: number; fechas: string[] }>();
          salidas.forEach((m) => {
            const k = quienMov(m);
            const x = porQuien.get(k) ?? { cantidad: 0, fechas: [] };
            x.cantidad += Math.abs(m.cantidad);
            if (!x.fechas.includes(dia(m.fecha))) x.fechas.push(dia(m.fecha));
            porQuien.set(k, x);
          });
          const lista = [
            ...entradas.map((m) => `Entraron ${numero.format(Math.abs(m.cantidad))} ${u} el ${dia(m.fecha)}${m.documento_ref ? ` (${m.documento_ref})` : ''}`),
            ...[...porQuien]
              .sort((a, b) => b[1].cantidad - a[1].cantidad)
              .map(([k, x]) => `Salieron para ${k}: ${numero.format(x.cantidad)} ${u} (${x.fechas.join(', ')})`),
            ...prestamos.map((m) => `${dia(m.fecha)}: ${m.tipo === 'ENTRADA' ? 'entraron' : 'salieron'} ${numero.format(Math.abs(m.cantidad))} ${u} por préstamo${m.documento_ref ? ` (${m.documento_ref})` : ''}`),
            ...(ajustes.length ? [`Ajustes de conteo: ${ajustes.map((m) => `${m.cantidad > 0 ? '+' : ''}${numero.format(m.cantidad)} el ${dia(m.fecha)}`).join(', ')}`] : []),
            saldo,
          ];
          const E = sumar(entradas);
          const S = sumar(salidas);
          return responder(
            {
              texto: `${p.nombre}, movimiento ${periodo.texto}: entraron ${numero.format(E)} ${u} y salieron ${numero.format(S)} ${u}.`,
              ok: true,
              lista,
              tabla,
              titulo: `Movimiento de ${p.nombre}, ${periodo.texto}`,
              nota: 'Diga «genérame un PDF de eso» o «pásalo a Excel».',
            },
            undefined,
            frase
          );
        }

        // Varios productos o una categoría: un renglón por producto
        const grupos = new Map<string, Mov[]>();
        movs.forEach((m) => grupos.set(m.sku, [...(grupos.get(m.sku) ?? []), m]));
        const nombreGrupo = orden.categoria ?? `${orden.candidatos.length} productos`;
        if (!movs.length) return responder({ texto: `Los ${nombreGrupo} no han tenido movimiento ${periodo.texto}.`, ok: true }, undefined, frase);
        const lista = [...grupos]
          .sort((a, b) => sumar(b[1]) - sumar(a[1]))
          .map(([sku, ms]) => {
            const ex = existencia.get(sku);
            const u = und(ms[0].unidad_medida);
            const quien = new Map<string, number>();
            ms.filter((m) => m.tipo === 'SALIDA' && !esPrestamo(m)).forEach((m) => {
              const k = (m.funcionario && limpiarNombre(m.funcionario).split(' ')[0]) || (m.cliente && limpiarNombre(m.cliente)) || 'otros';
              quien.set(k, (quien.get(k) ?? 0) + Math.abs(m.cantidad));
            });
            const E = sumar(ms.filter((m) => m.tipo === 'ENTRADA' && !esPrestamo(m)));
            const S = sumar(ms.filter((m) => m.tipo === 'SALIDA' && !esPrestamo(m)));
            const detalle = [...quien].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${numero.format(n)}`).join(', ');
            return `${ms[0].producto}: entraron ${numero.format(E)}, salieron ${numero.format(S)}${detalle ? ` (${detalle})` : ''}; quedan ${numero.format(ex?.cantidad ?? 0)} ${u}`;
          });
        const sinMov = (orden.categoria ? existencia.size : orden.candidatos.length) - grupos.size;
        return responder(
          {
            texto: `Movimiento de ${nombreGrupo}, ${periodo.texto}: ${grupos.size} ${grupos.size === 1 ? 'producto se movió' : 'productos se movieron'}${sinMov > 0 ? `; ${sinMov} sin movimiento` : ''}.`,
            ok: true,
            lista,
            tabla,
            titulo: `Movimiento de ${nombreGrupo}, ${periodo.texto}`,
            nota: 'Diga «genérame un PDF de eso» o «pásalo a Excel».',
          },
          undefined,
          frase
        );
      }

      case 'donde': {
        if (orden.candidatos.length > 1 && !orden.todos) return pedirEleccion(orden, orden.candidatos, frase);
        const ids = orden.candidatos.map((p) => p.id);
        let sinScript = false;
        const [{ data: inv }, pres, tr] = await Promise.all([
          supabase.from('v_inventario').select('producto_id, ubicacion, cantidad, stock_minimo').in('producto_id', ids),
          editar
            ? supabase.from('v_prestamos').select('producto_id, sentido, empresa, pendiente, fecha_devolucion, vencido').in('producto_id', ids).in('estado', ['PENDIENTE', 'PARCIAL'])
            : Promise.resolve({ data: [] }),
          cargarTransito().catch(() => {
            sinScript = true;
            return [] as FilaTransito[];
          }),
        ]);
        type Pres = { producto_id: string; sentido: string; empresa: string; pendiente: number; fecha_devolucion: string | null; vencido: boolean };
        const prestamos = (pres.data ?? []) as Pres[];
        const analizar = (p: ProductoVoz) => {
          const u = und(p.unidad_medida);
          const filas = (inv ?? []).filter((f) => f.producto_id === p.id).map((f) => ({ ubicacion: limpiarNombre(f.ubicacion ?? ''), cantidad: Number(f.cantidad ?? 0), minimo: Number(f.stock_minimo ?? 0) }));
          const total = filas.reduce((a, f) => a + f.cantidad, 0);
          const minimo = filas[0]?.minimo ?? 0;
          const conExistencia = filas.filter((f) => f.cantidad > 0);
          const pr = prestamos.filter((x) => x.producto_id === p.id);
          const ped = tr.filter((x) => x.producto_id === p.id);
          const enCamino = ped.filter((x) => x.estado !== 'NACIONALIZADO');
          const viene = enCamino.reduce((a, x) => a + x.cantidad, 0);
          const lineas: string[] = [];
          lineas.push(conExistencia.length ? `En bodega: ${conExistencia.map((f) => `${f.ubicacion}, ${numero.format(f.cantidad)} ${u}`).join('; ')}` : 'En bodega: no hay');
          pr.forEach((x) => {
            const d = diasHasta(x.fecha_devolucion);
            const cuando = x.vencido && d != null ? `, vencido hace ${dias(-d)}` : x.fecha_devolucion ? `, se devuelve el ${fechaCorta(x.fecha_devolucion)}` : '';
            lineas.push(
              x.sentido === 'SALIDA'
                ? `Prestado a ${limpiarNombre(x.empresa)}: ${numero.format(Number(x.pendiente))} ${u}${cuando}`
                : `${limpiarNombre(x.empresa)} nos prestó ${numero.format(Number(x.pendiente))} ${u} (ya están en bodega${cuando})`
            );
          });
          ped.forEach((x) =>
            lineas.push(
              x.estado === 'NACIONALIZADO'
                ? `Pedido ${x.numero}: ya llegó; entró al inventario el ${fechaLarga(x.nacionalizado ?? '')}${x.recibido != null && x.recibido !== x.cantidad ? ` (llegaron ${numero.format(x.recibido)} de ${numero.format(x.cantidad)})` : ` (${numero.format(x.cantidad)} ${u})`}`
                : `Pedido ${x.numero}: ${numero.format(x.cantidad)} ${u}, ${ETAPA_DONDE[x.estado] ?? x.estado}${x.fecha_salida && x.estado !== 'PEDIDO' ? ` (salió el ${fechaLarga(x.fecha_salida)})` : ''}; ${cuandoLlega(x.eta)}`
            )
          );
          if (!ped.length && !sinScript) lineas.push('No viene en ningún pedido de Brasil');
          const falta = (total <= 0 || (minimo > 0 && total <= minimo)) && !viene;
          if (total <= 0 && !viene) lineas.push('No hay en bodega y no viene nada en camino: hay que pedirlo');
          else if (minimo > 0 && total <= minimo && !viene) lineas.push(`Está en el mínimo (${numero.format(minimo)}) y no viene nada pedido`);
          else if (minimo > 0 && total <= minimo && viene) lineas.push(`Está en el mínimo, pero ya vienen ${numero.format(viene)} ${u} en camino`);
          return { p, u, total, minimo, viene, falta, prestado: pr.filter((x) => x.sentido === 'SALIDA').reduce((a, x) => a + Number(x.pendiente), 0), lineas, primero: enCamino[0] };
        };
        const res = orden.candidatos.map(analizar);
        const porPedir = res
          .filter((r) => r.falta)
          .map((r) => {
            const bruto = Math.max(r.minimo * 2 - r.total, r.minimo > 0 ? 0 : 1);
            return { sku: r.p.sku, nombre: r.p.nombre, cantidad: ['M', 'M2', 'KG'].includes(r.p.unidad_medida) ? Math.round(bruto * 100) / 100 : Math.max(1, Math.ceil(bruto)) };
          });
        const pregunta = await ofrecerPedido(porPedir);
        const nota = [sinScript && 'Para ver los pedidos de Brasil falta ejecutar el script 14 en Supabase.', pregunta && 'Diga «sí» y le dejo armado el pedido a Brasil en Administración.'].filter(Boolean).join(' ') || undefined;
        if (res.length === 1) {
          const r = res[0];
          return responder(
            { texto: `${r.p.nombre}: dónde está`, ok: true, lista: r.lineas, vozIntro: `${r.p.nombre}.`, vozFinal: pregunta, nota, titulo: `Dónde está ${r.p.nombre}` },
            undefined,
            frase
          );
        }
        return responder(
          {
            texto: `Dónde están los ${res.length} productos:`,
            ok: true,
            lista: res.map(
              (r) =>
                `${r.p.nombre}: ${numero.format(r.total)} ${r.u} en bodega${r.prestado ? `, ${numero.format(r.prestado)} prestados` : ''}${
                  r.viene ? `, vienen ${numero.format(r.viene)} de Brasil (${ETAPA_DONDE[r.primero?.estado ?? ''] ?? ''}, ${cuandoLlega(r.primero?.eta ?? null)})` : r.falta ? ', no viene nada pedido' : ''
                }`
            ),
            vozFinal: pregunta,
            nota,
            titulo: 'Dónde está la mercancía',
          },
          undefined,
          frase
        );
      }

      case 'repetir': {
        const u = ultimaVoz.current;
        if (!u) return responder({ texto: 'Todavía no he dicho nada para repetir.', ok: false }, undefined, frase);
        setRespuesta((r) => r);
        return hablar(u.texto, u.partes);
      }

      case 'armado': {
        if (!orden.modelo)
          return responder(
            { texto: '¿De cuál cañón le muestro el armado: Destroyer, XHV o Capol?', ok: true },
            '¿De cuál cañón le muestro el armado? Destroyer, XHV o Capol.',
            frase
          );
        ir('/canones');
        publicarOrden('canon', { modelo: orden.modelo, armar: true });
        const nombreCanon = { destroyer: 'Destroyer', xhv: 'XHV', capol: 'Capol' }[orden.modelo];
        // La pantalla Cañones narra cada paso; aquí no se habla para no encimar las voces
        responder({ texto: `Le muestro cómo se arma el ${nombreCanon}, paso a paso, en el dibujo. Puede pausar con el botón ⏸ de la pantalla.`, ok: true }, '', frase);
        if (window.innerWidth < 640) cerrar();
        return;
      }

      case 'saber': {
        // Existencia y costo de cada producto, para cruzarlos con el despiece
        const [inv, cos] = await Promise.all([
          supabase.from('v_inventario').select('sku, cantidad, stock_minimo, unidad_medida'),
          supabase.rpc('costos_productos'),
        ]);
        const datos: DatosBodega = { existencias: new Map(), costos: new Map(), verCostos: !!perfil?.esAdmin };
        (inv.data ?? []).forEach((f) => {
          const x = datos.existencias.get(f.sku) ?? { cantidad: 0, minimo: Number(f.stock_minimo ?? 0), unidad: f.unidad_medida };
          x.cantidad += Number(f.cantidad ?? 0);
          datos.existencias.set(f.sku, x);
        });
        ((cos.data ?? []) as { sku: string; costo_unitario: number }[]).forEach((f) => datos.costos.set(f.sku, Number(f.costo_unitario ?? 0)));
        const r = responderSaber(orden.frase, orden.candidatos, c.productos, datos);
        if (r.opciones) return pedirEleccion(orden, r.opciones, frase);
        if (r.preguntaSi) pendienteSi.current = r.preguntaSi;
        return responder({ texto: r.texto, ok: true, lista: r.lista, nota: r.nota, ver: r.ver, vozCubre: true }, r.voz, frase, r.secuencia);
      }

      default: {
        const sug = sugerir(limpiarFrase(frase));
        if (sug.length) {
          sugerida.current = sug[0];
          return responder(
            { texto: `No le entendí bien «${frase}». ¿Quiso decir «${sug[0]}»? Diga «sí» o toque una opción.`, ok: false, sugerencias: sug },
            `No le entendí bien. ¿Quiso decir: ${sug[0].replace(/[¿?«»]/g, '')}?`,
            frase
          );
        }
        return responder({ texto: `No entendí «${frase}». Diga «ayuda» para ver ejemplos.`, ok: false }, 'No entendí. Diga ayuda para ver ejemplos.', frase);
      }
    }
  }

  /* -------------------------- Micrófono -------------------------- */

  const escuchar = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Reconocedor; webkitSpeechRecognition?: new () => Reconocedor };
    const Clase = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Clase) {
      setRespuesta({ texto: 'Este navegador no reconoce la voz. Use Chrome o Edge, o escriba la orden abajo.', ok: false });
      return;
    }
    turnoVoz.current++;
    window.speechSynthesis?.cancel();
    setHablando(false);
    setPausado(false);
    reconocedor.current?.abort();
    const r = new Clase();
    r.lang = 'es-CO';
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    textoFinal.current = '';
    r.onresult = (e) => {
      let fin = '';
      let medio = '';
      for (let i = 0; i < e.results.length; i++) {
        const x = e.results[i];
        if (x.isFinal) fin += x[0].transcript;
        else medio += x[0].transcript;
      }
      if (fin) textoFinal.current = fin;
      setParcial((fin || medio).trim());
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' && conversacionRef.current) return; // en conversación se cuenta como un intento fallido
      const msg = ERRORES_MIC[e.error] ?? `No se pudo usar el micrófono (${e.error}).`;
      if (msg) setRespuesta({ texto: msg, ok: false });
      if (e.error !== 'no-speech') {
        setConversacion(false);
        conversacionRef.current = false;
      }
    };
    r.onend = () => {
      setEscuchando(false);
      const dicho = textoFinal.current.trim();
      if (dicho) {
        fallos.current = 0;
        ejecutarRef.current(dicho);
      } else if (conversacionRef.current && abiertoRef.current) {
        fallos.current += 1;
        if (fallos.current >= 3) {
          setConversacion(false);
          conversacionRef.current = false;
          setRespuesta({ texto: 'No le escuché tres veces seguidas: terminé el modo conversación.', ok: false });
        } else setTimeout(() => escucharRef.current(), 300);
      }
    };
    reconocedor.current = r;
    setParcial('');
    setEscuchando(true);
    try {
      r.start();
    } catch {
      setEscuchando(false);
    }
  }, []);
  escucharRef.current = escuchar;
  const ejecutarRef = useRef(ejecutar);
  ejecutarRef.current = ejecutar;

  function detener() {
    reconocedor.current?.stop();
    setEscuchando(false);
  }

  // El buscador general le pasa preguntas a Blaster ("¿cómo está el cañón A01-21?")
  useEffect(() => {
    const oir = (e: Event) => {
      const frase = String((e as CustomEvent).detail ?? '').trim();
      if (!frase) return;
      setAbierto(true);
      abiertoRef.current = true;
      ejecutarRef.current(frase);
    };
    window.addEventListener('poliway:preguntar', oir);
    return () => window.removeEventListener('poliway:preguntar', oir);
  }, []);

  function abrir(conMicrofono: boolean) {
    setAbierto(true);
    abiertoRef.current = true;
    cargarContexto();
    if (conMicrofono && soportaVoz) escuchar();
  }
  function cerrar() {
    setAbierto(false);
    abiertoRef.current = false;
    setConversacion(false);
    conversacionRef.current = false;
    reconocedor.current?.abort();
    window.speechSynthesis?.cancel();
    setEscuchando(false);
    pendiente.current = null;
  }

  useEffect(() => {
    if (!abierto) return;
    const f = (e: KeyboardEvent) => e.key === 'Escape' && cerrar();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [abierto]);

  function enviar(e: FormEvent) {
    e.preventDefault();
    ejecutar(entrada);
  }

  /* ------------------------------ Vista ------------------------------ */

  if (!perfil || ruta === '/login') return null;

  return (
    <>
      {abierto && (
        <section
          role="dialog"
          aria-label="Asistente de voz Blaster"
          className="fixed inset-x-2 bottom-24 z-[90] flex max-h-[70dvh] flex-col overflow-hidden rounded-xl border border-linea bg-white shadow-2xl sm:inset-x-auto sm:right-4 sm:w-[400px]"
        >
          <header className="flex items-center justify-between gap-2 bg-tinta px-4 py-2.5 text-white">
            <div>
              <p className="text-lg font-bold leading-tight text-poli">Blaster</p>
              <p className="text-xs text-white/70">Asistente de voz</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const v = !silencio;
                  setSilencio(v);
                  silencioRef.current = v;
                  guardarLocal(CLAVE_SILENCIO, v);
                  if (v) window.speechSynthesis?.cancel();
                }}
                aria-label={silencio ? 'Activar la voz' : 'Silenciar la voz'}
                title={silencio ? 'Activar la voz' : 'Silenciar la voz'}
                className="rounded px-2 py-1 text-lg hover:bg-white/10"
              >
                {silencio ? '🔇' : '🔊'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const v = !conversacion;
                  setConversacion(v);
                  conversacionRef.current = v;
                  fallos.current = 0;
                  if (v && !escuchando) escuchar();
                }}
                aria-pressed={conversacion}
                title="Modo conversación: escucha después de cada respuesta"
                className={`rounded px-2 py-1 text-sm font-semibold ${conversacion ? 'bg-poli text-tinta' : 'hover:bg-white/10'}`}
              >
                🔁 Conversación
              </button>
              <button type="button" onClick={cerrar} aria-label="Cerrar el asistente" className="rounded px-2 py-1 text-xl leading-none hover:bg-white/10">
                ×
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {escuchando ? (
              <p className="flex items-center gap-2 font-semibold text-alerta">
                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-alerta" aria-hidden />
                Escuchando… {parcial && <span className="font-normal italic text-tinta">«{parcial}»</span>}
              </p>
            ) : trabajando ? (
              <p className="text-acero">Buscando…</p>
            ) : parcial ? (
              <p className="italic text-acero">«{parcial}»</p>
            ) : null}

            {respuesta ? (
              <div className={`rounded-lg border p-3 ${respuesta.ok ? 'border-linea bg-concreto' : 'border-alerta bg-alerta-suave'}`}>
                <p className={`whitespace-pre-line ${respuesta.ok ? '' : 'font-medium text-alerta'}`}>{respuesta.texto}</p>
                {respuesta.lista && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {respuesta.lista.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                )}
                {respuesta.nota && <p className="mt-2 text-xs italic text-acero">{respuesta.nota}</p>}
                {respuesta.ver && ruta !== '/canones' && (
                  <MiniDespiece
                    ver={respuesta.ver}
                    onAbrir={(c, n) => {
                      router.push('/canones');
                      publicarOrden('canon', { modelo: c, n: n ?? undefined });
                      if (window.innerWidth < 640) cerrar(); // en el celular el panel taparía el dibujo
                    }}
                  />
                )}
                {respuesta.sugerencias && respuesta.sugerencias.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {respuesta.sugerencias.map((x) => (
                      <button key={x} type="button" onClick={() => ejecutar(x)} className="rounded-full border border-tinta bg-white px-3 py-1 text-left text-sm font-semibold hover:bg-poli">
                        {x === 'todos' ? 'Todos' : x}
                      </button>
                    ))}
                  </div>
                )}
                {respuesta.opciones && (
                  <ol className="mt-2 space-y-1.5">
                    {respuesta.opciones.map((p, i) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => ejecutar(String(i + 1))}
                          className="flex w-full items-start gap-2 rounded border border-linea bg-white px-3 py-2 text-left hover:border-tinta"
                        >
                          <span className="font-bold text-oro-oscuro">{i + 1}</span>
                          <span>
                            <span className="block font-semibold leading-snug">{p.nombre}</span>
                            <span className="block text-xs text-acero">
                              {p.sku}
                              {p.categoria ? ` · ${p.categoria}` : ''}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ) : (
              !escuchando && (
                <div>
                  <p className="text-sm text-acero">
                    {soportaVoz ? 'Toque el micrófono y hable, o escriba la orden. Por ejemplo:' : 'Este navegador no reconoce la voz (use Chrome o Edge). Puede escribir la orden. Por ejemplo:'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {EJEMPLOS.map((e) => (
                      <button key={e} type="button" onClick={() => ejecutar(e)} className="rounded-full border border-linea px-3 py-1 text-left text-sm hover:border-tinta">
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}

            {respuesta && !silencio && (hablando || ultimaVoz.current) && (
              <div className="flex gap-2">
                {hablando && (
                  <button
                    type="button"
                    onClick={() => {
                      const s = window.speechSynthesis;
                      if (pausado) {
                        s.resume();
                        setPausado(false);
                      } else {
                        s.pause();
                        setPausado(true);
                      }
                    }}
                    className="flex-1 rounded-lg bg-tinta px-3 py-2 text-sm font-semibold text-white hover:bg-poli hover:text-tinta"
                  >
                    {pausado ? '▶ Seguir' : '⏸ Pausa'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => ultimaVoz.current && hablar(ultimaVoz.current.texto, ultimaVoz.current.partes)}
                  className="rounded-lg border border-linea px-3 py-2 text-sm font-semibold hover:border-tinta"
                  title="Repetir la última respuesta"
                >
                  ⏮ Repetir
                </button>
                {hablando && (
                  <button
                    type="button"
                    onClick={() => {
                      turnoVoz.current++;
                      window.speechSynthesis.cancel();
                      setHablando(false);
                      setPausado(false);
                    }}
                    className="flex-1 rounded-lg bg-alerta px-3 py-2 text-sm font-bold text-white hover:opacity-90"
                    title="Dejar de hablar"
                  >
                    ⏹ Parar
                  </button>
                )}
              </div>
            )}

            {historial.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-acero">Últimas órdenes</summary>
                <ul className="mt-1 space-y-0.5">
                  {historial.slice(0, 10).map((h, i) => (
                    <li key={i}>
                      <button type="button" onClick={() => ejecutar(h.texto)} className="flex w-full gap-2 rounded px-1 py-0.5 text-left hover:bg-concreto" title="Repetir esta orden">
                        <span aria-label={h.ok ? 'Entendida' : 'No entendida'}>{h.ok ? '✅' : '❓'}</span>
                        <span className="min-w-0 flex-1 truncate">{h.texto}</span>
                        <span className="text-xs text-acero">{h.hora}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <form onSubmit={enviar} className="flex gap-2 border-t border-linea p-3">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Orden para el asistente</span>
              <input
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                placeholder="Escriba una orden…"
                className="w-full rounded-lg border border-linea px-3 py-2 text-base focus:border-poli focus:outline-none focus:ring-2 focus:ring-poli/40"
              />
            </label>
            <button type="submit" disabled={!entrada.trim()} className="rounded-lg bg-tinta px-4 py-2 font-semibold text-white hover:bg-poli hover:text-tinta disabled:opacity-40">
              Enviar
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => (!abierto ? abrir(true) : escuchando ? detener() : escuchar())}
        aria-label={escuchando ? 'Dejar de escuchar' : abierto ? 'Hablar con el asistente' : 'Abrir el asistente de voz Blaster'}
        title="Asistente de voz Blaster"
        className={`fixed bottom-5 right-4 z-[90] flex h-16 w-16 items-center justify-center rounded-full shadow-xl ring-4 ring-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta ${
          escuchando ? 'animate-pulse bg-alerta text-white' : 'bg-tinta text-poli hover:bg-poli hover:text-tinta'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
          <path d="M12 18v4" />
          <path d="M8 22h8" />
        </svg>
      </button>
    </>
  );
}
