// Alerta de stock bajo por correo.
// - Vercel la llama sola cada mañana (ver vercel.json) con la clave CRON_SECRET.
// - El administrador puede enviarla a mano desde Informes > Compras sugeridas.
// Requiere en .env.local o en Vercel: RESEND_API_KEY y ALERTA_CORREOS (separados por coma).
import { clienteAdmin, verificarAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status });
const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

async function enviar(forzar: boolean) {
  const llave = process.env.RESEND_API_KEY;
  const destinos = (process.env.ALERTA_CORREOS ?? '').split(',').map((c) => c.trim()).filter(Boolean);
  if (!llave || !destinos.length) {
    return json(
      { error: 'El envío de correos aún no está configurado (faltan RESEND_API_KEY y ALERTA_CORREOS). Se configura al publicar la app.', sin_configurar: true },
      400
    );
  }

  const admin = clienteAdmin();
  const [{ data: inv }, { data: prods }] = await Promise.all([
    admin.from('v_inventario').select('sku, nombre, cantidad, stock_minimo, unidad_medida'),
    admin.from('productos').select('sku, costo_unitario').eq('activo', true),
  ]);
  const costo = new Map((prods ?? []).map((p) => [p.sku, Number(p.costo_unitario ?? 0)]));

  // Existencia total por producto (sumando ubicaciones)
  const total = new Map<string, { nombre: string; cantidad: number; minimo: number; unidad: string }>();
  (inv ?? []).forEach((f) => {
    const x = total.get(f.sku) ?? { nombre: f.nombre, cantidad: 0, minimo: Number(f.stock_minimo ?? 0), unidad: f.unidad_medida };
    x.cantidad += Number(f.cantidad ?? 0);
    total.set(f.sku, x);
  });
  const alertas = [...total.entries()]
    .filter(([, x]) => x.minimo > 0 && x.cantidad <= x.minimo)
    .map(([sku, x]) => {
      const pedir = Math.max(0, Math.ceil(x.minimo * 2 - x.cantidad));
      return { sku, ...x, pedir, valor: pedir * (costo.get(sku) ?? 0) };
    })
    .sort((a, b) => a.cantidad / a.minimo - b.cantidad / b.minimo);

  if (!alertas.length && !forzar) return json({ enviado: false, motivo: 'No hay productos bajo el mínimo.' });

  const filas = alertas
    .map(
      (a) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #DCD8CF;font-family:monospace">${escapar(a.sku)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #DCD8CF">${escapar(a.nombre)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #DCD8CF;text-align:right;color:${a.cantidad <= 0 ? '#B3261E' : '#17191C'};font-weight:bold">${numero.format(a.cantidad)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #DCD8CF;text-align:right">${numero.format(a.minimo)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #DCD8CF;text-align:right">${numero.format(a.pedir)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #DCD8CF;text-align:right">${a.valor ? pesos.format(a.valor) : ''}</td>
      </tr>`
    )
    .join('');
  const html = `<div style="font-family:Arial,sans-serif;color:#17191C;max-width:720px">
    <div style="height:6px;background:#FF6A00"></div>
    <h2 style="margin:16px 0 4px">Bastión: ${alertas.length} productos en el mínimo o por debajo</h2>
    <p style="color:#5A6068;margin:0 0 16px">Se sugiere pedir hasta completar el doble del mínimo. Valores sin IVA.</p>
    ${
      alertas.length
        ? `<table style="border-collapse:collapse;width:100%;font-size:14px">
      <tr style="background:#17191C;color:#fff"><th style="padding:8px;text-align:left">Código</th><th style="padding:8px;text-align:left">Producto</th><th style="padding:8px;text-align:right">Hay</th><th style="padding:8px;text-align:right">Mínimo</th><th style="padding:8px;text-align:right">Pedir</th><th style="padding:8px;text-align:right">Valor</th></tr>
      ${filas}</table>`
        : '<p>No hay productos bajo el mínimo. Todo en orden.</p>'
    }
    <p style="color:#5A6068;font-size:12px;margin-top:24px">Correo automático de Bastión · Inventario Poliway.</p>
  </div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.ALERTA_REMITENTE || 'Bastión <onboarding@resend.dev>',
      to: destinos,
      subject: alertas.length ? `Stock bajo: ${alertas.length} productos por reponer` : 'Bastión: sin alertas de stock',
      html,
    }),
  });
  if (!r.ok) return json({ error: `El servicio de correo respondió: ${await r.text()}` }, 502);
  return json({ enviado: true, productos: alertas.length, destinos });
}

// Llamado automático de Vercel (cron)
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) {
    return json({ error: 'No autorizado' }, 401);
  }
  return enviar(false);
}

// Envío manual del administrador
export async function POST(req: Request) {
  const v = await verificarAdmin(req);
  if (!v.ok) return v.respuesta;
  return enviar(true);
}
