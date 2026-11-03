-- =====================================================================
-- 07 · STORAGE: bucket privado "documentos" y sus políticas
-- Sistema de inventario (antes Poliway/Blaster) · reconstrucción en un Supabase NUEVO
-- Guarda los documentos originales (facturas, packing list, fotos) que se
-- registran en Administración. Solo el administrador los ve, sube, cambia o borra.
-- La app sube los archivos a rutas dentro del bucket y los abre con URL firmada.
-- Ejecutar en Supabase > SQL Editor > + New query > Run (se puede repetir).
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

drop policy if exists "documentos_admin_leer"    on storage.objects;
drop policy if exists "documentos_admin_subir"   on storage.objects;
drop policy if exists "documentos_admin_cambiar" on storage.objects;
drop policy if exists "documentos_admin_borrar"  on storage.objects;

create policy "documentos_admin_leer" on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.es_admin());
create policy "documentos_admin_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.es_admin());
create policy "documentos_admin_cambiar" on storage.objects for update to authenticated
  using (bucket_id = 'documentos' and public.es_admin());
create policy "documentos_admin_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and public.es_admin());

-- Verificación: bucket privado y 4 políticas
select id, public from storage.buckets where id = 'documentos';
select policyname from pg_policies where schemaname = 'storage' and policyname like 'documentos_admin_%' order by 1;
