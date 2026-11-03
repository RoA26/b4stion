-- =====================================================================
-- 99 · INVENTARIO DEL ESQUEMA (solo lectura; no cambia nada)
-- Sistema de inventario (antes Poliway/Blaster)
--
-- Sirve para comparar la base VIEJA con la NUEVA:
--   1. Ejecútelo en el Supabase viejo y descargue el resultado (botón "Export" > CSV).
--   2. Ejecútelo en el Supabase nuevo y descargue el resultado.
--   3. Las dos listas deben coincidir (la columna "huella" compara el código
--      de cada función, vista y política). Si algo sale solo en la vieja,
--      es un cambio hecho a mano que no está en estos archivos.
-- No muestra ningún dato de usuarios, clientes ni movimientos: solo estructura.
-- =====================================================================

select * from (
  -- Columnas de cada tabla y vista
  select 'columna' as tipo, c.table_name || '.' || c.column_name as nombre,
         c.data_type || coalesce('(' || c.character_maximum_length || ')', '') ||
         case when c.is_nullable = 'NO' then ' not null' else '' end ||
         coalesce(' default ' || c.column_default, '') as detalle,
         null::text as huella
    from information_schema.columns c
   where c.table_schema = 'public'
  union all
  -- Restricciones (PK, FK, UNIQUE, CHECK)
  select 'restriccion', conrelid::regclass::text || '.' || conname, pg_get_constraintdef(oid), md5(pg_get_constraintdef(oid))
    from pg_constraint where connamespace = 'public'::regnamespace
  union all
  -- Índices
  select 'indice', indexname, indexdef, md5(indexdef) from pg_indexes where schemaname = 'public'
  union all
  -- Funciones
  select 'funcion', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         case when p.prosecdef then 'security definer' else 'security invoker' end,
         md5(p.prosrc)
    from pg_proc p where p.pronamespace = 'public'::regnamespace
  union all
  -- Vistas
  select 'vista', viewname, null, md5(definition) from pg_views where schemaname = 'public'
  union all
  -- Triggers (incluye el de auth.users)
  select 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid), null
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where not t.tgisinternal and (n.nspname = 'public' or t.tgname = 'al_crear_usuario')
  union all
  -- RLS
  select 'rls', relname, case when relrowsecurity then 'activo' else 'APAGADO' end, null
    from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
  union all
  -- Políticas (public y storage)
  select 'politica', schemaname || '.' || tablename || '.' || policyname,
         cmd || ' to ' || array_to_string(roles, ','), md5(coalesce(qual, '') || '|' || coalesce(with_check, ''))
    from pg_policies where schemaname in ('public', 'storage')
  union all
  -- Permisos de tablas y columnas para los roles de la app
  select 'permiso_tabla', table_name || ' → ' || grantee, string_agg(privilege_type, ',' order by privilege_type), null
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated')
   group by table_name, grantee
  union all
  select 'permiso_columnas', table_name || ' → authenticated', count(*)::text || ' permisos',
         md5(string_agg(column_name || ':' || privilege_type, ',' order by column_name, privilege_type))
    from information_schema.column_privileges
   where table_schema = 'public' and grantee = 'authenticated'
   group by table_name
  union all
  -- Permisos de funciones
  select 'permiso_funcion', p.proname || ' → ' || r.rolname, 'execute', null
    from pg_proc p cross join pg_roles r
   where p.pronamespace = 'public'::regnamespace and r.rolname in ('anon', 'authenticated')
     and has_function_privilege(r.oid, p.oid, 'execute')
  union all
  -- Realtime
  select 'realtime', tablename, null, null from pg_publication_tables where pubname = 'supabase_realtime'
  union all
  -- Storage
  select 'bucket', id, case when public then 'público' else 'privado' end, null from storage.buckets
  union all
  -- Extensiones
  select 'extension', extname, extversion, null from pg_extension
) x
order by tipo, nombre;
