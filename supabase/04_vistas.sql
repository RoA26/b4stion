-- =====================================================================
-- 04 · VISTAS
-- Sistema de inventario (antes Poliway/Blaster) · reconstrucción en un Supabase NUEVO
-- v_inventario, v_movimientos, v_prestamos, v_transito_producto.
-- Ejecutar UNA sola vez, completo, en Supabase > SQL Editor > + New query > Run.
-- =====================================================================

-- view: v_inventario
CREATE VIEW public.v_inventario AS
 SELECT p.id AS producto_id,
    p.sku,
    p.codigo_barras,
    p.nombre,
    c.nombre AS categoria,
    p.unidad_medida,
    u.id AS ubicacion_id,
    u.nombre AS ubicacion,
    COALESCE(s.cantidad, (0)::numeric) AS cantidad,
    p.stock_minimo,
    ((p.stock_minimo > (0)::numeric) AND (COALESCE(s.cantidad, (0)::numeric) <= p.stock_minimo)) AS bajo_minimo,
        CASE
            WHEN public.es_admin() THEN (COALESCE(s.cantidad, (0)::numeric) * p.costo_unitario)
            ELSE NULL::numeric
        END AS valor_total,
    s.actualizado,
        CASE
            WHEN public.es_admin() THEN p.costo_unitario
            ELSE NULL::numeric
        END AS costo_unitario
   FROM (((public.productos p
     LEFT JOIN public.categorias c ON ((c.id = p.categoria_id)))
     LEFT JOIN public.stock s ON ((s.producto_id = p.id)))
     LEFT JOIN public.ubicaciones u ON ((u.id = s.ubicacion_id)))
  WHERE (p.activo AND ((auth.uid() IS NOT NULL) OR (auth.role() = 'service_role'::text)));

-- view: v_movimientos
CREATE VIEW public.v_movimientos AS
 SELECT m.id,
    m.creado AS fecha,
    m.tipo,
    p.sku,
    p.nombre AS producto,
    c.nombre AS categoria,
    p.unidad_medida,
    m.cantidad,
    m.saldo_resultante,
        CASE
            WHEN public.es_admin() THEN COALESCE(m.costo_unitario, p.costo_unitario)
            ELSE NULL::numeric
        END AS costo_unitario,
        CASE
            WHEN public.es_admin() THEN (abs(m.cantidad) * COALESCE(m.costo_unitario, p.costo_unitario))
            ELSE NULL::numeric
        END AS valor,
    u.nombre AS ubicacion,
    m.destino,
    f.nombre AS funcionario,
    a.nombre AS area,
    cl.nombre AS cliente,
    cl.nit AS cliente_nit,
    pr.nombre AS proveedor,
    m.documento_ref,
    m.nota,
    pe.nombre AS registrado_por,
    (e.modelo || COALESCE((' '::text || e.serial), ''::text)) AS equipo,
    m.equipo_id,
    (m.firma IS NOT NULL) AS tiene_firma
   FROM (((((((((public.movimientos m
     JOIN public.productos p ON ((p.id = m.producto_id)))
     LEFT JOIN public.categorias c ON ((c.id = p.categoria_id)))
     LEFT JOIN public.ubicaciones u ON ((u.id = m.ubicacion_id)))
     LEFT JOIN public.funcionarios f ON ((f.id = m.funcionario_id)))
     LEFT JOIN public.areas a ON ((a.id = m.area_id)))
     LEFT JOIN public.clientes cl ON ((cl.id = m.cliente_id)))
     LEFT JOIN public.proveedores pr ON ((pr.id = m.proveedor_id)))
     LEFT JOIN public.perfiles pe ON ((pe.id = m.usuario_id)))
     LEFT JOIN public.equipos e ON ((e.id = m.equipo_id)))
  WHERE ((auth.uid() IS NOT NULL) OR (auth.role() = 'service_role'::text));

-- view: v_prestamos
CREATE VIEW public.v_prestamos WITH (security_invoker='true') AS
 SELECT pr.id,
    pr.sentido,
    pr.empresa,
    pr.contacto,
    pr.producto_id,
    p.sku,
    p.nombre AS producto,
    p.unidad_medida,
    pr.ubicacion_id,
    u.nombre AS ubicacion,
    pr.cantidad,
    pr.devuelto,
    (pr.cantidad - pr.devuelto) AS pendiente,
    pr.fecha,
    pr.fecha_devolucion,
    pr.autorizo,
    pr.nota,
    pr.estado,
    pr.creado,
    pe.nombre AS registrado_por,
    ((pr.estado = ANY (ARRAY['PENDIENTE'::text, 'PARCIAL'::text])) AND (pr.fecha_devolucion < ((now() AT TIME ZONE 'America/Bogota'::text))::date)) AS vencido,
    (pr.firma IS NOT NULL) AS tiene_firma,
    pr.firmo
   FROM (((public.prestamos pr
     JOIN public.productos p ON ((p.id = pr.producto_id)))
     LEFT JOIN public.ubicaciones u ON ((u.id = pr.ubicacion_id)))
     LEFT JOIN public.perfiles pe ON ((pe.id = pr.creado_por)));

-- view: v_transito_producto
CREATE VIEW public.v_transito_producto WITH (security_invoker='true') AS
 SELECT i.producto_id,
    sum(i.cantidad) AS en_transito,
    min(t.eta) AS llega,
    count(DISTINCT t.id) AS pedidos
   FROM (public.transito_items i
     JOIN public.transitos t ON ((t.id = i.transito_id)))
  WHERE ((t.estado = ANY (ARRAY['PEDIDO'::text, 'SALIO'::text, 'TRANSITO'::text, 'ADUANA'::text])) AND (i.producto_id IS NOT NULL))
  GROUP BY i.producto_id;

-- Verificación: deben ser 4 vistas
select table_name from information_schema.views where table_schema = 'public' order by 1;
