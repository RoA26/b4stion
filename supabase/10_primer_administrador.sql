-- =====================================================================
-- 10 · PRIMER ADMINISTRADOR (paso manual, una sola vez)
-- Sistema de inventario (antes Poliway/Blaster) · reconstrucción en un Supabase NUEVO
--
-- 1. En Supabase > Authentication > Users > Add user > Create new user:
--    escriba el correo y una contraseña, y marque "Auto Confirm User".
--    El trigger del archivo 05 le crea solo su fila en public.perfiles con rol 'consulta'.
-- 2. Abajo, cambie el texto que está entre comillas por ese mismo correo y ejecute.
-- Los demás usuarios se crean después desde la app (pantalla Usuarios).
-- =====================================================================

update public.perfiles
   set rol = 'admin', activo = true
 where id = (select id from auth.users where email = lower('CORREO_DEL_ADMINISTRADOR'));

-- Verificación: debe salir 1 fila con rol admin
select p.nombre, p.rol, p.activo from public.perfiles p where p.rol = 'admin';
