'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useSesion, type Rol } from '@/lib/sesion';
import { cargarCatalogo, type ProductoBasico } from '@/lib/catalogo';

/* Buscador general: se escribe lo que se necesita, con las palabras de uno,
   y lleva a la pantalla, al producto, al cañón o al pedido. Si es una pregunta,
   se la pasa a Blaster. */

interface Accion {
  titulo: string;
  detalle: string;
  ruta: string;
  claves: string;
  roles?: Rol[];
}
const EDITAN: Rol[] = ['admin', 'bodeguero'];
const ADMIN: Rol[] = ['admin'];

const ACCIONES: Accion[] = [
  { titulo: 'Registrar entrada o salida', detalle: 'Sacar, recibir o despachar repuestos', ruta: '/escanear', claves: 'registrar salida entrada sacar recibir despachar entregar movimiento escanear pistola codigo barras qr llevar', roles: EDITAN },
  { titulo: 'Inventario', detalle: 'Existencias por producto y bodega', ruta: '/', claves: 'inventario existencias stock cuanto hay bodega tablero inicio productos repuestos' },
  { titulo: 'Conteo físico', detalle: 'Contar la bodega y ajustar diferencias', ruta: '/conteo', claves: 'conteo contar inventario fisico ajuste ajustar diferencias auditoria', roles: EDITAN },
  { titulo: 'Cañones y despiece', detalle: 'Dibujo de cada cañón, piezas y armado paso a paso', ruta: '/canones', claves: 'canones canon despiece piezas destroyer xhv capol dibujo armado armar partes ensamble' },
  { titulo: 'Equipos instalados', detalle: 'Cañones de cada cliente y su hoja de vida', ruta: '/equipos', claves: 'equipos instalados clientes hoja vida serial planta' },
  { titulo: 'Ronda diaria de inspección', detalle: 'Check-list de todos los cañones de una planta', ruta: '/inspecciones', claves: 'inspeccion ronda diaria check list checklist revision revisar canones falla hallazgo tecnico', roles: EDITAN },
  { titulo: 'Inspección a fondo', detalle: 'Las 23 tareas de un cañón, con mediciones y firma', ruta: '/inspecciones?pestana=fondo', claves: 'inspeccion fondo hoja vida mediciones presion llenado cronometro tecnico detallada', roles: EDITAN },
  { titulo: 'Historial de inspecciones', detalle: 'Rondas guardadas, PDF y formato Poliway', ruta: '/inspecciones?pestana=historial', claves: 'historial inspecciones rondas fallas repetidas pdf formato poliway excel' },
  { titulo: 'Informes', detalle: 'Movimientos, inventario y consumo en PDF o Excel', ruta: '/informes', claves: 'informes informe reportes reporte kardex excel pdf descargar movimientos listado' },
  { titulo: 'Compras sugeridas', detalle: 'Qué pedir y armar el pedido a Brasil', ruta: '/informes?vista=compras', claves: 'compras comprar pedir sugeridas reponer minimo agotados faltantes pedido brasil' },
  { titulo: 'Consumo y gráficas', detalle: 'Qué se gasta, quién y en qué área', ruta: '/informes?vista=consumo', claves: 'consumo graficas grafica gasto gastos estadisticas' },
  { titulo: 'Etiquetas QR', detalle: 'Imprimir etiquetas de los repuestos', ruta: '/etiquetas', claves: 'etiquetas etiqueta qr codigo imprimir stickers rotular', roles: EDITAN },
  { titulo: 'Listas', detalle: 'Funcionarios, áreas, clientes y bodegas', ruta: '/listas', claves: 'listas funcionarios funcionario areas area clientes cliente bodegas ubicaciones crear agregar', roles: EDITAN },
  { titulo: 'Préstamos', detalle: 'Prestar, recibir, devolver y acta con firma', ruta: '/prestamos', claves: 'prestamos prestamo prestar devolver devolucion prestado acta firma', roles: EDITAN },
  { titulo: 'Alertas', detalle: 'Mínimos, pedidos atrasados, préstamos vencidos e inspecciones', ruta: '/alertas', claves: 'alertas alerta avisos pendientes urgente vencido atrasado campana' },
  { titulo: 'Registrar factura o pedido de Brasil', detalle: 'PDF, Excel, foto o texto: la app lo lee', ruta: '/admin', claves: 'registrar factura remision packing pedido brasil documento foto ocr cargar subir', roles: ADMIN },
  { titulo: 'Mercancía en tránsito', detalle: 'Pedidos de Brasil, etapas y nacionalización', ruta: '/admin?pestana=transito', claves: 'transito pedido pedidos brasil importacion nacionalizar aduana llegada camino', roles: ADMIN },
  { titulo: 'Archivo de documentos', detalle: 'Facturas y documentos guardados', ruta: '/admin?pestana=archivo', claves: 'archivo documentos facturas guardadas originales', roles: ADMIN },
  { titulo: 'Importar Excel', detalle: 'Cargar productos, costos y mínimos', ruta: '/importar', claves: 'importar excel cargar productos lista precios costos minimos', roles: ADMIN },
  { titulo: 'Cargar cañones desde Excel', detalle: 'Pasar el check-list de una planta a la app', ruta: '/inspecciones?pestana=cargar', claves: 'cargar canones excel planta checklist importar', roles: ADMIN },
  { titulo: 'Usuarios', detalle: 'Crear usuarios, roles y contraseñas', ruta: '/usuarios', claves: 'usuarios usuario contrasena clave permisos roles crear', roles: ADMIN },
];

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const VACIAS = new Set('de del la el los las un una y o a al para por en con que como hago hacer quiero necesito donde esta estan me se mi'.split(' '));

interface Resultado {
  tipo: 'accion' | 'producto' | 'canon' | 'pedido' | 'persona' | 'blaster';
  titulo: string;
  detalle: string;
  ir: () => void;
}

export default function Buscador() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        aria-label="Buscar en la app"
        className="inline-flex items-center gap-1 rounded border border-tinta px-3 py-1.5 font-medium hover:bg-tinta hover:text-white"
      >
        <span aria-hidden>🔍</span> <span className="hidden sm:inline">Buscar</span>
      </button>
      {abierto && <Panel onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function Panel({ onCerrar }: { onCerrar: () => void }) {
  const router = useRouter();
  const sesion = useSesion();
  const [q, setQ] = useState('');
  const [productos, setProductos] = useState<ProductoBasico[]>([]);
  const [canones, setCanones] = useState<{ id: number; cliente_id: number; serial: string | null; modelo: string; planta: string | null }[]>([]);
  const [pedidos, setPedidos] = useState<{ numero: string; estado: string }[]>([]);
  const [personas, setPersonas] = useState<{ nombre: string }[]>([]);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campo.current?.focus();
    cargarCatalogo().then(setProductos);
    supabase.from('equipos').select('id, cliente_id, serial, modelo, planta').eq('activo', true).then(({ data }) => setCanones(data ?? []));
    supabase.from('transitos').select('numero, estado').then(({ data }) => setPedidos(data ?? []));
    supabase.from('funcionarios').select('nombre').eq('activo', true).then(({ data }) => setPersonas(data ?? []));
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);

  const ir = (ruta: string) => {
    onCerrar();
    router.push(ruta);
  };
  const preguntar = (frase: string) => {
    onCerrar();
    window.dispatchEvent(new CustomEvent('poliway:preguntar', { detail: frase }));
  };

  const resultados = useMemo<Resultado[]>(() => {
    const t = norm(q);
    if (!t) return [];
    const palabras = t.split(' ').filter((w) => w.length >= 2 && !VACIAS.has(w));
    const out: Resultado[] = [];

    // 1. Pantallas y acciones (por palabras clave y sinónimos)
    ACCIONES.filter((a) => !a.roles || a.roles.includes(sesion.rol))
      .map((a) => {
        const claves = norm(`${a.titulo} ${a.claves}`).split(' ');
        const puntos = palabras.reduce((s, w) => s + (claves.some((k) => k === w || (w.length >= 4 && (k.startsWith(w) || w.startsWith(k) && k.length >= 4))) ? 1 : 0), 0);
        return { a, puntos };
      })
      .filter((x) => x.puntos > 0)
      .sort((x, y) => y.puntos - x.puntos)
      .slice(0, 5)
      .forEach(({ a }) => out.push({ tipo: 'accion', titulo: a.titulo, detalle: a.detalle, ir: () => ir(a.ruta) }));

    // 2. Productos por código o nombre
    const compacto = t.replace(/\s+/g, '');
    productos
      .filter((p) => {
        const n = norm(`${p.nombre} ${p.sku}`);
        return norm(p.sku).replace(/\s+/g, '') === compacto || (palabras.length > 0 && palabras.every((w) => n.includes(w)));
      })
      .slice(0, 5)
      .forEach((p) =>
        out.push({
          tipo: 'producto',
          titulo: p.nombre,
          detalle: `${p.sku} · ver existencia y registrar movimiento`,
          ir: () => ir(sesion.puedeEditar ? `/escanear?codigo=${encodeURIComponent(p.sku)}` : '/'),
        })
      );

    // 3. Cañones por código
    if (compacto.length >= 2)
      canones
        .filter((c) => norm(c.serial ?? '').replace(/\s+/g, '').includes(compacto))
        .slice(0, 5)
        .forEach((c) =>
          out.push({
            tipo: 'canon',
            titulo: `Cañón ${c.serial}`,
            detalle: `${c.modelo}${c.planta ? ` · ${c.planta}` : ''} · preguntarle a Blaster cómo está`,
            ir: () => preguntar(`cómo está el cañón ${c.serial?.replace(/\s*\(.*\)$/, '')}`),
          })
        );

    // 4. Pedidos de Brasil por número
    // Se compara por los números ("fatura 4400" encuentra FAT-004400)
    const digitos = t.replace(/\D/g, '');
    if (digitos.length >= 3)
      pedidos
        .filter((p) => p.numero.replace(/\D/g, '').includes(digitos))
        .slice(0, 3)
        .forEach((p) => out.push({ tipo: 'pedido', titulo: `Pedido ${p.numero}`, detalle: 'Mercancía en tránsito', ir: () => ir('/admin?pestana=transito') }));

    // 5. Funcionarios: lo que han pedido
    personas
      .filter((f) => palabras.some((w) => w.length >= 3 && norm(f.nombre).split(' ').includes(w)))
      .slice(0, 3)
      .forEach((f) =>
        out.push({
          tipo: 'persona',
          titulo: f.nombre.replace(/\s*\(demo\)/i, ''),
          detalle: 'Ver lo que ha pedido (Blaster)',
          ir: () => preguntar(`qué ha pedido ${f.nombre.replace(/\s*\(demo\)/i, '')}`),
        })
      );

    // 6. Siempre: preguntarle a Blaster
    out.push({ tipo: 'blaster', titulo: `Preguntarle a Blaster: «${q.trim()}»`, detalle: 'Responde por voz y en pantalla', ir: () => preguntar(q.trim()) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, productos, canones, pedidos, personas, sesion.rol, sesion.puedeEditar]);

  const ICONO: Record<Resultado['tipo'], string> = { accion: '➡️', producto: '📦', canon: '🎯', pedido: '🚢', persona: '👤', blaster: '🎤' };

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/40 p-3 pt-16 sm:pt-24" onClick={onCerrar} role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Buscar" className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-linea px-4 py-3">
          <span aria-hidden>🔍</span>
          <input
            ref={campo}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && resultados[0]) resultados[0].ir();
            }}
            placeholder="¿Qué necesita? Ej: préstamo, registrar salida, pistón, A01-21, 4521…"
            aria-label="¿Qué necesita?"
            className="min-w-0 flex-1 bg-transparent text-lg outline-none"
          />
          <button onClick={onCerrar} aria-label="Cerrar" className="rounded px-2 text-xl leading-none text-acero hover:bg-concreto">
            ×
          </button>
        </div>
        {!q.trim() ? (
          <p className="px-4 py-5 text-sm text-acero">
            Escriba con sus palabras lo que quiere hacer o buscar: una pantalla, un repuesto, un cañón, un pedido o una persona. Con <b>Enter</b> va al primer resultado.
          </p>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-linea overflow-y-auto">
            {resultados.map((r, i) => (
              <li key={i}>
                <button onClick={r.ir} className={`flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-concreto ${i === 0 ? 'bg-poli/10' : ''}`}>
                  <span aria-hidden className="pt-0.5">
                    {ICONO[r.tipo]}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{r.titulo}</span>
                    <span className="block text-sm text-acero">{r.detalle}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
