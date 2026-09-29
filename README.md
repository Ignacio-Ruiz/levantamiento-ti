# Levantamiento Equipos TI PWA v1.1

PWA móvil y offline para levantar equipos computacionales en Dalcahue, Ilque y Quellón.

## Campos del Excel de origen
- Descripcion
- ID dispositivo
- Nombre Dispositivo
- Ubicación/cargo
- Producto
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
Los datos quedan localmente en el dispositivo. Las contraseñas se manejan como campos sensibles dentro de la app y se incluyen en el Excel si fueron registradas, por lo que el archivo exportado debe protegerse.

## GitHub Pages
Subir el contenido de esta carpeta a la raíz del repositorio y publicar `main / (root)` desde Settings > Pages.
