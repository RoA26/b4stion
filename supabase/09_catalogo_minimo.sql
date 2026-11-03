-- =====================================================================
-- 09 · DATOS DE CONFIGURACIÓN MÍNIMOS
-- Sistema de inventario (antes Poliway/Blaster) · reconstrucción en un Supabase NUEVO
--
-- El sistema NO tiene tablas de catálogo fijo: los roles (admin, bodeguero,
-- consulta), los tipos de movimiento (ENTRADA, SALIDA, AJUSTE), los destinos
-- (FUNCIONARIO, CLIENTE, PRESTAMO), los estados de tránsito (PEDIDO, SALIO,
-- TRANSITO, ADUANA, NACIONALIZADO, ANULADO), los estados de préstamo
-- (PENDIENTE, PARCIAL, DEVUELTO, SALDADO), los de conteo y los de inspección
-- (RONDA, DETALLE) están como restricciones CHECK en el archivo 02.
--
-- Lo único que la app necesita para empezar a trabajar es UNA ubicación
-- (bodega), porque toda entrada, salida y conteo se hace en una ubicación.
-- Se puede ejecutar más de una vez.
-- =====================================================================

insert into public.ubicaciones (nombre)
select 'Bodega principal'
where not exists (select 1 from public.ubicaciones);

-- OPCIONAL: categorías de productos. Quite los "--" y ajústelas a la nueva marca.
-- insert into public.categorias (nombre) values ('Repuestos'), ('Accesorios'), ('Consumibles')
-- on conflict do nothing;

-- Verificación
select (select count(*) from public.ubicaciones) as ubicaciones,
       (select count(*) from public.categorias)  as categorias;
