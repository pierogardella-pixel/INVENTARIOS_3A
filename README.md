# Torre de Control de Inventarios 3A

Dashboard web para inventarios diarios de los pasillos 01–08. Mantiene rondas editables, historial, ERI, ERU, diferencias, investigaciones y consolidado global.

## Publicación en GitHub Pages

1. Abre **Settings → Pages** de este repositorio.
2. En **Build and deployment**, elige **Deploy from a branch**.
3. Elige **main** y **/(root)** y guarda.
4. Espera el despliegue y abre: https://pierogardella-pixel.github.io/INVENTARIOS_3A/

## Sincronización compartida cifrada

GitHub Pages no tiene una base de datos integrada. Esta solución guarda el estado cifrado en `sync/estado.enc.json` dentro del repositorio público. La página se actualiza al detectar una versión nueva (comprobación aproximada cada 30 segundos). Los datos sin cifrar nunca deben subirse al repositorio público.

### Administrador

1. Antes de migrar tus datos actuales, descarga un **Respaldo JSON** desde el HTML anterior.
2. Abre el enlace publicado. Si el dashboard está vacío, restaura el respaldo JSON.
3. Crea un **fine-grained personal access token** en https://github.com/settings/personal-access-tokens/new . Selecciona solo el repositorio `INVENTARIOS_3A` y concede **Repository permissions → Contents: Read and write**. No escribas el token en archivos, mensajes ni en el repositorio.
4. En el panel **Sincronización GitHub** selecciona **Administrador**, introduce una clave de cifrado fuerte de al menos 16 caracteres y pega el token solo en el formulario del navegador. Pulsa **Conectar**.
5. Pulsa **Publicar ahora** para crear la primera versión compartida. Después de eso, los cambios se intentarán publicar automáticamente al guardar un inventario, editar una ronda o gestionar una incidencia.
6. Comprueba el indicador de sincronización. Si muestra error, **no cierres** sin descargar primero el respaldo JSON y revisar el problema.

### Jefatura / solo lectura

1. Abre el mismo enlace de GitHub Pages.
2. Selecciona **Jefatura · solo consulta**.
3. Introduce la clave de cifrado que el administrador comparta por un medio privado.
4. Pulsa **Conectar**. Los datos se actualizarán automáticamente mientras la página esté abierta.

## Seguridad y limitaciones

- La web y el archivo cifrado se alojan en un **repositorio público**. Usa siempre una contraseña de cifrado larga, aleatoria y exclusiva. La seguridad depende de esa clave.
- El token de GitHub solo se utiliza temporalmente en la memoria de la página del administrador y se vacía al desconectar o recargar. No lo compartas con jefatura.
- El acceso a los datos del inventario depende de conocer la clave de cifrado. Esta no es una plataforma corporativa de identidad y permisos.
- Los resultados se guardan primero en el navegador. Si falla la publicación en GitHub, los cambios no llegarán a otras computadoras hasta que vuelvas a sincronizar correctamente.
- Como el archivo compartido conserva todo el estado, evita editarlo simultáneamente desde dos administradores. GitHub verifica el SHA y rechaza sobrescrituras conflictivas.
- Realiza respaldos JSON periódicos y no reemplaces el dashboard antiguo hasta haber comprobado la restauración y sincronización.
