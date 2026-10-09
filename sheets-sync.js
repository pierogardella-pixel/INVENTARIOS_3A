/* Tiendas 3A - Synchronization through Google Sheets / Apps Script. */
(function(){
"use strict";
var CONFIG="inventarios3a_sheets_url_v1",KEY_DB="inventarios3a_viewer_keys_v1",FRAME_ORIGINS=["https://script.google.com","https://script.googleusercontent.com"];
var DEFAULT_ENDPOINT="https://script.google.com/macros/s/AKfycbwYGP9wz_9sjrWNiWK4PX5X1SZGAtrC0wnxN-_5LbmaudbxufAJspNmIeS52DwH69iJ/exec";
var endpoint="",readSecret="",writerSecret="",material=null,role="viewer",connected=false,serverRevision="",syncBusy=false,pending=false,loadingShared=false,muted=false,interval=null,debounce=null,lastKnown=null,verifyTimer=null,preflightTimer=null,preflightBusy=false,manualDisconnected=false;
const el=id=>document.getElementById(id);
function status(t,kind){var x=el("cloudStatus");if(x){x.textContent=t;x.dataset.kind=kind||"warning"}}
function stamp(s){var d=new Date(s);return !s||!Number.isFinite(d.valueOf())?"Sin datos publicados":d.toLocaleString("es-PE",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}
function sharedStatus(text,kind,full){
 var x=el("sharedUpdatedAt");if(!x)return;
 x.textContent=text;
 x.dataset.syncState=kind||"pending";
 x.title=full||text;
}
function latest(meta){
 lastKnown=meta;
 var full=meta&&meta.savedAt?"Última actualización publicada: "+stamp(meta.savedAt):"Sin inventarios publicados";
 var x=el("cloudLastUpdate");if(x){x.textContent=full;x.title=full}
 if(meta&&meta.savedAt){
  sharedStatus(
    (connected?"☁ Sincronizado · ":"☁ Datos publicados · ")+stamp(meta.savedAt),
    connected?"ok":"available",
    connected?full+" · conexión activa":full+" · conecta en DATOS para leer inventarios"
  );
 }else{
  sharedStatus(connected?"☁ Conectado · sin cargas":"☁ Sin cargas publicadas",connected?"ok":"empty",full);
 }
}
function syncError(e){
 var msg=e&&e.message||String(e||"No se pudo consultar el servicio");
 sharedStatus("⚠ Error en nube · DATOS","error","No se pudo consultar Google Sheets: "+msg);
 return msg;
}
function utf(s){return new TextEncoder().encode(s)}
function b64(b){var a="";for(var i=0;i<b.length;i+=8192)a+=String.fromCharCode.apply(null,b.subarray(i,i+8192));return btoa(a)}
function unb64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
async function masterKey(){if(material)return material;if(!readSecret)throw Error("Introduce la clave de lectura");material=await crypto.subtle.importKey("raw",utf(readSecret),"PBKDF2",false,["deriveKey"]);return material}
async function derive(salt){return crypto.subtle.deriveKey({name:"PBKDF2",salt:salt,iterations:240000,hash:"SHA-256"},await masterKey(),{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
async function zip(bytes){if(!window.CompressionStream)return {bytes:bytes,codec:"identity"};var cs=new CompressionStream("gzip"),b=await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();return {bytes:new Uint8Array(b),codec:"gzip"}}
async function unzip(bytes,codec){if(codec!=="gzip")return bytes;if(!window.DecompressionStream)throw Error("Tu navegador no admite descompresión gzip");var ds=new DecompressionStream("gzip"),b=await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();return new Uint8Array(b)}
async function encryptState(obj){var salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));var packed=await zip(utf(JSON.stringify(obj)));var encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv:iv},await derive(salt),packed.bytes);return {format:"inventario-3a-aesgcm-v1",revision:crypto.randomUUID(),savedAt:new Date().toISOString(),codec:packed.codec,salt:b64(salt),iv:b64(iv),cipher:b64(new Uint8Array(encrypted))}}
async function decryptState(p){if(!p||p.format!=="inventario-3a-aesgcm-v1")throw Error("Formato cifrado desconocido");var bytes;try{bytes=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(p.iv)},await derive(unb64(p.salt)),unb64(p.cipher)))}catch(e){throw Error("La clave de lectura es incorrecta o los datos están dañados")}var obj=JSON.parse(new TextDecoder().decode(await unzip(bytes,p.codec||"identity")));if(!Array.isArray(obj.cycles)||!Array.isArray(obj.sessions)||!obj.actions||typeof obj.actions!=="object")throw Error("El inventario compartido no es válido");return obj}
function urlOk(url){return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec\/?$/.test(url)}
function scriptURL(){var x=String(el("sheetApiUrl").value||"").trim().replace(/\/$/,"");if(!urlOk(x))throw Error("Introduce la dirección /exec de Google Apps Script");return x}
function jsonpOnce(){return new Promise((resolve,reject)=>{
 var cb="uca3aCallback_"+Math.random().toString(36).slice(2)+Date.now().toString(36),script=document.createElement("script"),done=false;
 var t=setTimeout(()=>finish(Error("Tiempo de espera agotado: Apps Script no respondió")),18000);
 function finish(err,data){if(done)return;done=true;clearTimeout(t);delete window[cb];script.remove();if(err)reject(err);else if(!data||!data.ok)reject(Error((data&&data.error)||"Apps Script respondió con un error"));else resolve(data)}
 window[cb]=data=>finish(null,data);
 script.onerror=()=>finish(Error("La respuesta de Apps Script fue bloqueada o no se pudo cargar"));
 script.onload=()=>setTimeout(()=>{if(!done)finish(Error("Apps Script no devolvió la respuesta esperada. Verifica que el despliegue incluya doGet(e)"))},500);
 script.async=true;
 script.src=endpoint+"?callback="+cb+"&t="+Date.now();
 document.head.appendChild(script);
 })}
async function jsonp(){
 var last;
 for(var n=0;n<3;n++){
  try{return await jsonpOnce()}catch(e){
   last=e;
   if(/Clave|cifrado|Formato|permiso de escritura|SPREADSHEET_ID|callback|hoja|sheet/i.test(e.message))throw e;
   if(n<2)await new Promise(resolve=>setTimeout(resolve,900*(n+1)));
  }
 }
 throw Error(last.message+". Comprueba el botón «Probar Apps Script» y vuelve a implementar la versión actual con acceso «Cualquiera».");
}

/* La lectura principal usa HtmlService y postMessage, para evitar los 404 del
   redireccionamiento ContentService documentados por Google. */
var readTransport="auto";
function allowedGoogleOrigin(origin){
 return origin==="https://script.google.com" ||
        origin==="https://script.googleusercontent.com" ||
        /^https:\/\/[a-z0-9.-]+\.googleusercontent\.com$/i.test(origin);
}
function iframeRead(){
 return new Promise((resolve,reject)=>{
  var reqId="read"+Date.now().toString(36)+Math.random().toString(36).slice(2),
      iframe=document.createElement("iframe"),done=false,wait=null;
  iframe.style.cssText="position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none";
  iframe.setAttribute("aria-hidden","true");
  iframe.tabIndex=-1;
  var timeout=setTimeout(()=>end(Error("Apps Script no respondió mediante la lectura web")),18000);
  function end(err,val){
    if(done)return;
    done=true;clearTimeout(timeout);if(wait)clearTimeout(wait);
    removeEventListener("message",listener);iframe.remove();
    if(err)reject(err);else resolve(val);
  }
  function listener(evt){
    if(!allowedGoogleOrigin(evt.origin))return;
    var msg=evt.data;
    if(!msg||msg.type!=="inventarios3a-sheets-read"||msg.requestId!==reqId)return;
    if(!msg.result||!msg.result.ok)end(Error(msg.result&&msg.result.error||"La base compartida devolvió un error"));
    else end(null,msg.result);
  }
  addEventListener("message",listener);
  iframe.onload=function(){
    if(!done)wait=setTimeout(()=>end(Error("La aplicación publicada aún no utiliza lectura HTML. Actualiza el código Apps Script y despliega una nueva versión")),5500);
  };
  iframe.src=endpoint+"?requestId="+encodeURIComponent(reqId)+"&v="+Date.now();
  document.body.appendChild(iframe);
 })
}
async function readLatest(){
 if(readTransport==="jsonp"){
   try{return await jsonp()}catch(e){readTransport="auto"}
 }
 try{var response=await iframeRead();readTransport="iframe";return response}
 catch(err){
   try{var fallback=await jsonp();readTransport="jsonp";return fallback}
   catch(e){throw Error("La lectura de Google Sheets falló: "+err.message+"; respaldo anterior: "+e.message)}
 }
}

function openStore(){return new Promise((resolve,reject)=>{var r=indexedDB.open(KEY_DB,1);r.onupgradeneeded=()=>r.result.createObjectStore("settings");r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result)})}
async function rememberKey(){try{var k=await masterKey(),db=await openStore();await new Promise((a,b)=>{var tx=db.transaction("settings","readwrite");tx.objectStore("settings").put(k,"viewerKey");tx.oncomplete=a;tx.onerror=()=>b(tx.error)});db.close();return true}catch(e){return false}}
async function recallKey(){try{var db=await openStore(),v=await new Promise((a,b)=>{var tx=db.transaction("settings","readonly"),r=tx.objectStore("settings").get("viewerKey");r.onsuccess=()=>a(r.result||null);r.onerror=()=>b(r.error)});db.close();return v}catch(e){return null}}
async function forgetKey(){try{var db=await openStore();await new Promise((a,b)=>{var tx=db.transaction("settings","readwrite");tx.objectStore("settings").delete("viewerKey");tx.oncomplete=a;tx.onerror=()=>b(tx.error)});db.close()}catch(e){}}
function lockViewer(isViewer){var ids=["uploadBtn","newCycleBtn","renameCycleBtn","confirmImport","saveAction","createCycle","saveCycleName","restoreBtn"];ids.forEach(id=>{var x=el(id);if(x)x.disabled=isViewer});document.body.classList.toggle("cloud-readonly",isViewer)}
async function applyRemote(obj){
 muted=true;
 try{
   var before=currentCycle;
   state={cycles:obj.cycles,sessions:obj.sessions,actions:obj.actions,_savedAt:obj._savedAt||new Date().toISOString()};
   currentCycle=state.cycles.some(x=>x.id===before)?before:(state.cycles[0]&&state.cycles[0].id||"");
   currentAisle="01";selectedSession="";
   await persist();render();
 }finally{muted=false}
}
async function checkRemote(force){
 if(!endpoint)return;
 var d=await readLatest();latest(d);
 if(!connected)return;
 if(!d.exists){if(force)status("Sin inventarios publicados todavía","warning");return}
 if(d.revision===serverRevision)return;
 if(role==="admin"&&!force){status("Hay una actualización remota nueva. Actualiza desde DATOS antes de guardar.","warning");return}
 var decoded=await decryptState(d.pack);
 if(role==="admin" && state.sessions.length>decoded.sessions.length && !force){
    status("Hay inventarios locales sin publicar. Haz respaldo y revisa antes de sincronizar.","warning");return
 }
 await applyRemote(decoded);serverRevision=d.revision;
 status("Actualizado desde Google Sheets · "+stamp(d.savedAt),"ok")
}
async function connect(){
 if(!window.crypto||!crypto.subtle)throw Error("Esta web requiere HTTPS y cifrado del navegador");
 endpoint=scriptURL();
 var pwd=el("cloudKey").value,write=el("cloudWriteKey").value.trim();
 role=el("cloudRole").value;
 if(!material && pwd.length<16)throw Error("Introduce una clave de lectura de por lo menos 16 caracteres");
 if(role==="admin"&&!write)throw Error("Introduce la clave de administrador de Apps Script");
 if(pwd){material=null;readSecret=pwd}
 writerSecret=role==="admin"?write:"";
 status("Conectando con Google Sheets…","warning");
 var result=await readLatest();latest(result);
 if(result.exists){
  var remote=await decryptState(result.pack);
  var extra=role==="admin"&&(
   state.sessions.length>remote.sessions.length ||
   state.sessions.some(s=>!remote.sessions.some(r=>r.id===s.id&&r.cycleId===s.cycleId&&r.createdAt===s.createdAt)) ||
   (state.sessions.length>0 && JSON.stringify(state.actions)!==JSON.stringify(remote.actions))
  );
  if(extra){status("Conectado, pero hay inventarios locales sin publicar. Conservamos tus datos. Haz respaldo y pulsa «Publicar datos».","warning")}
  else{await applyRemote(remote);status("Sincronizado · "+stamp(result.savedAt),"ok")}
  serverRevision=result.revision;
 }else{serverRevision="";status("Conectado · aún no hay datos publicados. Carga un inventario o pulsa «Publicar datos».","warning")}
 connected=true;manualDisconnected=false;window.inventoryCloudRole=role;latest(result);
 if(typeof extra!=="undefined"&&extra)sharedStatus("⚠ Datos locales pendientes","pending","Hay inventarios o investigaciones locales no publicados. Haz respaldo y publica desde DATOS.");
 el("cloudPublish").disabled=role!=="admin";el("cloudDisconnect").disabled=false;
 lockViewer(role==="viewer");
 if(el("cloudRemember")&&el("cloudRemember").checked){if(!await rememberKey())status("Conectado. Este navegador no permite recordar la clave de lectura.","warning")}
 try{localStorage.setItem(CONFIG,endpoint)}catch(e){}
 el("cloudKey").value="";el("cloudWriteKey").value="";
 clearInterval(interval);interval=setInterval(()=>checkRemote(false).catch(e=>status("No se pudo actualizar: "+e.message,"error")),25000)
}
function iframePost(formData,revision){
 return new Promise((resolve,reject)=>{
   var reqId="save"+Date.now().toString(36)+Math.random().toString(36).slice(2);
   var iframe=document.createElement("iframe");iframe.style.cssText="display:none;width:0;height:0;border:0";iframe.name="sheets3a_"+reqId;
   var form=document.createElement("form");form.method="POST";form.action=endpoint;form.target=iframe.name;form.style.display="none";
   var inputs={requestId:reqId,writeKey:writerSecret,expectedRevision:serverRevision,payload:JSON.stringify(formData)};
   Object.keys(inputs).forEach(k=>{var v=document.createElement("textarea");v.name=k;v.value=inputs[k];form.appendChild(v)});
   document.body.appendChild(iframe);document.body.appendChild(form);
   var settled=false;
   var timeout=setTimeout(()=>end(Error("Tiempo de espera agotado. Comprueba la última versión antes de volver a guardar.")),75000);
   function end(err,val){if(settled)return;settled=true;clearTimeout(timeout);clearInterval(confirmTimer);removeEventListener("message",listener);form.remove();iframe.remove();if(err)reject(err);else resolve(val)}
   function listener(event){if(!allowedGoogleOrigin(event.origin))return;var msg=event.data;if(!msg||msg.type!=="inventarios3a-sheets-result"||msg.requestId!==reqId)return;if(!msg.result||!msg.result.ok)end(Error(msg.result&&msg.result.error||"El servidor rechazó la carga"));else end(null,msg.result)}
   addEventListener("message",listener);
   // La confirmación se verifica también leyendo la versión publicada: el navegador puede bloquear mensajes del iframe.
   var confirmTimer=setInterval(async()=>{if(settled)return;try{var r=await readLatest();if(r.exists&&r.revision===revision)end(null,{ok:true,revision:revision,savedAt:r.savedAt})}catch(e){}},4500);
   try{form.submit()}catch(e){end(e)}
 })
}
async function publish(manual){
 if(!connected||role!=="admin")return;
 if(syncBusy){pending=true;return}
 syncBusy=true;
 status("Cifrando y guardando inventarios en Google Sheets…","warning");if(typeof window.setSaveStatus==="function")window.setSaveStatus("saving","Publicando en Google Sheets…");
 try{
  var prev=await readLatest();latest(prev);
  if(prev.exists&&prev.revision!==serverRevision)throw Error("Otra versión más reciente está publicada. No se sobrescribió. Recarga los datos y revisa el historial.");
  if(!prev.exists&&serverRevision)throw Error("El historial publicado cambió. Comprueba DATOS antes de guardar.");
  var obj=JSON.parse(JSON.stringify(state)),pack=await encryptState(obj),bytes=JSON.stringify(pack).length;
  if(bytes>5800000)throw Error("Los datos superan 5.8 MB cifrados por actualización. Contacta al administrador para particionar el histórico.");
  var res=await iframePost(pack,pack.revision);
  serverRevision=pack.revision;latest({savedAt:res.savedAt||pack.savedAt,revision:serverRevision,exists:true});
  status("Guardado en Google Sheets · "+stamp(res.savedAt||pack.savedAt),"ok");latest({exists:true,revision:pack.revision,savedAt:res.savedAt||pack.savedAt});if(typeof window.setSaveStatus==="function")window.setSaveStatus("ok","En Google Sheets · "+stamp(res.savedAt||pack.savedAt));
 }catch(e){status("No publicado: "+e.message,"error");sharedStatus("⚠ Sin publicar · DATOS","error","Google Sheets no recibió esta carga: "+e.message);if(typeof window.setSaveStatus==="function")window.setSaveStatus("error","Solo guardado local · sincronización fallida");if(manual)alert("No se pudo publicar en Sheets: "+e.message+". Los inventarios permanecen en este navegador. Descarga un respaldo JSON.");}
 finally{syncBusy=false;if(pending){pending=false;setTimeout(()=>publish(false),1000)}}
}
window.cloudSyncQueue=function(){
 if(muted||loadingShared||!connected||role!=="admin")return;
 sharedStatus("◌ Pendiente de nube","pending","Cambios guardados localmente: publicando en Google Sheets…");
 clearTimeout(debounce);debounce=setTimeout(()=>publish(false),1600)
};
function disconnect(){clearInterval(interval);clearTimeout(debounce);connected=false;manualDisconnected=true;window.inventoryCloudRole="";material=null;readSecret="";writerSecret="";role="viewer";serverRevision="";lockViewer(false);el("cloudPublish").disabled=true;el("cloudDisconnect").disabled=true;latest(lastKnown);status("Desconectado · el guardado local continúa funcionando","warning");if(typeof window.setSaveStatus==="function")window.setSaveStatus("ok","Guardado local · sin conexión compartida")}
async function preflight(){
 if(connected||preflightBusy||!endpoint||document.hidden)return;
 preflightBusy=true;
 try{
  var data=await readLatest();
  latest(data);
  status(data.exists?"Google Sheets disponible · conecta para consultar el inventario":"Google Sheets disponible · sin publicaciones","warning");
  if(!manualDisconnected&&el("cloudRole").value==="viewer"){
   var remembered=await recallKey();
   if(remembered&&!connected){
    material=remembered;
    el("cloudRemember").checked=true;
    loadingShared=true;
    try{await Promise.resolve(window.inventoryReady)}finally{loadingShared=false}
    await connect();
   }
  }
 }catch(e){
  status("No se pudo consultar Google Sheets: "+syncError(e),"error");
 }finally{preflightBusy=false}
}
async function init(){
 window.inventoryCloudRole="";
 sharedStatus("☁ Consultando nube…","pending","Verificando la última versión disponible en Google Sheets");
 var wrap=el("cloudTokenWrap");if(wrap)wrap.style.display="none";
 var intro=document.querySelector(".cloudintro");
 if(intro&&!el("cloudLastUpdate")){var b=document.createElement("span");b.id="cloudLastUpdate";b.textContent="Comprobando última actualización…";b.style.cssText="display:block;width:100%;font-weight:700;font-size:11px;color:#1f3fb6";intro.appendChild(b)}
 var x=el("sheetApiUrl"),saved="";
 try{saved=localStorage.getItem(CONFIG)||""}catch(e){}
 x.value=DEFAULT_ENDPOINT;
 try{if(saved!==DEFAULT_ENDPOINT)localStorage.setItem(CONFIG,DEFAULT_ENDPOINT)}catch(e){}
 el("cloudRole").onchange=function(){var admin=el("cloudRole").value==="admin";el("cloudWriteWrap").hidden=!admin;el("cloudRememberWrap").hidden=admin};
 el("cloudRole").dispatchEvent(new Event("change"));
 el("cloudConnect").onclick=function(){connect().catch(e=>{connected=false;writerSecret="";status("Error: "+e.message,"error");syncError(e)})};
 el("cloudPublish").onclick=function(){publish(true)};
 el("cloudDisconnect").onclick=disconnect;
 document.addEventListener("click",function(e){if(!connected||role!=="viewer")return;if(e.target.closest("[data-delete],[data-action-key],[data-start-upload]")){e.preventDefault();e.stopImmediatePropagation();alert("Modo consulta: no puedes modificar inventarios compartidos")}},true);
 document.addEventListener("visibilitychange",()=>{
  if(document.hidden)return;
  if(connected)checkRemote(false).catch(e=>{status("No se pudo actualizar Google Sheets: "+e.message,"error");syncError(e)});
  else preflight();
 });
 if(!x.value){status("Sin URL configurada · revisa la conexión de Google Sheets","warning");sharedStatus("⚠ Nube sin configurar","error");return}
 endpoint=x.value;
 clearInterval(preflightTimer);
 preflightTimer=setInterval(()=>preflight(),75000);
 await preflight();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();