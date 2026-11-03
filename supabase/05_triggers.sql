-- =====================================================================
-- 05 · TRIGGERS
-- Sistema de inventario (antes Poliway/Blaster) · reconstrucción en un Supabase NUEVO
-- Incluye el trigger sobre auth.users que crea el perfil de cada usuario nuevo.
-- Ejecutar UNA sola vez, completo, en Supabase > SQL Editor > + New query > Run.
-- =====================================================================

-- trigger: productos productos_actualizado
CREATE TRIGGER productos_actualizado BEFORE UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION public.marcar_actualizado();


-- trigger: al_crear_usuario (en auth.users: crea la fila en public.perfiles con rol 'consulta')
drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- Verificación: deben ser 2
select tgname, tgrelid::regclass as tabla from pg_trigger where not tgisinternal and tgname in ('productos_actualizado', 'al_crear_usuario');
