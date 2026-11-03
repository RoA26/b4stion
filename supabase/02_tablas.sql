-- =====================================================================
-- 02 · TABLAS, SECUENCIAS (identity), RESTRICCIONES, ÍNDICES Y LLAVES FORÁNEAS
-- Sistema de inventario (antes Poliway/Blaster) · reconstrucción en un Supabase NUEVO
-- Sacado del esquema real ya instalado (scripts 01 a 14). Las FK van al final.
-- Ejecutar UNA sola vez, completo, en Supabase > SQL Editor > + New query > Run.
-- =====================================================================

set check_function_bodies = false;

-- table: movimientos
CREATE TABLE public.movimientos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL,
    producto_id uuid NOT NULL,
    ubicacion_id bigint NOT NULL,
    cantidad numeric(14,3) NOT NULL,
    saldo_resultante numeric(14,3) NOT NULL,
    proveedor_id uuid,
    usuario_id uuid NOT NULL,
    documento_ref text,
    nota text,
    creado timestamp with time zone DEFAULT now() NOT NULL,
    destino text,
    funcionario_id bigint,
    area_id bigint,
    cliente_id bigint,
    costo_unitario numeric(14,2),
    equipo_id bigint,
    firma text,
    CONSTRAINT cantidad_valida CHECK ((((tipo = ANY (ARRAY['ENTRADA'::text, 'SALIDA'::text])) AND (cantidad > (0)::numeric)) OR ((tipo = 'AJUSTE'::text) AND (cantidad <> (0)::numeric)))),
    CONSTRAINT movimientos_destino_check CHECK ((destino = ANY (ARRAY['FUNCIONARIO'::text, 'CLIENTE'::text, 'PRESTAMO'::text]))),
    CONSTRAINT movimientos_tipo_check CHECK ((tipo = ANY (ARRAY['ENTRADA'::text, 'SALIDA'::text, 'AJUSTE'::text])))
);

-- table: areas
CREATE TABLE public.areas (
    id bigint NOT NULL,
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado timestamp with time zone DEFAULT now() NOT NULL
);

-- table: categorias
CREATE TABLE public.categorias (
    id bigint NOT NULL,
    nombre text NOT NULL,
    creado timestamp with time zone DEFAULT now() NOT NULL
);

-- table: clientes
CREATE TABLE public.clientes (
    id bigint NOT NULL,
    nombre text NOT NULL,
    nit text,
    ciudad text,
    activo boolean DEFAULT true NOT NULL,
    creado timestamp with time zone DEFAULT now() NOT NULL
);

-- table: conteo_items
CREATE TABLE public.conteo_items (
    conteo_id bigint NOT NULL,
    producto_id uuid NOT NULL,
    cantidad numeric(14,3) NOT NULL,
    contado_por uuid DEFAULT auth.uid(),
    actualizado timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conteo_items_cantidad_check CHECK ((cantidad >= (0)::numeric))
);

-- table: conteos
CREATE TABLE public.conteos (
    id bigint NOT NULL,
    ubicacion_id bigint NOT NULL,
    estado text DEFAULT 'ABIERTO'::text NOT NULL,
    nota text,
    creado_por uuid DEFAULT auth.uid(),
    creado timestamp with time zone DEFAULT now() NOT NULL,
    cerrado_por uuid,
    cerrado timestamp with time zone,
    ajustes integer,
    CONSTRAINT conteos_estado_check CHECK ((estado = ANY (ARRAY['ABIERTO'::text, 'APROBADO'::text, 'ANULADO'::text])))
);

-- table: documentos
CREATE TABLE public.documentos (
    id bigint NOT NULL,
    carpeta text NOT NULL,
    numero text,
    tercero text,
    nombre_archivo text NOT NULL,
    tamano bigint DEFAULT 0 NOT NULL,
    ruta text NOT NULL,
    transito_id bigint,
    creado timestamp with time zone DEFAULT now() NOT NULL,
    creado_por uuid DEFAULT auth.uid(),
    CONSTRAINT documentos_carpeta_check CHECK ((carpeta = ANY (ARRAY['TRANSITO'::text, 'LISTA'::text, 'CONTEO'::text, 'OTRO'::text])))
);

-- table: equipos
CREATE TABLE public.equipos (
    id bigint NOT NULL,
    cliente_id bigint NOT NULL,
    modelo text NOT NULL,
    serial text,
    planta text,
    fecha_instalacion date,
    notas text,
    activo boolean DEFAULT true NOT NULL,
    creado timestamp with time zone DEFAULT now() NOT NULL,
    tanque_litros integer,
    orden integer,
    CONSTRAINT equipos_modelo_check CHECK ((modelo = ANY (ARRAY['Destroyer'::text, 'XHV'::text, 'Capol'::text, 'Otro'::text]))),
    CONSTRAINT equipos_tanque_litros_check CHECK (((tanque_litros IS NULL) OR (tanque_litros > 0)))
);

-- table: funcionarios
CREATE TABLE public.funcionarios (
    id bigint NOT NULL,
    nombre text NOT NULL,
    documento text,
    cargo text,
    activo boolean DEFAULT true NOT NULL,
    creado timestamp with time zone DEFAULT now() NOT NULL
);

-- table: inspeccion_equipos
CREATE TABLE public.inspeccion_equipos (
    id bigint NOT NULL,
    inspeccion_id bigint NOT NULL,
    equipo_id bigint NOT NULL,
    resultados jsonb DEFAULT '{}'::jsonb NOT NULL,
    hallazgos text[] DEFAULT '{}'::text[] NOT NULL,
    mediciones jsonb DEFAULT '{}'::jsonb NOT NULL,
    observacion text
);

-- table: inspecciones
CREATE TABLE public.inspecciones (
    id bigint NOT NULL,
    tipo text NOT NULL,
    cliente_id bigint NOT NULL,
    fecha date DEFAULT ((now() AT TIME ZONE 'America/Bogota'::text))::date NOT NULL,
    turno text,
    zona text,
    inspector text,
    observaciones text,
    firma text,
    tecnico_id uuid DEFAULT auth.uid(),
    creado timestamp with time zone DEFAULT now() NOT NULL,
    corregida timestamp with time zone,
    corregida_por text,
    correcciones integer DEFAULT 0 NOT NULL,
    CONSTRAINT inspecciones_tipo_check CHECK ((tipo = ANY (ARRAY['RONDA'::text, 'DETALLE'::text])))
);

-- table: perfiles
CREATE TABLE public.perfiles (
    id uuid NOT NULL,
    nombre text NOT NULL,
    rol text DEFAULT 'consulta'::text NOT NULL,
    creado timestamp with time zone DEFAULT now() NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    CONSTRAINT perfiles_rol_check CHECK ((rol = ANY (ARRAY['admin'::text, 'bodeguero'::text, 'consulta'::text])))
);

-- table: prestamo_devoluciones
CREATE TABLE public.prestamo_devoluciones (
    id bigint NOT NULL,
    prestamo_id bigint NOT NULL,
    cantidad numeric(14,3) NOT NULL,
    forma text NOT NULL,
    nota text,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    usuario_id uuid DEFAULT auth.uid(),
    CONSTRAINT prestamo_devoluciones_cantidad_check CHECK ((cantidad >= (0)::numeric)),
    CONSTRAINT prestamo_devoluciones_forma_check CHECK ((forma = ANY (ARRAY['PRODUCTO'::text, 'OTRA'::text])))
);

-- table: prestamos
CREATE TABLE public.prestamos (
    id bigint NOT NULL,
    sentido text NOT NULL,
    empresa text NOT NULL,
    contacto text,
    producto_id uuid NOT NULL,
    ubicacion_id bigint NOT NULL,
    cantidad numeric(14,3) NOT NULL,
    devuelto numeric(14,3) DEFAULT 0 NOT NULL,
    fecha date DEFAULT ((now() AT TIME ZONE 'America/Bogota'::text))::date NOT NULL,
    fecha_devolucion date,
    autorizo text,
    nota text,
    estado text DEFAULT 'PENDIENTE'::text NOT NULL,
    creado timestamp with time zone DEFAULT now() NOT NULL,
    creado_por uuid DEFAULT auth.uid(),
    firma text,
    firmo text,
    CONSTRAINT prestamos_cantidad_check CHECK ((cantidad > (0)::numeric)),
    CONSTRAINT prestamos_estado_check CHECK ((estado = ANY (ARRAY['PENDIENTE'::text, 'PARCIAL'::text, 'DEVUELTO'::text, 'SALDADO'::text]))),
    CONSTRAINT prestamos_sentido_check CHECK ((sentido = ANY (ARRAY['SALIDA'::text, 'ENTRADA'::text])))
);

-- table: productos
CREATE TABLE public.productos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sku text NOT NULL,
    codigo_barras text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    categoria_id bigint,
    unidad_medida text NOT NULL,
    stock_minimo numeric(14,3) DEFAULT 0 NOT NULL,
    costo_unitario numeric(14,2) DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado timestamp with time zone DEFAULT now() NOT NULL,
    actualizado timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT productos_costo_unitario_check CHECK ((costo_unitario >= (0)::numeric)),
    CONSTRAINT productos_stock_minimo_check CHECK ((stock_minimo >= (0)::numeric)),
    CONSTRAINT productos_unidad_medida_check CHECK ((unidad_medida = ANY (ARRAY['UND'::text, 'M'::text, 'M2'::text, 'KG'::text, 'ROLLO'::text])))
);

-- table: proveedores
CREATE TABLE public.proveedores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nit text,
    nombre text NOT NULL,
    telefono text,
    correo text,
    creado timestamp with time zone DEFAULT now() NOT NULL
);

-- table: stock
CREATE TABLE public.stock (
    producto_id uuid NOT NULL,
    ubicacion_id bigint NOT NULL,
    cantidad numeric(14,3) DEFAULT 0 NOT NULL,
    actualizado timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_cantidad_check CHECK ((cantidad >= (0)::numeric))
);

-- table: transito_historial
CREATE TABLE public.transito_historial (
    id bigint NOT NULL,
    transito_id bigint NOT NULL,
    estado text NOT NULL,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    usuario_id uuid DEFAULT auth.uid(),
    nota text
);

-- table: transito_items
CREATE TABLE public.transito_items (
    id bigint NOT NULL,
    transito_id bigint NOT NULL,
    producto_id uuid,
    codigo text NOT NULL,
    descripcion text,
    cantidad numeric(14,3) NOT NULL,
    valor_unitario numeric(14,2),
    recibido numeric(14,3),
    novedad text,
    CONSTRAINT transito_items_cantidad_check CHECK ((cantidad > (0)::numeric)),
    CONSTRAINT transito_items_recibido_check CHECK ((recibido >= (0)::numeric)),
    CONSTRAINT transito_items_valor_unitario_check CHECK ((valor_unitario >= (0)::numeric))
);

-- table: transitos
CREATE TABLE public.transitos (
    id bigint NOT NULL,
    numero text NOT NULL,
    proveedor text DEFAULT 'Poliway Brasil'::text NOT NULL,
    fecha_pedido date,
    fecha_salida date,
    transporte text,
    guia text,
    transportador text,
    eta date,
    estado text DEFAULT 'PEDIDO'::text NOT NULL,
    nacionalizado timestamp with time zone,
    ubicacion_id bigint,
    nota text,
    creado timestamp with time zone DEFAULT now() NOT NULL,
    creado_por uuid DEFAULT auth.uid(),
    CONSTRAINT transitos_estado_check CHECK ((estado = ANY (ARRAY['PEDIDO'::text, 'SALIO'::text, 'TRANSITO'::text, 'ADUANA'::text, 'NACIONALIZADO'::text, 'ANULADO'::text]))),
    CONSTRAINT transitos_transporte_check CHECK ((transporte = ANY (ARRAY['MARITIMO'::text, 'TERRESTRE'::text, 'AEREO'::text])))
);

-- table: ubicaciones
CREATE TABLE public.ubicaciones (
    id bigint NOT NULL,
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado timestamp with time zone DEFAULT now() NOT NULL
);

-- sequence: areas_id_seq
ALTER TABLE public.areas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.areas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- sequence: categorias_id_seq
ALTER TABLE public.categorias ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.categorias_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- sequence: clientes_id_seq
ALTER TABLE public.clientes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.clientes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- sequence: conteos_id_seq
ALTER TABLE public.conteos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.conteos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- sequence: documentos_id_seq
ALTER TABLE public.documentos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.documentos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- sequence: equipos_id_seq
ALTER TABLE public.equipos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.equipos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- sequence: funcionarios_id_seq
ALTER TABLE public.funcionarios ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.funcionarios_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- sequence: inspeccion_equipos_id_seq
ALTER TABLE public.inspeccion_equipos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.inspeccion_equipos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- sequence: inspecciones_id_seq
ALTER TABLE public.inspecciones ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.inspecciones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- sequence: prestamo_devoluciones_id_seq
ALTER TABLE public.prestamo_devoluciones ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.prestamo_devoluciones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- sequence: prestamos_id_seq
ALTER TABLE public.prestamos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.prestamos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- sequence: transito_historial_id_seq
ALTER TABLE public.transito_historial ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.transito_historial_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- sequence: transito_items_id_seq
ALTER TABLE public.transito_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.transito_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- sequence: transitos_id_seq
ALTER TABLE public.transitos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.transitos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- sequence: ubicaciones_id_seq
ALTER TABLE public.ubicaciones ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ubicaciones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- constraint: areas areas_nombre_key
ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_nombre_key UNIQUE (nombre);

-- constraint: areas areas_pkey
ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_pkey PRIMARY KEY (id);

-- constraint: categorias categorias_nombre_key
ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_nombre_key UNIQUE (nombre);

-- constraint: categorias categorias_pkey
ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (id);

-- constraint: clientes clientes_nit_key
ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_nit_key UNIQUE (nit);

-- constraint: clientes clientes_pkey
ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);

-- constraint: conteo_items conteo_items_pkey
ALTER TABLE ONLY public.conteo_items
    ADD CONSTRAINT conteo_items_pkey PRIMARY KEY (conteo_id, producto_id);

-- constraint: conteos conteos_pkey
ALTER TABLE ONLY public.conteos
    ADD CONSTRAINT conteos_pkey PRIMARY KEY (id);

-- constraint: documentos documentos_pkey
ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT documentos_pkey PRIMARY KEY (id);

-- constraint: equipos equipos_pkey
ALTER TABLE ONLY public.equipos
    ADD CONSTRAINT equipos_pkey PRIMARY KEY (id);

-- constraint: funcionarios funcionarios_documento_key
ALTER TABLE ONLY public.funcionarios
    ADD CONSTRAINT funcionarios_documento_key UNIQUE (documento);

-- constraint: funcionarios funcionarios_pkey
ALTER TABLE ONLY public.funcionarios
    ADD CONSTRAINT funcionarios_pkey PRIMARY KEY (id);

-- constraint: inspeccion_equipos inspeccion_equipos_inspeccion_id_equipo_id_key
ALTER TABLE ONLY public.inspeccion_equipos
    ADD CONSTRAINT inspeccion_equipos_inspeccion_id_equipo_id_key UNIQUE (inspeccion_id, equipo_id);

-- constraint: inspeccion_equipos inspeccion_equipos_pkey
ALTER TABLE ONLY public.inspeccion_equipos
    ADD CONSTRAINT inspeccion_equipos_pkey PRIMARY KEY (id);

-- constraint: inspecciones inspecciones_pkey
ALTER TABLE ONLY public.inspecciones
    ADD CONSTRAINT inspecciones_pkey PRIMARY KEY (id);

-- constraint: movimientos movimientos_pkey
ALTER TABLE ONLY public.movimientos
    ADD CONSTRAINT movimientos_pkey PRIMARY KEY (id);

-- constraint: perfiles perfiles_pkey
ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT perfiles_pkey PRIMARY KEY (id);

-- constraint: prestamo_devoluciones prestamo_devoluciones_pkey
ALTER TABLE ONLY public.prestamo_devoluciones
    ADD CONSTRAINT prestamo_devoluciones_pkey PRIMARY KEY (id);

-- constraint: prestamos prestamos_pkey
ALTER TABLE ONLY public.prestamos
    ADD CONSTRAINT prestamos_pkey PRIMARY KEY (id);

-- constraint: productos productos_codigo_barras_key
ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_codigo_barras_key UNIQUE (codigo_barras);

-- constraint: productos productos_pkey
ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_pkey PRIMARY KEY (id);

-- constraint: productos productos_sku_key
ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_sku_key UNIQUE (sku);

-- constraint: proveedores proveedores_nit_key
ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT proveedores_nit_key UNIQUE (nit);

-- constraint: proveedores proveedores_pkey
ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT proveedores_pkey PRIMARY KEY (id);

-- constraint: stock stock_pkey
ALTER TABLE ONLY public.stock
    ADD CONSTRAINT stock_pkey PRIMARY KEY (producto_id, ubicacion_id);

-- constraint: transito_historial transito_historial_pkey
ALTER TABLE ONLY public.transito_historial
    ADD CONSTRAINT transito_historial_pkey PRIMARY KEY (id);

-- constraint: transito_items transito_items_pkey
ALTER TABLE ONLY public.transito_items
    ADD CONSTRAINT transito_items_pkey PRIMARY KEY (id);

-- constraint: transitos transitos_pkey
ALTER TABLE ONLY public.transitos
    ADD CONSTRAINT transitos_pkey PRIMARY KEY (id);

-- constraint: ubicaciones ubicaciones_nombre_key
ALTER TABLE ONLY public.ubicaciones
    ADD CONSTRAINT ubicaciones_nombre_key UNIQUE (nombre);

-- constraint: ubicaciones ubicaciones_pkey
ALTER TABLE ONLY public.ubicaciones
    ADD CONSTRAINT ubicaciones_pkey PRIMARY KEY (id);

-- index: documentos_archivo_unico
CREATE UNIQUE INDEX documentos_archivo_unico ON public.documentos USING btree (nombre_archivo, tamano);

-- index: documentos_numero_unico
CREATE UNIQUE INDEX documentos_numero_unico ON public.documentos USING btree (carpeta, upper(numero)) WHERE (numero IS NOT NULL);

-- index: equipos_cliente_serial_uk
CREATE UNIQUE INDEX equipos_cliente_serial_uk ON public.equipos USING btree (cliente_id, upper(serial)) WHERE (serial IS NOT NULL);

-- index: idx_movimientos_fecha
CREATE INDEX idx_movimientos_fecha ON public.movimientos USING btree (creado DESC);

-- index: idx_movimientos_producto
CREATE INDEX idx_movimientos_producto ON public.movimientos USING btree (producto_id, creado DESC);

-- index: idx_productos_categoria
CREATE INDEX idx_productos_categoria ON public.productos USING btree (categoria_id);

-- index: inspeccion_equipos_equipo_idx
CREATE INDEX inspeccion_equipos_equipo_idx ON public.inspeccion_equipos USING btree (equipo_id);

-- index: inspecciones_cliente_idx
CREATE INDEX inspecciones_cliente_idx ON public.inspecciones USING btree (cliente_id, fecha DESC);

-- index: transito_items_producto
CREATE INDEX transito_items_producto ON public.transito_items USING btree (producto_id);

-- index: transito_items_transito
CREATE INDEX transito_items_transito ON public.transito_items USING btree (transito_id);

-- index: transitos_numero_unico
CREATE UNIQUE INDEX transitos_numero_unico ON public.transitos USING btree (upper(proveedor), upper(numero));

-- fk constraint: conteo_items conteo_items_contado_por_fkey
ALTER TABLE ONLY public.conteo_items
    ADD CONSTRAINT conteo_items_contado_por_fkey FOREIGN KEY (contado_por) REFERENCES public.perfiles(id);

-- fk constraint: conteo_items conteo_items_conteo_id_fkey
ALTER TABLE ONLY public.conteo_items
    ADD CONSTRAINT conteo_items_conteo_id_fkey FOREIGN KEY (conteo_id) REFERENCES public.conteos(id) ON DELETE CASCADE;

-- fk constraint: conteo_items conteo_items_producto_id_fkey
ALTER TABLE ONLY public.conteo_items
    ADD CONSTRAINT conteo_items_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE RESTRICT;

-- fk constraint: conteos conteos_cerrado_por_fkey
ALTER TABLE ONLY public.conteos
    ADD CONSTRAINT conteos_cerrado_por_fkey FOREIGN KEY (cerrado_por) REFERENCES public.perfiles(id);

-- fk constraint: conteos conteos_creado_por_fkey
ALTER TABLE ONLY public.conteos
    ADD CONSTRAINT conteos_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.perfiles(id);

-- fk constraint: conteos conteos_ubicacion_id_fkey
ALTER TABLE ONLY public.conteos
    ADD CONSTRAINT conteos_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES public.ubicaciones(id) ON DELETE RESTRICT;

-- fk constraint: documentos documentos_creado_por_fkey
ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT documentos_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.perfiles(id);

-- fk constraint: documentos documentos_transito_id_fkey
ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT documentos_transito_id_fkey FOREIGN KEY (transito_id) REFERENCES public.transitos(id) ON DELETE SET NULL;

-- fk constraint: equipos equipos_cliente_id_fkey
ALTER TABLE ONLY public.equipos
    ADD CONSTRAINT equipos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;

-- fk constraint: inspeccion_equipos inspeccion_equipos_equipo_id_fkey
ALTER TABLE ONLY public.inspeccion_equipos
    ADD CONSTRAINT inspeccion_equipos_equipo_id_fkey FOREIGN KEY (equipo_id) REFERENCES public.equipos(id) ON DELETE RESTRICT;

-- fk constraint: inspeccion_equipos inspeccion_equipos_inspeccion_id_fkey
ALTER TABLE ONLY public.inspeccion_equipos
    ADD CONSTRAINT inspeccion_equipos_inspeccion_id_fkey FOREIGN KEY (inspeccion_id) REFERENCES public.inspecciones(id) ON DELETE CASCADE;

-- fk constraint: inspecciones inspecciones_cliente_id_fkey
ALTER TABLE ONLY public.inspecciones
    ADD CONSTRAINT inspecciones_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;

-- fk constraint: inspecciones inspecciones_tecnico_id_fkey
ALTER TABLE ONLY public.inspecciones
    ADD CONSTRAINT inspecciones_tecnico_id_fkey FOREIGN KEY (tecnico_id) REFERENCES public.perfiles(id);

-- fk constraint: movimientos movimientos_area_id_fkey
ALTER TABLE ONLY public.movimientos
    ADD CONSTRAINT movimientos_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE RESTRICT;

-- fk constraint: movimientos movimientos_cliente_id_fkey
ALTER TABLE ONLY public.movimientos
    ADD CONSTRAINT movimientos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;

-- fk constraint: movimientos movimientos_equipo_id_fkey
ALTER TABLE ONLY public.movimientos
    ADD CONSTRAINT movimientos_equipo_id_fkey FOREIGN KEY (equipo_id) REFERENCES public.equipos(id) ON DELETE RESTRICT;

-- fk constraint: movimientos movimientos_funcionario_id_fkey
ALTER TABLE ONLY public.movimientos
    ADD CONSTRAINT movimientos_funcionario_id_fkey FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE RESTRICT;

-- fk constraint: movimientos movimientos_producto_id_fkey
ALTER TABLE ONLY public.movimientos
    ADD CONSTRAINT movimientos_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE RESTRICT;

-- fk constraint: movimientos movimientos_proveedor_id_fkey
ALTER TABLE ONLY public.movimientos
    ADD CONSTRAINT movimientos_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id) ON DELETE RESTRICT;

-- fk constraint: movimientos movimientos_ubicacion_id_fkey
ALTER TABLE ONLY public.movimientos
    ADD CONSTRAINT movimientos_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES public.ubicaciones(id) ON DELETE RESTRICT;

-- fk constraint: movimientos movimientos_usuario_id_fkey
ALTER TABLE ONLY public.movimientos
    ADD CONSTRAINT movimientos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.perfiles(id) ON DELETE RESTRICT;

-- fk constraint: perfiles perfiles_id_fkey
ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT perfiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- fk constraint: prestamo_devoluciones prestamo_devoluciones_prestamo_id_fkey
ALTER TABLE ONLY public.prestamo_devoluciones
    ADD CONSTRAINT prestamo_devoluciones_prestamo_id_fkey FOREIGN KEY (prestamo_id) REFERENCES public.prestamos(id) ON DELETE CASCADE;

-- fk constraint: prestamo_devoluciones prestamo_devoluciones_usuario_id_fkey
ALTER TABLE ONLY public.prestamo_devoluciones
    ADD CONSTRAINT prestamo_devoluciones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.perfiles(id);

-- fk constraint: prestamos prestamos_creado_por_fkey
ALTER TABLE ONLY public.prestamos
    ADD CONSTRAINT prestamos_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.perfiles(id);

-- fk constraint: prestamos prestamos_producto_id_fkey
ALTER TABLE ONLY public.prestamos
    ADD CONSTRAINT prestamos_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id);

-- fk constraint: prestamos prestamos_ubicacion_id_fkey
ALTER TABLE ONLY public.prestamos
    ADD CONSTRAINT prestamos_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES public.ubicaciones(id);

-- fk constraint: productos productos_categoria_id_fkey
ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE RESTRICT;

-- fk constraint: stock stock_producto_id_fkey
ALTER TABLE ONLY public.stock
    ADD CONSTRAINT stock_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE RESTRICT;

-- fk constraint: stock stock_ubicacion_id_fkey
ALTER TABLE ONLY public.stock
    ADD CONSTRAINT stock_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES public.ubicaciones(id) ON DELETE RESTRICT;

-- fk constraint: transito_historial transito_historial_transito_id_fkey
ALTER TABLE ONLY public.transito_historial
    ADD CONSTRAINT transito_historial_transito_id_fkey FOREIGN KEY (transito_id) REFERENCES public.transitos(id) ON DELETE CASCADE;

-- fk constraint: transito_historial transito_historial_usuario_id_fkey
ALTER TABLE ONLY public.transito_historial
    ADD CONSTRAINT transito_historial_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.perfiles(id);

-- fk constraint: transito_items transito_items_producto_id_fkey
ALTER TABLE ONLY public.transito_items
    ADD CONSTRAINT transito_items_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id);

-- fk constraint: transito_items transito_items_transito_id_fkey
ALTER TABLE ONLY public.transito_items
    ADD CONSTRAINT transito_items_transito_id_fkey FOREIGN KEY (transito_id) REFERENCES public.transitos(id) ON DELETE CASCADE;

-- fk constraint: transitos transitos_creado_por_fkey
ALTER TABLE ONLY public.transitos
    ADD CONSTRAINT transitos_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.perfiles(id);

-- fk constraint: transitos transitos_ubicacion_id_fkey
ALTER TABLE ONLY public.transitos
    ADD CONSTRAINT transitos_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES public.ubicaciones(id);

-- Verificación: deben ser 21 tablas
select count(*) as tablas from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE';
