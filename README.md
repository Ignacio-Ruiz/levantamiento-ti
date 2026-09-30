# Levantamiento Equipos TI PWA v1.1

PWA móvil y offline para levantar equipos computacionales en Dalcahue, Ilque y Quellón.

## Campos del Excel de origen
- Descripcion
- ID dispositivo
- Nombre Dispositivo
- Ubicación/cargo
- Producto
- Procesador
- Sistema operativo
- Acopio (se muestra como Sucursal)
- RAM
- Disco Duro
- Contraseña Inicio
- Usuario Admin
- Contraseña Admin
- Estado

## Funciones
- Registro desde teléfono.
- Funciona offline después de cargar/instalar la PWA.
- Mantiene la sucursal al guardar para agilizar recorridos.
- Inventario completo con búsqueda y filtros.
- Edición y eliminación.
- Fotografía opcional por equipo.
- Listas configurables de sucursales, descripciones, sistemas operativos y estados.
- Exportación real a `.xlsx` sin depender de Internet ni librerías externas.
- Respaldo JSON con fotografías y configuración.
- Importación de respaldo.

## Privacidad
Los registros quedan localmente en el dispositivo y se sincronizan con Supabase únicamente después de iniciar sesión. Las contraseñas se almacenan sin cifrar, se muestran al ingresarlas y se incluyen visibles en el Excel si fueron registradas. Las fotos y listas de configuración no se sincronizan. Comparte el acceso solo con personas autorizadas.

## GitHub Pages
Subir el contenido de esta carpeta a la raíz del repositorio y publicar `main / (root)` desde Settings > Pages.

## Sincronización protegida con Supabase
La tabla `equipos` debe existir con las columnas de inventario descritas arriba. Para limitar el acceso a una cuenta autenticada:
1. En Supabase, abre **SQL Editor** y ejecuta `supabase-sync-migration.sql`. Esta migración añade `sync_id` y `user_id`, activa RLS y reemplaza las políticas anteriores de `equipos` por políticas por usuario. Las filas antiguas sin propietario quedan privadas y no se descargan.
2. En **Authentication**, permite cuentas por correo y confirma que el proveedor Email esté activo.
3. Configura `supabase-config.js` con la URL del proyecto y la clave `anon` o `publishable`. Esta clave es pública en una PWA; la protección depende de la migración RLS. Nunca uses una clave `service_role` en el cliente.
4. Después de aplicar la migración, publica `supabase-config.js` junto con la app en GitHub Pages.
5. En **Configuración → Sincronización protegida**, crea una cuenta, confirma el correo si Supabase lo solicita e inicia sesión en el PC y el teléfono con la misma cuenta.
6. Pulsa **Sincronizar ahora** en el PC. Los registros locales se subirán; luego sincroniza el teléfono para descargarlos. Con sesión iniciada, nuevos registros, importaciones y eliminaciones también se sincronizan al estar en línea.

La sincronización combina cambios por `sync_id` y conserva la versión con fecha de actualización más reciente. Las fotografías y las listas de configuración permanecen locales. Las contraseñas de equipos viajan y se almacenan como texto en la tabla, aunque las filas estén restringidas a la cuenta; comparte el acceso solo con personas autorizadas.

Sin `supabase-config.js`, la app sigue funcionando localmente con IndexedDB.

## OCR desde foto (MVP)
La app reconoce texto de una imagen e intenta completar nombre del equipo, ID o Service Tag, modelo, procesador, RAM, disco y versión de Windows. Requiere Internet para cargar el motor OCR y sus datos de idioma. Los valores sugeridos se cargan solo en campos vacíos y se pueden corregir antes de guardar; siempre revísalos porque la lectura depende de la nitidez y orientación de la foto.
