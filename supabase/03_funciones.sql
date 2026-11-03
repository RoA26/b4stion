-- =====================================================================
-- 03 · FUNCIONES (código completo)
-- Sistema de inventario (antes Poliway/Blaster) · reconstrucción en un Supabase NUEVO
-- Los permisos (GRANT/REVOKE) de cada función están en el archivo 06.
-- Ejecutar UNA sola vez, completo, en Supabase > SQL Editor > + New query > Run.
-- =====================================================================

set check_function_bodies = false;

-- function: aprobar_conteo(bigint)
CREATE FUNCTION public.aprobar_conteo(p_conteo_id bigint) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_conteo  public.conteos;
  v_item    record;
  v_actual  numeric;
  v_dif     numeric;
  v_costo   numeric;
  v_ajustes int := 0;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede aprobar conteos' using errcode = '42501';
  end if;

  select * into v_conteo from public.conteos where id = p_conteo_id for update;
  if not found then
    raise exception 'El conteo no existe' using errcode = '22023';
  end if;
  if v_conteo.estado <> 'ABIERTO' then
    raise exception 'Este conteo ya fue cerrado' using errcode = '22023';
  end if;

  for v_item in select * from public.conteo_items where conteo_id = p_conteo_id loop
    select costo_unitario into v_costo from public.productos where id = v_item.producto_id for update;

    insert into public.stock (producto_id, ubicacion_id, cantidad)
    values (v_item.producto_id, v_conteo.ubicacion_id, 0)
    on conflict (producto_id, ubicacion_id) do nothing;

    select cantidad into v_actual from public.stock
     where producto_id = v_item.producto_id and ubicacion_id = v_conteo.ubicacion_id
       for update;

    v_dif := v_item.cantidad - v_actual;
    if v_dif <> 0 then
      update public.stock set cantidad = v_item.cantidad, actualizado = now()
       where producto_id = v_item.producto_id and ubicacion_id = v_conteo.ubicacion_id;

      insert into public.movimientos
        (tipo, producto_id, ubicacion_id, cantidad, saldo_resultante, usuario_id, nota, costo_unitario)
      values
        ('AJUSTE', v_item.producto_id, v_conteo.ubicacion_id, v_dif, v_item.cantidad, auth.uid(),
         'Conteo físico #' || p_conteo_id, v_costo);
      v_ajustes := v_ajustes + 1;
    end if;
  end loop;

  update public.conteos
     set estado = 'APROBADO', cerrado_por = auth.uid(), cerrado = now(), ajustes = v_ajustes
   where id = p_conteo_id;

  return v_ajustes;
end;
$$;

-- function: avanzar_transito(bigint, text, text)
CREATE FUNCTION public.avanzar_transito(p_transito_id bigint, p_estado text, p_nota text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_estado text := upper(trim(p_estado));
  v_actual text;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador maneja la mercancía en tránsito' using errcode = '42501';
  end if;
  if v_estado not in ('PEDIDO', 'SALIO', 'TRANSITO', 'ADUANA', 'ANULADO') then
    raise exception 'Etapa inválida: %', p_estado using errcode = '22023';
  end if;
  select estado into v_actual from public.transitos where id = p_transito_id for update;
  if not found then
    raise exception 'El pedido no existe' using errcode = '22023';
  end if;
  if v_actual in ('NACIONALIZADO', 'ANULADO') then
    raise exception 'El pedido ya está cerrado (%)', lower(v_actual) using errcode = 'PW004';
  end if;
  update public.transitos
     set estado = v_estado,
         fecha_salida = case when v_estado = 'SALIO' then coalesce(fecha_salida, (now() at time zone 'America/Bogota')::date) else fecha_salida end
   where id = p_transito_id;
  insert into public.transito_historial (transito_id, estado, nota) values (p_transito_id, v_estado, nullif(trim(p_nota), ''));
  return v_estado;
end;
$$;

-- function: corregir_inspeccion(bigint, jsonb, date, text, text, text, text, text)
CREATE FUNCTION public.corregir_inspeccion(p_id bigint, p_equipos jsonb, p_fecha date DEFAULT NULL::date, p_turno text DEFAULT NULL::text, p_zona text DEFAULT NULL::text, p_inspector text DEFAULT NULL::text, p_observaciones text DEFAULT NULL::text, p_firma text DEFAULT NULL::text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_cliente bigint;
  v_nombre  text;
  e         jsonb;
begin
  if not public.puede_editar() then
    raise exception 'Su usuario no puede corregir inspecciones' using errcode = '42501';
  end if;
  select cliente_id into v_cliente from public.inspecciones where id = p_id for update;
  if not found then
    raise exception 'La inspección no existe' using errcode = '22023';
  end if;
  if p_equipos is null or jsonb_typeof(p_equipos) <> 'array' or jsonb_array_length(p_equipos) = 0 then
    raise exception 'No hay cañones revisados' using errcode = '22023';
  end if;
  if p_firma is not null and length(p_firma) > 300000 then
    raise exception 'La imagen de la firma es demasiado grande' using errcode = '22023';
  end if;
  select nombre into v_nombre from public.perfiles where id = auth.uid();

  update public.inspecciones
     set fecha         = coalesce(p_fecha, fecha),
         turno         = nullif(trim(p_turno), ''),
         zona          = nullif(trim(p_zona), ''),
         inspector     = nullif(trim(p_inspector), ''),
         observaciones = nullif(trim(p_observaciones), ''),
         firma         = coalesce(p_firma, firma),
         corregida     = now(),
         corregida_por = coalesce(v_nombre, 'Usuario'),
         correcciones  = correcciones + 1
   where id = p_id;

  delete from public.inspeccion_equipos where inspeccion_id = p_id;
  for e in select * from jsonb_array_elements(p_equipos) loop
    if not exists (select 1 from public.equipos where id = (e->>'equipo_id')::bigint and cliente_id = v_cliente) then
      raise exception 'Un cañón no pertenece a este cliente' using errcode = '22023';
    end if;
    insert into public.inspeccion_equipos (inspeccion_id, equipo_id, resultados, hallazgos, mediciones, observacion)
    values (
      p_id,
      (e->>'equipo_id')::bigint,
      coalesce(e->'resultados', '{}'::jsonb),
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(e->'hallazgos', '[]'::jsonb)) x), '{}'),
      coalesce(e->'mediciones', '{}'::jsonb),
      nullif(trim(e->>'observacion'), '')
    );
  end loop;
  return p_id;
end;
$$;

-- function: costos_productos()
CREATE FUNCTION public.costos_productos() RETURNS TABLE(id uuid, sku text, costo_unitario numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select p.id, p.sku, p.costo_unitario
    from public.productos p
   where p.activo and public.es_admin();
$$;

-- function: crear_perfil_nuevo_usuario()
CREATE FUNCTION public.crear_perfil_nuevo_usuario() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', new.email));
  return new;
end;
$$;

-- function: devolver_prestamo(bigint, numeric, text, text, bigint)
CREATE FUNCTION public.devolver_prestamo(p_prestamo_id bigint, p_cantidad numeric, p_forma text DEFAULT 'PRODUCTO'::text, p_nota text DEFAULT NULL::text, p_ubicacion_id bigint DEFAULT NULL::bigint) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_p        public.prestamos;
  v_forma    text := upper(trim(p_forma));
  v_pend     numeric;
  v_ubic     bigint;
  v_estado   text;
begin
  if not public.puede_editar() then
    raise exception 'Su usuario no puede registrar devoluciones' using errcode = '42501';
  end if;
  select * into v_p from public.prestamos where id = p_prestamo_id for update;
  if not found then
    raise exception 'El préstamo no existe' using errcode = '22023';
  end if;
  if v_p.estado in ('DEVUELTO', 'SALDADO') then
    raise exception 'Ese préstamo ya está cerrado' using errcode = 'PW004';
  end if;
  v_pend := v_p.cantidad - v_p.devuelto;
  v_ubic := coalesce(p_ubicacion_id, v_p.ubicacion_id);

  if v_forma = 'PRODUCTO' then
    if p_cantidad is null or p_cantidad <= 0 or p_cantidad > v_pend then
      raise exception 'La cantidad debe ser entre 0 y % (lo pendiente)', v_pend using errcode = '22023';
    end if;
    perform set_config('poliway.prestamo', '1', true);
    if v_p.sentido = 'SALIDA' then
      perform public.registrar_movimiento(v_p.producto_id, v_ubic, 'ENTRADA', p_cantidad, null,
        'Préstamo #' || v_p.id, 'Devolución de ' || v_p.empresa);
    else
      perform public.registrar_movimiento(v_p.producto_id, v_ubic, 'SALIDA', p_cantidad, null,
        'Préstamo #' || v_p.id, 'Devolución a ' || v_p.empresa, 'PRESTAMO');
    end if;
    perform set_config('poliway.prestamo', '', true);
    update public.prestamos set devuelto = devuelto + p_cantidad where id = v_p.id;
    v_estado := case when v_p.devuelto + p_cantidad >= v_p.cantidad then 'DEVUELTO' else 'PARCIAL' end;
  elsif v_forma = 'OTRA' then
    v_estado := 'SALDADO';
  else
    raise exception 'Forma de devolución inválida' using errcode = '22023';
  end if;

  update public.prestamos set estado = v_estado where id = v_p.id;
  insert into public.prestamo_devoluciones (prestamo_id, cantidad, forma, nota)
  values (v_p.id, case when v_forma = 'OTRA' then v_pend else p_cantidad end, v_forma, nullif(trim(p_nota), ''));
  return v_estado;
end;
$$;

-- function: es_admin()
CREATE FUNCTION public.es_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin' and activo);
$$;

-- function: firmar_prestamo(bigint, text, text)
CREATE FUNCTION public.firmar_prestamo(p_prestamo_id bigint, p_firma text, p_firmo text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not public.puede_editar() then
    raise exception 'Su usuario no puede firmar préstamos' using errcode = '42501';
  end if;
  if p_firma is null or p_firma not like 'data:image/png;base64,%' then
    raise exception 'La firma no es válida' using errcode = '22023';
  end if;
  if length(p_firma) > 300000 then
    raise exception 'La imagen de la firma es demasiado grande' using errcode = '22023';
  end if;
  if nullif(trim(p_firmo), '') is null then
    raise exception 'Escriba el nombre de quien firma' using errcode = '22023';
  end if;
  update public.prestamos
     set firma = p_firma, firmo = trim(p_firmo)
   where id = p_prestamo_id and firma is null;
  if not found then
    raise exception 'El préstamo no existe o ya tiene firma' using errcode = 'PW005';
  end if;
end;
$$;

-- function: guardar_inspeccion(text, bigint, jsonb, date, text, text, text, text, text)
CREATE FUNCTION public.guardar_inspeccion(p_tipo text, p_cliente_id bigint, p_equipos jsonb, p_fecha date DEFAULT NULL::date, p_turno text DEFAULT NULL::text, p_zona text DEFAULT NULL::text, p_inspector text DEFAULT NULL::text, p_observaciones text DEFAULT NULL::text, p_firma text DEFAULT NULL::text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_id bigint;
  e    jsonb;
begin
  if not public.puede_editar() then
    raise exception 'Su usuario no puede registrar inspecciones' using errcode = '42501';
  end if;
  if upper(p_tipo) not in ('RONDA', 'DETALLE') then
    raise exception 'Tipo de inspección inválido' using errcode = '22023';
  end if;
  if p_equipos is null or jsonb_typeof(p_equipos) <> 'array' or jsonb_array_length(p_equipos) = 0 then
    raise exception 'No hay cañones revisados' using errcode = '22023';
  end if;
  if p_firma is not null and length(p_firma) > 300000 then
    raise exception 'La imagen de la firma es demasiado grande' using errcode = '22023';
  end if;

  insert into public.inspecciones (tipo, cliente_id, fecha, turno, zona, inspector, observaciones, firma)
  values (upper(p_tipo), p_cliente_id, coalesce(p_fecha, (now() at time zone 'America/Bogota')::date),
          nullif(trim(p_turno), ''), nullif(trim(p_zona), ''), nullif(trim(p_inspector), ''),
          nullif(trim(p_observaciones), ''), p_firma)
  returning id into v_id;

  for e in select * from jsonb_array_elements(p_equipos) loop
    if not exists (select 1 from public.equipos where id = (e->>'equipo_id')::bigint and cliente_id = p_cliente_id) then
      raise exception 'Un cañón no pertenece a este cliente' using errcode = '22023';
    end if;
    insert into public.inspeccion_equipos (inspeccion_id, equipo_id, resultados, hallazgos, mediciones, observacion)
    values (
      v_id,
      (e->>'equipo_id')::bigint,
      coalesce(e->'resultados', '{}'::jsonb),
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(e->'hallazgos', '[]'::jsonb)) x), '{}'),
      coalesce(e->'mediciones', '{}'::jsonb),
      nullif(trim(e->>'observacion'), '')
    );
  end loop;
  return v_id;
end;
$$;

-- function: guardar_producto(text, text, text, text, bigint, numeric, numeric)
CREATE FUNCTION public.guardar_producto(p_sku text, p_nombre text, p_unidad_medida text DEFAULT 'UND'::text, p_codigo_barras text DEFAULT NULL::text, p_categoria_id bigint DEFAULT NULL::bigint, p_stock_minimo numeric DEFAULT NULL::numeric, p_costo_unitario numeric DEFAULT NULL::numeric) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_id uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede cargar productos' using errcode = '42501';
  end if;
  if nullif(trim(p_sku), '') is null or nullif(trim(p_nombre), '') is null then
    raise exception 'Falta el código o el nombre' using errcode = '22023';
  end if;
  insert into public.productos (sku, codigo_barras, nombre, unidad_medida, categoria_id, stock_minimo, costo_unitario, activo)
  values (upper(trim(p_sku)), upper(coalesce(nullif(trim(p_codigo_barras), ''), trim(p_sku))), trim(p_nombre),
          coalesce(nullif(p_unidad_medida, ''), 'UND'), p_categoria_id, coalesce(p_stock_minimo, 0), coalesce(p_costo_unitario, 0), true)
  on conflict (sku) do update set
    nombre         = excluded.nombre,
    codigo_barras  = coalesce(nullif(trim(p_codigo_barras), ''), public.productos.codigo_barras),
    unidad_medida  = excluded.unidad_medida,
    categoria_id   = coalesce(p_categoria_id, public.productos.categoria_id),
    stock_minimo   = coalesce(p_stock_minimo, public.productos.stock_minimo),
    costo_unitario = coalesce(p_costo_unitario, public.productos.costo_unitario),
    activo         = true
  returning id into v_id;
  return v_id;
end;
$$;

-- function: marcar_actualizado()
CREATE FUNCTION public.marcar_actualizado() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.actualizado := now();
  return new;
end;
$$;

-- function: nacionalizar_transito(bigint, bigint, jsonb)
CREATE FUNCTION public.nacionalizar_transito(p_transito_id bigint, p_ubicacion_id bigint, p_recibidos jsonb DEFAULT '{}'::jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_t     public.transitos;
  v_it    public.transito_items;
  v_rec   numeric;
  v_nov   text;
  v_n     int := 0;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede nacionalizar' using errcode = '42501';
  end if;
  select * into v_t from public.transitos where id = p_transito_id for update;
  if not found then
    raise exception 'El pedido no existe' using errcode = '22023';
  end if;
  if v_t.estado in ('NACIONALIZADO', 'ANULADO') then
    raise exception 'El pedido ya está cerrado (%)', lower(v_t.estado) using errcode = 'PW004';
  end if;
  if exists (select 1 from public.transito_items where transito_id = p_transito_id and producto_id is null) then
    raise exception 'Hay códigos del pedido que no están en el inventario; créelos primero' using errcode = 'PW005';
  end if;

  for v_it in select * from public.transito_items where transito_id = p_transito_id order by id loop
    v_rec := coalesce((p_recibidos -> v_it.id::text ->> 'recibido')::numeric, v_it.cantidad);
    v_nov := nullif(trim(p_recibidos -> v_it.id::text ->> 'novedad'), '');
    if v_rec < 0 then
      raise exception 'La cantidad recibida no puede ser negativa' using errcode = '22023';
    end if;
    if v_nov is null and v_rec < v_it.cantidad then
      v_nov := 'Llegaron ' || v_rec || ' de ' || v_it.cantidad;
    end if;
    update public.transito_items set recibido = v_rec, novedad = v_nov where id = v_it.id;
    if v_rec > 0 then
      perform public.registrar_movimiento(
        v_it.producto_id, p_ubicacion_id, 'ENTRADA', v_rec, null, v_t.numero,
        'Nacionalización del pedido ' || v_t.numero || ' (' || v_t.proveedor || ')' || coalesce('. ' || v_nov, ''),
        null, null, null, null, v_it.valor_unitario, null, null);
      v_n := v_n + 1;
    end if;
  end loop;

  update public.transitos
     set estado = 'NACIONALIZADO', nacionalizado = now(), ubicacion_id = p_ubicacion_id
   where id = p_transito_id;
  insert into public.transito_historial (transito_id, estado, nota)
  values (p_transito_id, 'NACIONALIZADO', v_n || ' productos pasaron al inventario');
  return v_n;
end;
$$;

-- function: puede_editar()
CREATE FUNCTION public.puede_editar() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol in ('admin', 'bodeguero') and activo);
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

-- function: registrar_movimiento(uuid, bigint, text, numeric, uuid, text, text, text, bigint, bigint, bigint, numeric, bigint, text)
CREATE FUNCTION public.registrar_movimiento(p_producto_id uuid, p_ubicacion_id bigint, p_tipo text, p_cantidad numeric, p_proveedor_id uuid DEFAULT NULL::uuid, p_documento_ref text DEFAULT NULL::text, p_nota text DEFAULT NULL::text, p_destino text DEFAULT NULL::text, p_funcionario_id bigint DEFAULT NULL::bigint, p_area_id bigint DEFAULT NULL::bigint, p_cliente_id bigint DEFAULT NULL::bigint, p_costo_unitario numeric DEFAULT NULL::numeric, p_equipo_id bigint DEFAULT NULL::bigint, p_firma text DEFAULT NULL::text) RETURNS public.movimientos
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_usuario        uuid := auth.uid();
  v_tipo           text := upper(trim(p_tipo));
  v_destino        text := upper(nullif(trim(p_destino), ''));
  v_delta          numeric;
  v_saldo_anterior numeric;
  v_saldo_nuevo    numeric;
  v_costo_actual   numeric;
  v_total_antes    numeric;
  v_costo_mov      numeric;
  v_mov            public.movimientos;
begin
  if v_usuario is null then
    raise exception 'Usuario no autenticado' using errcode = '28000';
  end if;
  if not public.puede_editar() then
    raise exception 'Su usuario no tiene permiso para registrar movimientos' using errcode = '42501';
  end if;
  if v_tipo is null or v_tipo not in ('ENTRADA', 'SALIDA', 'AJUSTE') then
    raise exception 'Tipo de movimiento inválido: %', p_tipo using errcode = '22023';
  end if;
  if p_cantidad is null or p_cantidad = 0 then
    raise exception 'La cantidad no puede ser cero' using errcode = '22023';
  end if;
  if v_tipo in ('ENTRADA', 'SALIDA') and p_cantidad < 0 then
    raise exception 'La cantidad de una % debe ser positiva', lower(v_tipo) using errcode = '22023';
  end if;
  if v_tipo = 'AJUSTE' and not public.es_admin() then
    raise exception 'Solo un administrador puede hacer ajustes de inventario' using errcode = '42501';
  end if;
  if p_costo_unitario is not null and p_costo_unitario < 0 then
    raise exception 'El costo no puede ser negativo' using errcode = '22023';
  end if;
  if p_firma is not null and length(p_firma) > 300000 then
    raise exception 'La imagen de la firma es demasiado grande' using errcode = '22023';
  end if;

  -- Toda salida debe decir a quién se entregó
  if v_tipo = 'SALIDA' then
    if v_destino = 'FUNCIONARIO' then
      if p_funcionario_id is null or p_area_id is null then
        raise exception 'Indique el funcionario que recibe y el área donde se usará' using errcode = 'PW003';
      end if;
      if not exists (select 1 from public.funcionarios where id = p_funcionario_id and activo) then
        raise exception 'El funcionario no existe o está inactivo' using errcode = 'PW003';
      end if;
      if not exists (select 1 from public.areas where id = p_area_id and activo) then
        raise exception 'El área no existe o está inactiva' using errcode = 'PW003';
      end if;
    elsif v_destino = 'CLIENTE' then
      if p_cliente_id is null or not exists (select 1 from public.clientes where id = p_cliente_id and activo) then
        raise exception 'Indique el cliente al que se despacha' using errcode = 'PW003';
      end if;
      if p_equipo_id is not null and not exists (
        select 1 from public.equipos where id = p_equipo_id and cliente_id = p_cliente_id) then
        raise exception 'El equipo no pertenece a ese cliente' using errcode = 'PW003';
      end if;
    elsif v_destino = 'PRESTAMO' then
      -- solo desde registrar_prestamo / devolver_prestamo (dejan esta marca en la transacción)
      if coalesce(current_setting('poliway.prestamo', true), '') <> '1' then
        raise exception 'Los préstamos se registran en la pantalla Préstamos' using errcode = 'PW003';
      end if;
    else
      raise exception 'Indique si la salida se entrega a un funcionario o a un cliente' using errcode = 'PW003';
    end if;
  else
    v_destino := null;
  end if;

  if not exists (select 1 from public.ubicaciones where id = p_ubicacion_id and activo) then
    raise exception 'La ubicación no existe o está inactiva' using errcode = '22023';
  end if;

  -- Bloquea el producto (para el costo promedio) y luego su existencia en la ubicación
  select costo_unitario into v_costo_actual
    from public.productos where id = p_producto_id and activo
     for update;
  if not found then
    raise exception 'El producto no existe o está inactivo' using errcode = '22023';
  end if;

  v_delta := case v_tipo when 'ENTRADA' then p_cantidad when 'SALIDA' then -p_cantidad else p_cantidad end;

  insert into public.stock (producto_id, ubicacion_id, cantidad)
  values (p_producto_id, p_ubicacion_id, 0)
  on conflict (producto_id, ubicacion_id) do nothing;

  select cantidad into v_saldo_anterior
    from public.stock
   where producto_id = p_producto_id and ubicacion_id = p_ubicacion_id
     for update;

  v_saldo_nuevo := v_saldo_anterior + v_delta;
  if v_saldo_nuevo < 0 then
    raise exception 'Stock insuficiente. Disponible: %, solicitado: %', v_saldo_anterior, abs(v_delta)
      using errcode = 'PW001';
  end if;

  -- Costo promedio ponderado: solo las entradas con costo lo modifican
  v_costo_mov := v_costo_actual;
  if v_tipo = 'ENTRADA' and p_costo_unitario is not null then
    select coalesce(sum(cantidad), 0) into v_total_antes from public.stock where producto_id = p_producto_id;
    if v_total_antes <= 0 then
      v_costo_actual := p_costo_unitario;
    else
      v_costo_actual := round((v_total_antes * v_costo_actual + p_cantidad * p_costo_unitario) / (v_total_antes + p_cantidad), 2);
    end if;
    update public.productos set costo_unitario = v_costo_actual where id = p_producto_id;
    v_costo_mov := p_costo_unitario;
  end if;

  update public.stock
     set cantidad = v_saldo_nuevo, actualizado = now()
   where producto_id = p_producto_id and ubicacion_id = p_ubicacion_id;

  insert into public.movimientos (
    tipo, producto_id, ubicacion_id, cantidad, saldo_resultante,
    proveedor_id, usuario_id, documento_ref, nota,
    destino, funcionario_id, area_id, cliente_id,
    costo_unitario, equipo_id, firma
  ) values (
    v_tipo, p_producto_id, p_ubicacion_id, p_cantidad, v_saldo_nuevo,
    case when v_tipo = 'ENTRADA' then p_proveedor_id end, v_usuario,
    nullif(trim(p_documento_ref), ''), nullif(trim(p_nota), ''),
    v_destino,
    case when v_destino = 'FUNCIONARIO' then p_funcionario_id end,
    case when v_destino = 'FUNCIONARIO' then p_area_id end,
    case when v_destino = 'CLIENTE' then p_cliente_id end,
    v_costo_mov,
    case when v_destino = 'CLIENTE' then p_equipo_id end,
    case when v_tipo = 'SALIDA' then p_firma end
  )
  returning * into v_mov;

  -- El costo solo lo ve el administrador
  if not public.es_admin() then
    v_mov.costo_unitario := null;
  end if;
  return v_mov;
end;
$$;

-- function: registrar_prestamo(text, text, uuid, numeric, bigint, date, text, text, text)
CREATE FUNCTION public.registrar_prestamo(p_sentido text, p_empresa text, p_producto_id uuid, p_cantidad numeric, p_ubicacion_id bigint, p_fecha_devolucion date DEFAULT NULL::date, p_contacto text DEFAULT NULL::text, p_autorizo text DEFAULT NULL::text, p_nota text DEFAULT NULL::text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_sentido text := upper(trim(p_sentido));
  v_id      bigint;
begin
  if not public.puede_editar() then
    raise exception 'Su usuario no puede registrar préstamos' using errcode = '42501';
  end if;
  if v_sentido not in ('SALIDA', 'ENTRADA') then
    raise exception 'Indique si el préstamo es de salida o de entrada' using errcode = '22023';
  end if;
  if nullif(trim(p_empresa), '') is null then
    raise exception 'Escriba la empresa' using errcode = '22023';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero' using errcode = '22023';
  end if;

  insert into public.prestamos (sentido, empresa, contacto, producto_id, ubicacion_id, cantidad, fecha_devolucion, autorizo, nota)
  values (v_sentido, trim(p_empresa), nullif(trim(p_contacto), ''), p_producto_id, p_ubicacion_id, p_cantidad,
          p_fecha_devolucion, nullif(trim(p_autorizo), ''), nullif(trim(p_nota), ''))
  returning id into v_id;

  perform set_config('poliway.prestamo', '1', true);
  if v_sentido = 'SALIDA' then
    perform public.registrar_movimiento(p_producto_id, p_ubicacion_id, 'SALIDA', p_cantidad, null,
      'Préstamo #' || v_id, 'Préstamo a ' || trim(p_empresa), 'PRESTAMO');
  else
    perform public.registrar_movimiento(p_producto_id, p_ubicacion_id, 'ENTRADA', p_cantidad, null,
      'Préstamo #' || v_id, 'Préstamo de ' || trim(p_empresa));
  end if;
  perform set_config('poliway.prestamo', '', true);
  return v_id;
end;
$$;

-- function: transito_sin_costos(uuid)
CREATE FUNCTION public.transito_sin_costos(p_producto_id uuid DEFAULT NULL::uuid) RETURNS TABLE(transito_id bigint, numero text, proveedor text, estado text, transporte text, fecha_pedido date, fecha_salida date, eta date, nacionalizado timestamp with time zone, producto_id uuid, sku text, producto text, unidad_medida text, cantidad numeric, recibido numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select t.id, t.numero, t.proveedor, t.estado, t.transporte, t.fecha_pedido, t.fecha_salida, t.eta, t.nacionalizado,
         i.producto_id, coalesce(p.sku, i.codigo), coalesce(p.nombre, i.descripcion, i.codigo), coalesce(p.unidad_medida, 'UND'),
         i.cantidad, i.recibido
    from public.transitos t
    join public.transito_items i on i.transito_id = t.id
    left join public.productos p on p.id = i.producto_id
   where auth.uid() is not null
     and t.estado <> 'ANULADO'
     and (t.estado <> 'NACIONALIZADO' or t.nacionalizado > now() - interval '60 days')
     and (p_producto_id is null or i.producto_id = p_producto_id)
   order by t.eta nulls last, t.id, i.id;
$$;

-- Verificación: deben ser 16 funciones
select count(*) as funciones from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';
