-- =====================================================================
-- 06 · SEGURIDAD: PERMISOS (GRANT/REVOKE), ROW LEVEL SECURITY Y POLÍTICAS
-- Sistema de inventario (antes Poliway/Blaster) · reconstrucción en un Supabase NUEVO
-- Primero se quitan los permisos que Supabase da por defecto y luego se ponen exactamente los del sistema.
-- Ejecutar UNA sola vez, completo, en Supabase > SQL Editor > + New query > Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Limpiar los permisos por defecto de Supabase
--    (los costos se ocultan con permisos por COLUMNA: si quedara el SELECT
--    de toda la tabla, cualquier usuario vería productos.costo_unitario)
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;

-- ---------------------------------------------------------------------
-- B. Permisos del sistema (tablas, columnas, vistas, secuencias y funciones)
--    anon (sin sesión) no recibe nada.
-- ---------------------------------------------------------------------
-- acl: FUNCTION aprobar_conteo(p_conteo_id bigint)
REVOKE ALL ON FUNCTION public.aprobar_conteo(p_conteo_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.aprobar_conteo(p_conteo_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.aprobar_conteo(p_conteo_id bigint) TO service_role;

-- acl: FUNCTION avanzar_transito(p_transito_id bigint, p_estado text, p_nota text)
REVOKE ALL ON FUNCTION public.avanzar_transito(p_transito_id bigint, p_estado text, p_nota text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.avanzar_transito(p_transito_id bigint, p_estado text, p_nota text) TO authenticated;
GRANT ALL ON FUNCTION public.avanzar_transito(p_transito_id bigint, p_estado text, p_nota text) TO service_role;

-- acl: FUNCTION corregir_inspeccion(p_id bigint, p_equipos jsonb, p_fecha date, p_turno text, p_zona text, p_inspector text, p_observaciones text, p_firma text)
REVOKE ALL ON FUNCTION public.corregir_inspeccion(p_id bigint, p_equipos jsonb, p_fecha date, p_turno text, p_zona text, p_inspector text, p_observaciones text, p_firma text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.corregir_inspeccion(p_id bigint, p_equipos jsonb, p_fecha date, p_turno text, p_zona text, p_inspector text, p_observaciones text, p_firma text) TO authenticated;

-- acl: FUNCTION costos_productos()
REVOKE ALL ON FUNCTION public.costos_productos() FROM PUBLIC;
GRANT ALL ON FUNCTION public.costos_productos() TO authenticated;
GRANT ALL ON FUNCTION public.costos_productos() TO service_role;

-- acl: FUNCTION crear_perfil_nuevo_usuario()
GRANT ALL ON FUNCTION public.crear_perfil_nuevo_usuario() TO service_role;

-- acl: FUNCTION devolver_prestamo(p_prestamo_id bigint, p_cantidad numeric, p_forma text, p_nota text, p_ubicacion_id bigint)
REVOKE ALL ON FUNCTION public.devolver_prestamo(p_prestamo_id bigint, p_cantidad numeric, p_forma text, p_nota text, p_ubicacion_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.devolver_prestamo(p_prestamo_id bigint, p_cantidad numeric, p_forma text, p_nota text, p_ubicacion_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.devolver_prestamo(p_prestamo_id bigint, p_cantidad numeric, p_forma text, p_nota text, p_ubicacion_id bigint) TO service_role;

-- acl: FUNCTION es_admin()
GRANT ALL ON FUNCTION public.es_admin() TO service_role;

-- acl: FUNCTION firmar_prestamo(p_prestamo_id bigint, p_firma text, p_firmo text)
REVOKE ALL ON FUNCTION public.firmar_prestamo(p_prestamo_id bigint, p_firma text, p_firmo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.firmar_prestamo(p_prestamo_id bigint, p_firma text, p_firmo text) TO authenticated;

-- acl: FUNCTION guardar_inspeccion(p_tipo text, p_cliente_id bigint, p_equipos jsonb, p_fecha date, p_turno text, p_zona text, p_inspector text, p_observaciones text, p_firma text)
REVOKE ALL ON FUNCTION public.guardar_inspeccion(p_tipo text, p_cliente_id bigint, p_equipos jsonb, p_fecha date, p_turno text, p_zona text, p_inspector text, p_observaciones text, p_firma text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guardar_inspeccion(p_tipo text, p_cliente_id bigint, p_equipos jsonb, p_fecha date, p_turno text, p_zona text, p_inspector text, p_observaciones text, p_firma text) TO authenticated;

-- acl: FUNCTION guardar_producto(p_sku text, p_nombre text, p_unidad_medida text, p_codigo_barras text, p_categoria_id bigint, p_stock_minimo numeric, p_costo_unitario numeric)
REVOKE ALL ON FUNCTION public.guardar_producto(p_sku text, p_nombre text, p_unidad_medida text, p_codigo_barras text, p_categoria_id bigint, p_stock_minimo numeric, p_costo_unitario numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guardar_producto(p_sku text, p_nombre text, p_unidad_medida text, p_codigo_barras text, p_categoria_id bigint, p_stock_minimo numeric, p_costo_unitario numeric) TO authenticated;
GRANT ALL ON FUNCTION public.guardar_producto(p_sku text, p_nombre text, p_unidad_medida text, p_codigo_barras text, p_categoria_id bigint, p_stock_minimo numeric, p_costo_unitario numeric) TO service_role;

-- acl: FUNCTION marcar_actualizado()
GRANT ALL ON FUNCTION public.marcar_actualizado() TO service_role;

-- acl: FUNCTION nacionalizar_transito(p_transito_id bigint, p_ubicacion_id bigint, p_recibidos jsonb)
REVOKE ALL ON FUNCTION public.nacionalizar_transito(p_transito_id bigint, p_ubicacion_id bigint, p_recibidos jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.nacionalizar_transito(p_transito_id bigint, p_ubicacion_id bigint, p_recibidos jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.nacionalizar_transito(p_transito_id bigint, p_ubicacion_id bigint, p_recibidos jsonb) TO service_role;

-- acl: FUNCTION puede_editar()
GRANT ALL ON FUNCTION public.puede_editar() TO service_role;

-- acl: TABLE movimientos
GRANT ALL ON TABLE public.movimientos TO service_role;

-- acl: COLUMN movimientos.id
GRANT SELECT(id) ON TABLE public.movimientos TO authenticated;

-- acl: COLUMN movimientos.tipo
GRANT SELECT(tipo) ON TABLE public.movimientos TO authenticated;

-- acl: COLUMN movimientos.producto_id
GRANT SELECT(producto_id) ON TABLE public.movimientos TO authenticated;

-- acl: COLUMN movimientos.ubicacion_id
GRANT SELECT(ubicacion_id) ON TABLE public.movimientos TO authenticated;

-- acl: COLUMN movimientos.cantidad
GRANT SELECT(cantidad) ON TABLE public.movimientos TO authenticated;

-- acl: COLUMN movimientos.saldo_resultante
GRANT SELECT(saldo_resultante) ON TABLE public.movimientos TO authenticated;

-- acl: COLUMN movimientos.proveedor_id
GRANT SELECT(proveedor_id) ON TABLE public.movimientos TO authenticated;

-- acl: COLUMN movimientos.usuario_id
GRANT SELECT(usuario_id) ON TABLE public.movimientos TO authenticated;

-- acl: COLUMN movimientos.documento_ref
GRANT SELECT(documento_ref) ON TABLE public.movimientos TO authenticated;

-- acl: COLUMN movimientos.nota
GRANT SELECT(nota) ON TABLE public.movimientos TO authenticated;

-- acl: COLUMN movimientos.creado
GRANT SELECT(creado) ON TABLE public.movimientos TO authenticated;

-- acl: COLUMN movimientos.destino
GRANT SELECT(destino) ON TABLE public.movimientos TO authenticated;

-- acl: COLUMN movimientos.funcionario_id
GRANT SELECT(funcionario_id) ON TABLE public.movimientos TO authenticated;

-- acl: COLUMN movimientos.area_id
GRANT SELECT(area_id) ON TABLE public.movimientos TO authenticated;

-- acl: COLUMN movimientos.cliente_id
GRANT SELECT(cliente_id) ON TABLE public.movimientos TO authenticated;

-- acl: COLUMN movimientos.equipo_id
GRANT SELECT(equipo_id) ON TABLE public.movimientos TO authenticated;

-- acl: COLUMN movimientos.firma
GRANT SELECT(firma) ON TABLE public.movimientos TO authenticated;

-- acl: FUNCTION registrar_movimiento(p_producto_id uuid, p_ubicacion_id bigint, p_tipo text, p_cantidad numeric, p_proveedor_id uuid, p_documento_ref text, p_nota text, p_destino text, p_funcionario_id bigint, p_area_id bigint, p_cliente_id bigint, p_costo_unitario numeric, p_equipo_id bigint, p_firma text)
REVOKE ALL ON FUNCTION public.registrar_movimiento(p_producto_id uuid, p_ubicacion_id bigint, p_tipo text, p_cantidad numeric, p_proveedor_id uuid, p_documento_ref text, p_nota text, p_destino text, p_funcionario_id bigint, p_area_id bigint, p_cliente_id bigint, p_costo_unitario numeric, p_equipo_id bigint, p_firma text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.registrar_movimiento(p_producto_id uuid, p_ubicacion_id bigint, p_tipo text, p_cantidad numeric, p_proveedor_id uuid, p_documento_ref text, p_nota text, p_destino text, p_funcionario_id bigint, p_area_id bigint, p_cliente_id bigint, p_costo_unitario numeric, p_equipo_id bigint, p_firma text) TO authenticated;
GRANT ALL ON FUNCTION public.registrar_movimiento(p_producto_id uuid, p_ubicacion_id bigint, p_tipo text, p_cantidad numeric, p_proveedor_id uuid, p_documento_ref text, p_nota text, p_destino text, p_funcionario_id bigint, p_area_id bigint, p_cliente_id bigint, p_costo_unitario numeric, p_equipo_id bigint, p_firma text) TO service_role;

-- acl: FUNCTION registrar_prestamo(p_sentido text, p_empresa text, p_producto_id uuid, p_cantidad numeric, p_ubicacion_id bigint, p_fecha_devolucion date, p_contacto text, p_autorizo text, p_nota text)
REVOKE ALL ON FUNCTION public.registrar_prestamo(p_sentido text, p_empresa text, p_producto_id uuid, p_cantidad numeric, p_ubicacion_id bigint, p_fecha_devolucion date, p_contacto text, p_autorizo text, p_nota text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.registrar_prestamo(p_sentido text, p_empresa text, p_producto_id uuid, p_cantidad numeric, p_ubicacion_id bigint, p_fecha_devolucion date, p_contacto text, p_autorizo text, p_nota text) TO authenticated;
GRANT ALL ON FUNCTION public.registrar_prestamo(p_sentido text, p_empresa text, p_producto_id uuid, p_cantidad numeric, p_ubicacion_id bigint, p_fecha_devolucion date, p_contacto text, p_autorizo text, p_nota text) TO service_role;

-- acl: FUNCTION transito_sin_costos(p_producto_id uuid)
REVOKE ALL ON FUNCTION public.transito_sin_costos(p_producto_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.transito_sin_costos(p_producto_id uuid) TO authenticated;

-- acl: TABLE areas
GRANT SELECT,INSERT,UPDATE ON TABLE public.areas TO authenticated;
GRANT ALL ON TABLE public.areas TO service_role;

-- acl: SEQUENCE areas_id_seq
GRANT SELECT,USAGE ON SEQUENCE public.areas_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.areas_id_seq TO service_role;

-- acl: TABLE categorias
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.categorias TO authenticated;
GRANT ALL ON TABLE public.categorias TO service_role;

-- acl: SEQUENCE categorias_id_seq
GRANT SELECT,USAGE ON SEQUENCE public.categorias_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.categorias_id_seq TO service_role;

-- acl: TABLE clientes
GRANT SELECT,INSERT,UPDATE ON TABLE public.clientes TO authenticated;
GRANT ALL ON TABLE public.clientes TO service_role;

-- acl: SEQUENCE clientes_id_seq
GRANT SELECT,USAGE ON SEQUENCE public.clientes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.clientes_id_seq TO service_role;

-- acl: TABLE conteo_items
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.conteo_items TO authenticated;
GRANT ALL ON TABLE public.conteo_items TO service_role;

-- acl: TABLE conteos
GRANT SELECT,INSERT,UPDATE ON TABLE public.conteos TO authenticated;
GRANT ALL ON TABLE public.conteos TO service_role;

-- acl: SEQUENCE conteos_id_seq
GRANT SELECT,USAGE ON SEQUENCE public.conteos_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.conteos_id_seq TO service_role;

-- acl: TABLE documentos
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.documentos TO authenticated;
GRANT ALL ON TABLE public.documentos TO service_role;

-- acl: SEQUENCE documentos_id_seq
GRANT SELECT,USAGE ON SEQUENCE public.documentos_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.documentos_id_seq TO service_role;

-- acl: TABLE equipos
GRANT SELECT,INSERT,UPDATE ON TABLE public.equipos TO authenticated;
GRANT ALL ON TABLE public.equipos TO service_role;

-- acl: COLUMN equipos.planta
GRANT UPDATE(planta) ON TABLE public.equipos TO authenticated;

-- acl: COLUMN equipos.tanque_litros
GRANT UPDATE(tanque_litros) ON TABLE public.equipos TO authenticated;

-- acl: COLUMN equipos.orden
GRANT UPDATE(orden) ON TABLE public.equipos TO authenticated;

-- acl: SEQUENCE equipos_id_seq
GRANT SELECT,USAGE ON SEQUENCE public.equipos_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.equipos_id_seq TO service_role;

-- acl: TABLE funcionarios
GRANT SELECT,INSERT,UPDATE ON TABLE public.funcionarios TO authenticated;
GRANT ALL ON TABLE public.funcionarios TO service_role;

-- acl: SEQUENCE funcionarios_id_seq
GRANT SELECT,USAGE ON SEQUENCE public.funcionarios_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.funcionarios_id_seq TO service_role;

-- acl: TABLE inspeccion_equipos
GRANT SELECT ON TABLE public.inspeccion_equipos TO authenticated;

-- acl: TABLE inspecciones
GRANT SELECT,DELETE ON TABLE public.inspecciones TO authenticated;

-- acl: TABLE perfiles
GRANT SELECT ON TABLE public.perfiles TO authenticated;
GRANT ALL ON TABLE public.perfiles TO service_role;

-- acl: COLUMN perfiles.nombre
GRANT UPDATE(nombre) ON TABLE public.perfiles TO authenticated;

-- acl: COLUMN perfiles.rol
GRANT UPDATE(rol) ON TABLE public.perfiles TO authenticated;

-- acl: COLUMN perfiles.activo
GRANT UPDATE(activo) ON TABLE public.perfiles TO authenticated;

-- acl: TABLE prestamo_devoluciones
GRANT SELECT ON TABLE public.prestamo_devoluciones TO authenticated;
GRANT ALL ON TABLE public.prestamo_devoluciones TO service_role;

-- acl: SEQUENCE prestamo_devoluciones_id_seq
GRANT SELECT,USAGE ON SEQUENCE public.prestamo_devoluciones_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.prestamo_devoluciones_id_seq TO service_role;

-- acl: TABLE prestamos
GRANT SELECT ON TABLE public.prestamos TO authenticated;
GRANT ALL ON TABLE public.prestamos TO service_role;

-- acl: SEQUENCE prestamos_id_seq
GRANT SELECT,USAGE ON SEQUENCE public.prestamos_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.prestamos_id_seq TO service_role;

-- acl: TABLE productos
GRANT INSERT,DELETE,UPDATE ON TABLE public.productos TO authenticated;
GRANT ALL ON TABLE public.productos TO service_role;

-- acl: COLUMN productos.id
GRANT SELECT(id) ON TABLE public.productos TO authenticated;

-- acl: COLUMN productos.sku
GRANT SELECT(sku) ON TABLE public.productos TO authenticated;

-- acl: COLUMN productos.codigo_barras
GRANT SELECT(codigo_barras) ON TABLE public.productos TO authenticated;

-- acl: COLUMN productos.nombre
GRANT SELECT(nombre) ON TABLE public.productos TO authenticated;

-- acl: COLUMN productos.descripcion
GRANT SELECT(descripcion) ON TABLE public.productos TO authenticated;

-- acl: COLUMN productos.categoria_id
GRANT SELECT(categoria_id) ON TABLE public.productos TO authenticated;

-- acl: COLUMN productos.unidad_medida
GRANT SELECT(unidad_medida) ON TABLE public.productos TO authenticated;

-- acl: COLUMN productos.stock_minimo
GRANT SELECT(stock_minimo) ON TABLE public.productos TO authenticated;

-- acl: COLUMN productos.activo
GRANT SELECT(activo) ON TABLE public.productos TO authenticated;

-- acl: COLUMN productos.creado
GRANT SELECT(creado) ON TABLE public.productos TO authenticated;

-- acl: COLUMN productos.actualizado
GRANT SELECT(actualizado) ON TABLE public.productos TO authenticated;

-- acl: TABLE proveedores
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.proveedores TO authenticated;
GRANT ALL ON TABLE public.proveedores TO service_role;

-- acl: TABLE stock
GRANT SELECT ON TABLE public.stock TO authenticated;
GRANT ALL ON TABLE public.stock TO service_role;

-- acl: TABLE transito_historial
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.transito_historial TO authenticated;
GRANT ALL ON TABLE public.transito_historial TO service_role;

-- acl: SEQUENCE transito_historial_id_seq
GRANT SELECT,USAGE ON SEQUENCE public.transito_historial_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.transito_historial_id_seq TO service_role;

-- acl: TABLE transito_items
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.transito_items TO authenticated;
GRANT ALL ON TABLE public.transito_items TO service_role;

-- acl: SEQUENCE transito_items_id_seq
GRANT SELECT,USAGE ON SEQUENCE public.transito_items_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.transito_items_id_seq TO service_role;

-- acl: TABLE transitos
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.transitos TO authenticated;
GRANT ALL ON TABLE public.transitos TO service_role;

-- acl: SEQUENCE transitos_id_seq
GRANT SELECT,USAGE ON SEQUENCE public.transitos_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.transitos_id_seq TO service_role;

-- acl: TABLE ubicaciones
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ubicaciones TO authenticated;
GRANT ALL ON TABLE public.ubicaciones TO service_role;

-- acl: SEQUENCE ubicaciones_id_seq
GRANT SELECT,USAGE ON SEQUENCE public.ubicaciones_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.ubicaciones_id_seq TO service_role;

-- acl: TABLE v_inventario
GRANT SELECT ON TABLE public.v_inventario TO authenticated;
GRANT ALL ON TABLE public.v_inventario TO service_role;

-- acl: TABLE v_movimientos
GRANT SELECT ON TABLE public.v_movimientos TO authenticated;
GRANT ALL ON TABLE public.v_movimientos TO service_role;

-- acl: TABLE v_prestamos
GRANT SELECT ON TABLE public.v_prestamos TO authenticated;
GRANT ALL ON TABLE public.v_prestamos TO service_role;

-- acl: TABLE v_transito_producto
GRANT SELECT ON TABLE public.v_transito_producto TO authenticated;
GRANT ALL ON TABLE public.v_transito_producto TO service_role;


--


-- ---------------------------------------------------------------------
-- C. ROW LEVEL SECURITY en todas las tablas
-- ---------------------------------------------------------------------
-- row security: areas
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

-- row security: categorias
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;

-- row security: clientes
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- row security: conteo_items
ALTER TABLE public.conteo_items ENABLE ROW LEVEL SECURITY;

-- row security: conteos
ALTER TABLE public.conteos ENABLE ROW LEVEL SECURITY;

-- row security: documentos
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

-- row security: equipos
ALTER TABLE public.equipos ENABLE ROW LEVEL SECURITY;

-- row security: funcionarios
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

-- row security: inspeccion_equipos
ALTER TABLE public.inspeccion_equipos ENABLE ROW LEVEL SECURITY;

-- row security: inspecciones
ALTER TABLE public.inspecciones ENABLE ROW LEVEL SECURITY;

-- row security: movimientos
ALTER TABLE public.movimientos ENABLE ROW LEVEL SECURITY;

-- row security: perfiles
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

-- row security: prestamo_devoluciones
ALTER TABLE public.prestamo_devoluciones ENABLE ROW LEVEL SECURITY;

-- row security: prestamos
ALTER TABLE public.prestamos ENABLE ROW LEVEL SECURITY;

-- row security: productos
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

-- row security: proveedores
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

-- row security: stock
ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;

-- row security: transito_historial
ALTER TABLE public.transito_historial ENABLE ROW LEVEL SECURITY;

-- row security: transito_items
ALTER TABLE public.transito_items ENABLE ROW LEVEL SECURITY;

-- row security: transitos
ALTER TABLE public.transitos ENABLE ROW LEVEL SECURITY;

-- row security: ubicaciones
ALTER TABLE public.ubicaciones ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- D. POLÍTICAS (todas para usuarios con sesión; los roles son admin, bodeguero y consulta)
-- ---------------------------------------------------------------------
-- policy: areas areas_actualizar
CREATE POLICY areas_actualizar ON public.areas FOR UPDATE TO authenticated USING (( SELECT public.puede_editar() AS puede_editar)) WITH CHECK (( SELECT public.puede_editar() AS puede_editar));

-- policy: areas areas_insertar
CREATE POLICY areas_insertar ON public.areas FOR INSERT TO authenticated WITH CHECK (( SELECT public.puede_editar() AS puede_editar));

-- policy: areas areas_lectura
CREATE POLICY areas_lectura ON public.areas FOR SELECT TO authenticated USING (true);

-- policy: categorias categorias_actualizar
CREATE POLICY categorias_actualizar ON public.categorias FOR UPDATE TO authenticated USING (( SELECT public.puede_editar() AS puede_editar)) WITH CHECK (( SELECT public.puede_editar() AS puede_editar));

-- policy: categorias categorias_borrar
CREATE POLICY categorias_borrar ON public.categorias FOR DELETE TO authenticated USING (( SELECT public.es_admin() AS es_admin));

-- policy: categorias categorias_insertar
CREATE POLICY categorias_insertar ON public.categorias FOR INSERT TO authenticated WITH CHECK (( SELECT public.puede_editar() AS puede_editar));

-- policy: categorias categorias_lectura
CREATE POLICY categorias_lectura ON public.categorias FOR SELECT TO authenticated USING (true);

-- policy: clientes clientes_actualizar
CREATE POLICY clientes_actualizar ON public.clientes FOR UPDATE TO authenticated USING (( SELECT public.puede_editar() AS puede_editar)) WITH CHECK (( SELECT public.puede_editar() AS puede_editar));

-- policy: clientes clientes_insertar
CREATE POLICY clientes_insertar ON public.clientes FOR INSERT TO authenticated WITH CHECK (( SELECT public.puede_editar() AS puede_editar));

-- policy: clientes clientes_lectura
CREATE POLICY clientes_lectura ON public.clientes FOR SELECT TO authenticated USING (true);

-- policy: conteo_items conteo_items_borrar
CREATE POLICY conteo_items_borrar ON public.conteo_items FOR DELETE TO authenticated USING ((( SELECT public.puede_editar() AS puede_editar) AND (EXISTS ( SELECT 1
   FROM public.conteos c
  WHERE ((c.id = conteo_items.conteo_id) AND (c.estado = 'ABIERTO'::text))))));

-- policy: conteo_items conteo_items_cambiar
CREATE POLICY conteo_items_cambiar ON public.conteo_items FOR UPDATE TO authenticated USING ((( SELECT public.puede_editar() AS puede_editar) AND (EXISTS ( SELECT 1
   FROM public.conteos c
  WHERE ((c.id = conteo_items.conteo_id) AND (c.estado = 'ABIERTO'::text))))));

-- policy: conteo_items conteo_items_escribir
CREATE POLICY conteo_items_escribir ON public.conteo_items FOR INSERT TO authenticated WITH CHECK ((( SELECT public.puede_editar() AS puede_editar) AND (EXISTS ( SELECT 1
   FROM public.conteos c
  WHERE ((c.id = conteo_items.conteo_id) AND (c.estado = 'ABIERTO'::text))))));

-- policy: conteo_items conteo_items_lectura
CREATE POLICY conteo_items_lectura ON public.conteo_items FOR SELECT TO authenticated USING (true);

-- policy: conteos conteos_anular
CREATE POLICY conteos_anular ON public.conteos FOR UPDATE TO authenticated USING ((( SELECT public.puede_editar() AS puede_editar) AND (estado = 'ABIERTO'::text))) WITH CHECK ((estado = ANY (ARRAY['ABIERTO'::text, 'ANULADO'::text])));

-- policy: conteos conteos_insertar
CREATE POLICY conteos_insertar ON public.conteos FOR INSERT TO authenticated WITH CHECK ((( SELECT public.puede_editar() AS puede_editar) AND (estado = 'ABIERTO'::text)));

-- policy: conteos conteos_lectura
CREATE POLICY conteos_lectura ON public.conteos FOR SELECT TO authenticated USING (true);

-- policy: documentos documentos_admin
CREATE POLICY documentos_admin ON public.documentos TO authenticated USING (( SELECT public.es_admin() AS es_admin)) WITH CHECK (( SELECT public.es_admin() AS es_admin));

-- policy: equipos equipos_actualizar
CREATE POLICY equipos_actualizar ON public.equipos FOR UPDATE TO authenticated USING (( SELECT public.puede_editar() AS puede_editar)) WITH CHECK (( SELECT public.puede_editar() AS puede_editar));

-- policy: equipos equipos_insertar
CREATE POLICY equipos_insertar ON public.equipos FOR INSERT TO authenticated WITH CHECK (( SELECT public.puede_editar() AS puede_editar));

-- policy: equipos equipos_lectura
CREATE POLICY equipos_lectura ON public.equipos FOR SELECT TO authenticated USING (true);

-- policy: funcionarios funcionarios_actualizar
CREATE POLICY funcionarios_actualizar ON public.funcionarios FOR UPDATE TO authenticated USING (( SELECT public.puede_editar() AS puede_editar)) WITH CHECK (( SELECT public.puede_editar() AS puede_editar));

-- policy: funcionarios funcionarios_insertar
CREATE POLICY funcionarios_insertar ON public.funcionarios FOR INSERT TO authenticated WITH CHECK (( SELECT public.puede_editar() AS puede_editar));

-- policy: funcionarios funcionarios_lectura
CREATE POLICY funcionarios_lectura ON public.funcionarios FOR SELECT TO authenticated USING (true);

-- policy: inspeccion_equipos inspeccion_equipos_lectura
CREATE POLICY inspeccion_equipos_lectura ON public.inspeccion_equipos FOR SELECT TO authenticated USING (true);

-- policy: inspecciones inspecciones_borrar
CREATE POLICY inspecciones_borrar ON public.inspecciones FOR DELETE TO authenticated USING (( SELECT public.es_admin() AS es_admin));

-- policy: inspecciones inspecciones_lectura
CREATE POLICY inspecciones_lectura ON public.inspecciones FOR SELECT TO authenticated USING (true);

-- policy: movimientos movimientos_lectura
CREATE POLICY movimientos_lectura ON public.movimientos FOR SELECT TO authenticated USING (true);

-- policy: perfiles perfiles_admin_actualiza
CREATE POLICY perfiles_admin_actualiza ON public.perfiles FOR UPDATE TO authenticated USING (( SELECT public.es_admin() AS es_admin)) WITH CHECK (( SELECT public.es_admin() AS es_admin));

-- policy: perfiles perfiles_lectura
CREATE POLICY perfiles_lectura ON public.perfiles FOR SELECT TO authenticated USING (true);

-- policy: prestamo_devoluciones prestamo_devoluciones_lectura
CREATE POLICY prestamo_devoluciones_lectura ON public.prestamo_devoluciones FOR SELECT TO authenticated USING (( SELECT public.puede_editar() AS puede_editar));

-- policy: prestamos prestamos_lectura
CREATE POLICY prestamos_lectura ON public.prestamos FOR SELECT TO authenticated USING (( SELECT public.puede_editar() AS puede_editar));

-- policy: productos productos_actualizar
CREATE POLICY productos_actualizar ON public.productos FOR UPDATE TO authenticated USING (( SELECT public.puede_editar() AS puede_editar)) WITH CHECK (( SELECT public.puede_editar() AS puede_editar));

-- policy: productos productos_borrar
CREATE POLICY productos_borrar ON public.productos FOR DELETE TO authenticated USING (( SELECT public.es_admin() AS es_admin));

-- policy: productos productos_insertar
CREATE POLICY productos_insertar ON public.productos FOR INSERT TO authenticated WITH CHECK (( SELECT public.puede_editar() AS puede_editar));

-- policy: productos productos_lectura
CREATE POLICY productos_lectura ON public.productos FOR SELECT TO authenticated USING (true);

-- policy: proveedores proveedores_actualizar
CREATE POLICY proveedores_actualizar ON public.proveedores FOR UPDATE TO authenticated USING (( SELECT public.puede_editar() AS puede_editar)) WITH CHECK (( SELECT public.puede_editar() AS puede_editar));

-- policy: proveedores proveedores_borrar
CREATE POLICY proveedores_borrar ON public.proveedores FOR DELETE TO authenticated USING (( SELECT public.es_admin() AS es_admin));

-- policy: proveedores proveedores_insertar
CREATE POLICY proveedores_insertar ON public.proveedores FOR INSERT TO authenticated WITH CHECK (( SELECT public.puede_editar() AS puede_editar));

-- policy: proveedores proveedores_lectura
CREATE POLICY proveedores_lectura ON public.proveedores FOR SELECT TO authenticated USING (true);

-- policy: stock stock_lectura
CREATE POLICY stock_lectura ON public.stock FOR SELECT TO authenticated USING (true);

-- policy: transito_historial transito_historial_admin
CREATE POLICY transito_historial_admin ON public.transito_historial TO authenticated USING (( SELECT public.es_admin() AS es_admin)) WITH CHECK (( SELECT public.es_admin() AS es_admin));

-- policy: transito_items transito_items_admin
CREATE POLICY transito_items_admin ON public.transito_items TO authenticated USING (( SELECT public.es_admin() AS es_admin)) WITH CHECK (( SELECT public.es_admin() AS es_admin));

-- policy: transitos transitos_admin
CREATE POLICY transitos_admin ON public.transitos TO authenticated USING (( SELECT public.es_admin() AS es_admin)) WITH CHECK (( SELECT public.es_admin() AS es_admin));

-- policy: ubicaciones ubicaciones_actualizar
CREATE POLICY ubicaciones_actualizar ON public.ubicaciones FOR UPDATE TO authenticated USING (( SELECT public.puede_editar() AS puede_editar)) WITH CHECK (( SELECT public.puede_editar() AS puede_editar));

-- policy: ubicaciones ubicaciones_borrar
CREATE POLICY ubicaciones_borrar ON public.ubicaciones FOR DELETE TO authenticated USING (( SELECT public.es_admin() AS es_admin));

-- policy: ubicaciones ubicaciones_insertar
CREATE POLICY ubicaciones_insertar ON public.ubicaciones FOR INSERT TO authenticated WITH CHECK (( SELECT public.puede_editar() AS puede_editar));

-- policy: ubicaciones ubicaciones_lectura
CREATE POLICY ubicaciones_lectura ON public.ubicaciones FOR SELECT TO authenticated USING (true);


-- Verificación: rls_activo = 21 y politicas = 48
select (select count(*) from pg_tables where schemaname = 'public' and rowsecurity) as rls_activo,
       (select count(*) from pg_policies where schemaname = 'public') as politicas;
