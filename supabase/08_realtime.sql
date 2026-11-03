-- =====================================================================
-- 08 · REALTIME: tablas en la publicación supabase_realtime
-- Sistema de inventario (antes Poliway/Blaster) · reconstrucción en un Supabase NUEVO
-- La app escucha en vivo: stock (tablero), conteo_items (conteo físico entre
-- varias personas). También quedaron publicadas movimientos, transitos y prestamos.
-- Se puede repetir sin error.
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array['stock', 'movimientos', 'conteo_items', 'transitos', 'prestamos'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end;
$$;

-- Verificación: deben salir las 5 tablas
select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by 1;
