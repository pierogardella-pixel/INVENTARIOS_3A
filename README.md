# INVENTARIOS 3A — Dashboard y sincronización con Google Sheets

Dashboard de control de inventarios para 8 pasillos, rondas editables, ERI, ERU, historial y gestión de diferencias.

**Página:** https://pierogardella-pixel.github.io/INVENTARIOS_3A/

**Base de Google Sheets (creada):** https://docs.google.com/spreadsheets/d/1XhRYp1LJJdieQqS-TaZ-m3CD4dB9O_d54IfsdnZc7V0/edit

> La web está publicada, pero **la sincronización no comenzará hasta desplegar Apps Script**. La página no puede escribir directamente en una hoja privada sin un servicio autorizado. No se necesita token de GitHub.

## Paso 1. Crear el servicio de Google Apps Script

1. Abre la hoja de Google Sheets de arriba.
2. En el menú **Extensiones → Apps Script** crea un proyecto vinculado a esa hoja.
3. Abre el archivo **Code.gs** y reemplaza su contenido por el código de [backend/Code.gs](backend/Code.gs) de este repositorio.
4. En Apps Script, entra a **Configuración del proyecto → Propiedades de secuencia de comandos**.
5. Crea estas propiedades:
   - `ADMIN_WRITE_KEY`: una contraseña nueva, aleatoria, privada y de al menos 20 caracteres, exclusiva para autorizar publicaciones del administrador.
   - `ORIGIN`: `https://pierogardella-pixel.github.io`.
   - `SPREADSHEET_ID` (opcional): ya se preconfiguró la hoja creada; no hace falta ingresarlo si usarás esa hoja.
6. Selecciona **Implementar → Nueva implementación → Tipo: Aplicación web**.
7. Configura **Ejecutar como: Yo** y **Quién tiene acceso: Cualquiera**. Autoriza los permisos de acceso a la hoja. La hoja sigue siendo privada; las respuestas públicas contienen solo datos cifrados. Si la cuenta de Google no permite una implementación accesible para «Cualquiera», esta versión necesita una integración autenticada alternativa.
8. Presiona **Implementar** y copia la URL que termina en `/exec`. **Nunca pegues contraseñas en el repositorio.**

## Paso 2. Conectar el dashboard como administrador

1. Abre https://pierogardella-pixel.github.io/INVENTARIOS_3A/ e ingresa a **DATOS**.
2. Pega la URL `https://script.google.com/macros/s/…/exec`.
3. Elige **Administrador · carga de datos**.
4. Escribe una **clave de lectura distinta** de la contraseña de administrador; mínimo 16 caracteres, recomendable una frase larga y aleatoria. Esa clave cifra los datos en tu navegador.
5. En **Clave de administrador**, escribe exactamente el valor de `ADMIN_WRITE_KEY` guardado en Apps Script.
6. Pulsa **Conectar Google Sheets** y después **Publicar datos** para publicar la primera ronda.
7. A partir de ese momento, cada guardado de inventario, edición de ronda o gestión de diferencias intentará enviar una nueva versión cifrada a Sheets automáticamente, siempre que la sesión de administrador permanezca conectada.
8. Comprueba que se muestre **«Guardado en Google Sheets»**. Si no, los datos permanecen en el navegador y debes resolver la conexión o descargar un respaldo JSON antes de cerrar.

**Migración:** Si tienes inventarios antiguos en otro archivo HTML, primero descarga **Respaldo JSON** en ese archivo. Luego abre el dashboard publicado y restaura el JSON antes de publicar la primera versión compartida. Nunca sobrescribas los datos en Sheets sin revisar que conservaste el histórico que necesitas.

## Paso 3. Jefatura: consultar los datos

1. Abre el mismo enlace del dashboard desde otra computadora.
2. En **DATOS**, introduce la URL de Apps Script, selecciona **Jefatura · consulta** y escribe únicamente la clave de lectura.
3. Activa **Recordar lectura en esta computadora** y pulsa **Conectar Google Sheets**.
4. El dashboard mostrará el último inventario publicado y verificará actualizaciones aproximadamente cada 25 segundos. En ese mismo navegador podrá volver a conectar automáticamente si el almacenamiento de credenciales de lectura es compatible.
5. Después de la primera configuración puedes enviar la URL `/exec` a ChatGPT para incorporarla en la configuración pública del dashboard, de forma que tus compañeros ya no tengan que copiarla cada uno.

## Estructura del historial y seguridad

- `index.html`: dashboard.
- `sheets-sync.js`: cliente; cifra y descifra los datos con AES-GCM y derivación PBKDF2, usando la clave de lectura.
- `backend/Code.gs`: servicio Apps Script; recibe **solo el archivo cifrado**, lo divide en fragmentos seguros para Google Sheets y agrega nuevas revisiones a la pestaña `VERSIONES_CIFRADAS`, sin borrar las anteriores.
- Las rondas, sesiones, investigaciones y reconteos están incluidos en el estado cifrado.
- La hoja debe **permanecer privada** y solo abrirse desde una cuenta autorizada. No compartas la contraseña de administrador con jefatura ni publiques claves en archivos.
- La lectura de los datos cifrados está disponible para quien conozca la URL de Apps Script. La privacidad depende de mantener privada una **clave de lectura fuerte**. Este sistema no es una plataforma de control corporativo de identidades; para mayor seguridad es preferible un backend con autenticación por usuario.
- El token de GitHub no se utiliza. El acceso administrador requiere su propia clave de escritura, que no se guarda automáticamente al cerrar la página.
- El acceso de lectura puede recordarse solo en el navegador de un equipo confiable. Cualquiera que tenga acceso al perfil de ese navegador puede ver los inventarios descifrados.

## Solución de problemas

- **Sin configuración / «Sin conexión»**: falta la URL de Apps Script o no se ha autorizado el servicio.
- **Error 404**: se pegó una URL de prueba `/dev` o hay un despliegue incorrecto; vuelve a implementar y usa `/exec`.
- **Clave incorrecta**: asegúrate de no confundir la clave de lectura con la de administrador.
- **No publicado**: no cierres la página antes de descargar un JSON de respaldo. Verifica conexión, permisos y clave de escritura.
- **Cambios simultáneos**: el servicio rechaza sobrescribir una revisión ajena; sincroniza los datos antes de intentar publicar.
- **Límite de tamaño**: cada revisión cifrada admite hasta 6 MB y se divide en fragmentos de 30 000 caracteres. Si el inventario es más grande se necesita ampliación del backend.

**Confidencialidad corporativa:** esta hoja se creó en la cuenta personal de Google conectada. Antes de subir información interna real de Tiendas 3A, confirma que tu empresa autorice ese destino o migra la solución a una cuenta corporativa.
