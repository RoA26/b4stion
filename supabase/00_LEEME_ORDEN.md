# Reconstrucción de la base de datos en un Supabase nuevo

Sistema de inventario, antes Poliway/Blaster. Esta carpeta trae solo la **estructura** de la base y la configuración mínima. No incluye usuarios, clientes, funcionarios, productos, movimientos, préstamos, inspecciones, tránsitos ni existencias.

## De dónde sale este esquema

El sistema se armó con 14 scripts que se ejecutaron uno tras otro en el Supabase original. Esos scripts se volvieron a ejecutar en el mismo orden en un PostgreSQL de prueba, y de ahí se sacó el esquema final completo:

- 01_esquema_poliway
- 02_datos_prueba_poliway
- 03_repuestos_blaster
- 04_borrar_datos_prueba
- 05_entregas_y_listas
- 06_mejoras_completas
- 07_costo_en_inventario
- 08_administracion_transito_prestamos
- 09_acta_prestamos
- 10_inspeccion_canones
- 11_datos_demo_movimientos
- 13_corregir_inspecciones
- 14_donde_esta_mercancia

Después, estos archivos se instalaron en una base vacía que imita a Supabase, y las dos estructuras se compararon objeto por objeto. Salieron **idénticas**: tablas, columnas, restricciones, índices, llaves foráneas, funciones, vistas, triggers, RLS, políticas y permisos.

**Si algo se cambió a mano en el Supabase viejo**, por fuera de los scripts, no está aquí. Para comprobarlo, use el archivo `99_inventario_esquema.sql` (ver el paso 2 de "Cómo comprobar").

## Orden de ejecución

Proyecto **nuevo y vacío** de Supabase → SQL Editor → **+ New query** → pegar el archivo completo → **Run**. Uno por uno y en este orden:

| # | Archivo | Qué hace | Resultado esperado |
|---|---|---|---|
| 1 | `01_extensiones.sql` | Asegura pgcrypto | plpgsql y pgcrypto |
| 2 | `02_tablas.sql` | 21 tablas, identity, CHECK, UNIQUE, índices y FK | `tablas = 21` |
| 3 | `03_funciones.sql` | 16 funciones con su código completo | `funciones = 16` |
| 4 | `04_vistas.sql` | v_inventario, v_movimientos, v_prestamos, v_transito_producto | 4 vistas |
| 5 | `05_triggers.sql` | `productos_actualizado` y `al_crear_usuario` (en auth.users) | 2 filas |
| 6 | `06_seguridad_rls_y_permisos.sql` | GRANT/REVOKE (tablas, columnas, funciones), RLS y 48 políticas | `rls_activo = 21`, `politicas = 48` |
| 7 | `07_storage_documentos.sql` | Bucket privado `documentos` y sus 4 políticas | bucket privado y 4 políticas |
| 8 | `08_realtime.sql` | stock, movimientos, conteo_items, transitos y prestamos en `supabase_realtime` | 5 tablas |
| 9 | `09_catalogo_minimo.sql` | Crea una ubicación, "Bodega principal" | `ubicaciones = 1` |
| 10 | `10_primer_administrador.sql` | Pasa a admin al primer usuario (ver los pasos manuales) | 1 fila admin |
| 11 | `11_verificar_instalacion.sql` | Revisión final, solo lectura | 21 / 4 / 16 / 2 / 21 / 48 / 5 / 1 / 4 |
| — | `99_inventario_esquema.sql` | Lista toda la estructura, solo lectura | Sirve para comparar |

Hay que tener en cuenta dos cosas:

- **Ejecución única:** los archivos 02 a 06 son para correr **una sola vez** en un proyecto vacío. Si alguno falla a la mitad, lo más limpio es borrar el proyecto y empezar de nuevo.
- **Archivos que se pueden repetir:** el 07, el 08, el 09 y el 11 se pueden ejecutar varias veces sin problema.

## Los scripts viejos (01 a 14) ya no se necesitan

Estos archivos reemplazan a los scripts viejos. Así quedan los originales:

- **Scripts de estructura (01, 05, 06, 07, 08, 09, 10, 13, 14):** su contenido ya está consolidado en los archivos 02 a 08 de esta carpeta.
- **Scripts que solo traen datos (02, 03, 04, 11, 12):** no hacen falta. Tenga en cuenta que:
  - 02, 11 y 12 son datos de prueba o de demostración.
  - 03 es el catálogo de repuestos Blaster.
  - Los scripts 05 y 06 también traían listas y un cañón de demostración, y quedaron por fuera.
- **Tabla `demo_respaldo`:** se excluyó a propósito. Era temporal: la crea el script 11 y la borra el 12.

## Lo que cambió respecto al script 01

El script 01 era solo la base. Esto es lo que se agregó después, y todo ya está en `02_tablas.sql`:

- **05:**
  - tablas `areas`, `funcionarios` y `clientes`;
  - columnas `destino`, `funcionario_id`, `area_id` y `cliente_id` en `movimientos`.
- **06:**
  - `perfiles.activo`;
  - tablas `equipos`, `conteos` y `conteo_items`;
  - columnas `costo_unitario`, `equipo_id` y `firma` en `movimientos`.
- **08:**
  - tablas `transitos`, `transito_items`, `transito_historial`, `documentos`, `prestamos` y `prestamo_devoluciones`;
  - el destino `PRESTAMO` en `movimientos`.
- **09:** `prestamos.firma` y `prestamos.firmo`.
- **10:**
  - `equipos.tanque_litros` y `equipos.orden`;
  - el código del cañón pasa a ser único **por cliente** y sin distinguir mayúsculas;
  - tablas `inspecciones` e `inspeccion_equipos`.
- **13:** columnas `corregida`, `corregida_por` y `correcciones` en `inspecciones`.
- **14:** función `transito_sin_costos`.

Los costos están protegidos con **permisos por columna**: el usuario normal no puede leer `productos.costo_unitario` ni los costos de `movimientos`. Solo el administrador los ve, a través de `costos_productos()` y de las vistas. Por eso el archivo 06 primero quita los permisos que Supabase da por defecto y después pone los exactos. No hay que saltarse esa parte.

## Pasos manuales (fuera del SQL)

1. **Auth (Authentication → Sign In / Providers):**
   - Dejar activo solo **Email** con contraseña. La app entra con `signInWithPassword` y no usa enlaces mágicos, OAuth, recuperación por correo ni invitaciones.
   - Recomendado: **desactivar "Allow new users to sign up"**. Los usuarios los crea el administrador desde la pantalla Usuarios de la app, a través de `/api/usuarios`, que usa la llave secreta y crea el usuario ya confirmado.
   - No hay que configurar URLs de redirección ni plantillas de correo, porque la app no envía correos de Auth.
2. **Primer administrador:**
   - Authentication → Users → **Add user → Create new user**, con **Auto Confirm User** marcado.
   - Luego ejecutar `10_primer_administrador.sql`, cambiando el correo entre comillas por el de ese usuario.
3. **Variables de entorno** de la app (en `.env.local` y en el servidor):

   | Variable | Para qué | ¿Pública? |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto nuevo | Sí |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Llave publicable (`sb_publishable_…`) | Sí |
   | `SUPABASE_SECRET_KEY` | Llave secreta (`sb_secret_…`), solo del servidor. Nunca con `NEXT_PUBLIC_`, nunca en el código ni en capturas | **No** |
   | `RESEND_API_KEY` | Envío del correo de alertas, a través de Resend | No |
   | `ALERTA_CORREOS` | Correos que reciben las alertas, separados por coma | No |
   | `ALERTA_REMITENTE` | Remitente del correo de alertas. Hoy, si no se pone, sale con el nombre de Poliway: cambiarlo para la nueva marca | No |
   | `CRON_SECRET` | Clave que protege la llamada automática a `/api/alertas` | No |

4. **Tarea programada:** `vercel.json` programa `/api/alertas` de lunes a sábado a las 12:00 UTC, que son las 7:00 a. m. en Colombia. Si el servidor nuevo no es Vercel, hay que programar esa llamada (con la cabecera de `CRON_SECRET`) en el servicio que se use.
5. **Funciones Edge:** no hay ninguna. Toda la lógica está en funciones SQL y en las rutas de la app (`/api/usuarios` y `/api/alertas`).
6. **Realtime:** lo deja listo el archivo 08. No hace falta activarlo tabla por tabla en el panel.

## Cambio de marca: lo que dice "Poliway" en la base

Hay dos cosas en el esquema que llevan el nombre de la marca:

- **`transitos.proveedor`** tiene como valor por defecto `'Poliway Brasil'`. Si se quiere otro:
  ```sql
  alter table public.transitos alter column proveedor set default 'Proveedor';
  ```
- **`poliway.prestamo`** es una bandera interna de la sesión que usan `registrar_movimiento`, `registrar_prestamo` y `devolver_prestamo` para dejar pasar las salidas por préstamo. Es invisible para el usuario y **puede quedarse así**. Si se cambia, hay que cambiarla en los 5 lugares de `03_funciones.sql` a la vez.

El resto de la marca (nombre, logo, colores, catálogo de cañones, contactos y textos del asistente de voz) está en el **código de la app**, no en la base:

- `public/logo-blaster.png`
- `lib/voz/conocimiento.ts`, que trae datos de contacto de Poliway
- `lib/canones.ts`
- `lib/inspeccion.ts`
- `public/plantillas/poliway-check-list.xlsx`
- los textos de las pantallas

## Cómo comprobar que quedó igual a la base vieja

1. **En el Supabase nuevo:** ejecutar `11_verificar_instalacion.sql`. Todos los números deben coincidir con la tabla de arriba.
2. **Para comparar con el viejo:**
   - Ejecutar `99_inventario_esquema.sql` en el Supabase viejo y en el nuevo.
   - Exportar los dos resultados a CSV y compararlos.
   - Las diferencias esperadas son estas:
     - En el viejo aparecerá la tabla `demo_respaldo`, si no se ejecutó el script 12.
     - Si en el viejo nunca se ejecutaron los scripts 13 o 14, al viejo le faltarán las columnas de corrección de `inspecciones` y la función `transito_sin_costos`.
   - Cualquier otra diferencia es un cambio hecho a mano en la base vieja.
