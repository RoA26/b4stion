-- =====================================================================
-- 01 · EXTENSIONES
-- Sistema de inventario (antes Poliway/Blaster) · reconstrucción en un Supabase NUEVO
-- Supabase ya trae pgcrypto y la publicación supabase_realtime; esto solo lo asegura.
-- Ejecutar UNA sola vez, completo, en Supabase > SQL Editor > + New query > Run.
-- =====================================================================

-- El esquema usa gen_random_uuid(), que viene en PostgreSQL 13+ (no necesita extensión).
-- pgcrypto (esquema "extensions") solo se usó a mano para restablecer una contraseña; se deja por si acaso.
create extension if not exists pgcrypto with schema extensions;

-- Verificación
select extname, extversion from pg_extension where extname in ('pgcrypto', 'plpgsql') order by 1;
