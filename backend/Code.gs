/**
 * INVENTARIOS 3A — Google Sheets Backend
 * Despliegue: Aplicación web · Ejecutar como Yo · Quién tiene acceso: Cualquiera.
 * Los inventarios se almacenan CIFRADOS. Nunca se envía la clave de lectura a este servicio.
 *
 * Configuración en Apps Script -> Configuración del proyecto -> Propiedades de secuencia de comandos:
 * SPREADSHEET_ID = ID de tu Google Sheet (opcional: hoja preconfigurada por defecto)
 * ADMIN_WRITE_KEY = contraseña larga y aleatoria de administrador (distinta de la clave de lectura)
 * ORIGIN = https://pierogardella-pixel.github.io
 */
const HISTORIAL_SHEET = 'VERSIONES_CIFRADAS';
const DEFAULT_SPREADSHEET_ID = '16pbpTW88QazyegjnTfVUeFKZyK1N_wCJexV_9tyPMTw';
const CHUNK_SIZE = 30000;
const MAX_PAYLOAD_SIZE = 6000000;

function properties_() {
  const p = PropertiesService.getScriptProperties();
  const sheetId = p.getProperty('SPREADSHEET_ID') || DEFAULT_SPREADSHEET_ID;
  if (!sheetId) throw Error('Falta SPREADSHEET_ID en Propiedades del proyecto');
  return { sheetId: sheetId, writeKey: p.getProperty('ADMIN_WRITE_KEY') || '', origin: p.getProperty('ORIGIN') || 'https://pierogardella-pixel.github.io' };
}
function sheet_() {
  const p = properties_();
  const ss = SpreadsheetApp.openById(p.sheetId);
  let sh = ss.getSheetByName(HISTORIAL_SHEET);
  if (!sh) {
    sh = ss.insertSheet(HISTORIAL_SHEET);
    sh.getRange(1, 1, 1, 6).setValues([['Revisión', 'Fecha UTC', 'Parte', 'Total de partes', 'Datos cifrados', 'Tipo']]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function latest_() {
  const sh = sheet_(), n = sh.getLastRow();
  if (n < 2) return { ok:true, exists:false, revision:null, savedAt:null, pack:null };
  const last = sh.getRange(n, 1, 1, 6).getValues()[0];
  const total = Number(last[3]);
  if (!Number.isInteger(total) || total < 1 || total > 1200 || total > n - 1)
    throw Error('El último respaldo está incompleto: revisa las filas del historial');
  const rows = sh.getRange(n - total + 1, 1, total, 5).getValues();
  const rev = String(last[0]);
  if (!rows.every((r,i)=>String(r[0])===rev && Number(r[2])===i+1 && Number(r[3])===total))
    throw Error('El último respaldo tiene fragmentos incompletos');
  const payload = rows.map(r=>String(r[4])).join('');
  const pack = JSON.parse(payload);
  if (pack.format !== 'inventario-3a-aesgcm-v1' || pack.revision !== rev) throw Error('Formato cifrado inválido');
  return {ok:true,exists:true,revision:rev,savedAt:pack.savedAt,pack:pack};
}

/**
 * Lectura por HTML Service (en lugar de ContentService).
 * Apps Script ContentService puede fallar al redireccionar a googleusercontent
 * con 404 intermitentes incluso si la ejecución termina correctamente.
 * La respuesta es exclusivamente un paquete cifrado y se envía al origen autorizado.
 */
function doGet(e) {
  const p=(e && e.parameter)||{};
  const requestId=String(p.requestId||'');
  const isBridge=/^[A-Za-z0-9_-]{8,80}$/.test(requestId);
  let result;
  try {result=latest_()}catch(err){result={ok:false,error:String(err && err.message || err)}}
  const origin=properties_().origin;
  // Respaldo compatible con JSONP. Es lectura únicamente y el contenido sigue cifrado.
  // Útil cuando el iframe de HtmlService no puede enviar postMessage al dashboard.
  const cb=String(p.callback||'');
  if (/^uca3aCallback_[A-Za-z0-9_]{6,80}$/.test(cb)) {
    return ContentService.createTextOutput(cb+'('+JSON.stringify(result)+');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  if (!isBridge) {
    const ok=!!(result && result.ok);
    const safeMsg=ok
      ? (result.exists ? 'Base disponible · hay versiones de inventario cifradas.' : 'Base disponible · aún no hay inventarios publicados.')
      : ('Error de configuración · '+String(result.error||'desconocido'));
    const html='<!doctype html><html><head><meta charset="utf-8"><title>Inventarios 3A · Conexión</title></head><body style="font-family:Arial,sans-serif;margin:50px auto;max-width:650px;color:#183787"><h2>Inventarios 3A · '+(ok?'Servicio activo':'Servicio no disponible')+'</h2><p>'+safeMsg.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</p><p>La información de inventario se almacena cifrada. Abre el dashboard de GitHub para consultarla.</p></body></html>';
    return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  const message=JSON.stringify({type:'inventarios3a-sheets-read',requestId:requestId,result:result})
    .replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const script='<!doctype html><html><head><meta charset="utf-8"></head><body><script>'
    +'try{window.top.postMessage('+message+','+JSON.stringify(origin)+');}catch(err){document.body.textContent="No se pudo entregar la respuesta";}'
    +'<\/script></body></html>';
  return HtmlService.createHtmlOutput(script).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function equalsKey_(actual, expected) {
  actual = String(actual || ''); expected = String(expected || '');
  if (!expected || actual.length !== expected.length) return false;
  let diff = 0; for (let i=0; i<actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
function doPost(e) {
  const p = (e && e.parameter) || {};
  const requestId = String(p.requestId||'').slice(0,80);
  let response;
  try {
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) throw Error('Solicitud inválida');
    const props = properties_();
    if (!equalsKey_(p.writeKey,props.writeKey)) throw Error('Clave de administrador incorrecta');
    const text = String(p.payload||'');
    if (!text || text.length > MAX_PAYLOAD_SIZE) throw Error('Archivo demasiado grande (máximo 6 MB cifrados)');
    const pack=JSON.parse(text);
    if (pack.format !== 'inventario-3a-aesgcm-v1' || !/^[A-Za-z0-9_-]{12,60}$/.test(String(pack.revision||'')) || !pack.salt || !pack.iv || !pack.cipher)
      throw Error('Formato cifrado o identificador de versión inválido');
    const lock=LockService.getScriptLock();
    if(!lock.tryLock(20000)) throw Error('Servidor ocupado, intenta de nuevo');
    try {
      const current=latest_();
      const expected=String(p.expectedRevision||'');
      if(current.exists && current.revision !== expected)
        throw Error('CONFLICTO: otra versión se publicó antes. Recarga y revisa los datos antes de sobrescribir.');
      if(!current.exists && expected)
        throw Error('CONFLICTO: la versión anterior ya no existe.');
      const chunks=[];
      for(let i=0;i<text.length;i+=CHUNK_SIZE)chunks.push(text.slice(i,i+CHUNK_SIZE));
      const sh=sheet_();
      const rows=chunks.map((chunk,i)=>[pack.revision,String(pack.savedAt||new Date().toISOString()),i+1,chunks.length,chunk,'Cifrado AES-GCM']);
      sh.getRange(sh.getLastRow()+1,1,rows.length,6).setValues(rows);
      SpreadsheetApp.flush();
      response={ok:true,revision:pack.revision,savedAt:pack.savedAt,parts:chunks.length};
    } finally {lock.releaseLock()}
  } catch (err) {
    response={ok:false,error:String(err.message||err)};
  }
  let origin='https://pierogardella-pixel.github.io';
  try {origin=properties_().origin}catch(err){}
  // Mensaje al iframe; la página también verifica el estado por GET (confirmación independiente).
  const msg=JSON.stringify({type:'inventarios3a-sheets-result',requestId:requestId,result:response}).replace(/</g,'\\u003c');
  const html='<!doctype html><html><body><script>window.top.postMessage('+msg+','+JSON.stringify(origin)+');<\/script><p>Respuesta registrada.</p></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
