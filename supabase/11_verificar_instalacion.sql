-- =====================================================================
-- 11 · VERIFICACIÓN FINAL (solo lectura)
-- Sistema de inventario (antes Poliway/Blaster) · reconstrucción en un Supabase NUEVO
-- Debe dar: tablas 21, vistas 4, funciones 16, triggers 2, rls_activo 21,
-- politicas 48, realtime 5, bucket_documentos 1, politicas_storage 4.
-- =====================================================================

select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') as tablas,
  (select count(*) from information_schema.views  where table_schema = 'public') as vistas,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') as funciones,
  (select count(*) from pg_trigger where not tgisinternal and tgname in ('productos_actualizado', 'al_crear_usuario')) as triggers,
  (select count(*) from pg_tables where schemaname = 'public' and rowsecurity) as rls_activo,
  (select count(*) from pg_policies where schemaname = 'public') as politicas,
  (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public') as realtime,
  (select count(*) from storage.buckets where id = 'documentos' and not public) as bucket_documentos,
  (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'documentos_admin_%') as politicas_storage;
