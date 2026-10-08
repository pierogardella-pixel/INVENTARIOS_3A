/* GitHub encrypted synchronization — Inventarios 3A */
(function(){
"use strict";
var OWNER="pierogardella-pixel",REPO="INVENTARIOS_3A",FILE="sync/estado.enc.json";
var api="https://api.github.com/repos/"+OWNER+"/"+REPO+"/contents/"+FILE;
var raw="https://raw.githubusercontent.com/"+OWNER+"/"+REPO+"/main/"+FILE;
var role="",secret="",token="",lastSha=null,lastRev="",connected=false,pushing=false,queued=false,suppress=false,timer=null,pollTimer=null;
var el=id=>document.getElementById(id);
function status(msg,kind){var x=el("cloudStatus");if(x){x.textContent=msg;x.dataset.kind=kind||"warning"}}
function toB64(bytes){var s="";for(var i=0;i<bytes.length;i+=16384)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+16384));return btoa(s)}
function fromB64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
function encode(s){return toB64(new TextEncoder().encode(s))}
function decode(s){return new TextDecoder().decode(fromB64(s))}
async function getKey(salt){var k=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",salt:salt,iterations:240000,hash:"SHA-256"},k,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
async function encrypt(data){var salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await getKey(salt);var result=await crypto.subtle.encrypt({name:"AES-GCM",iv:iv},key,new TextEncoder().encode(JSON.stringify(data)));return {format:"inventario-3a-aesgcm-v1",revision:crypto.randomUUID(),savedAt:new Date().toISOString(),salt:toB64(salt),iv:toB64(iv),cipher:toB64(new Uint8Array(result))}}
async function decrypt(obj){if(!obj||obj.format!=="inventario-3a-aesgcm-v1")throw Error("Formato de archivo no válido");var k=await getKey(fromB64(obj.salt));var bytes;try{bytes=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64(obj.iv)},k,fromB64(obj.cipher))}catch(e){throw Error("Clave incorrecta o datos cifrados dañados")}var d=JSON.parse(new TextDecoder().decode(bytes));if(!Array.isArray(d.cycles)||!Array.isArray(d.sessions)||!d.actions||typeof d.actions!=="object")throw Error("Datos compartidos no válidos");return d}
async function readRemote(apiMode){var url=(apiMode?api:raw)+"?t="+Date.now();var headers=apiMode&&token?{Authorization:"Bearer "+token,Accept:"application/vnd.github+json"}:{};var r=await fetch(url,{headers:headers,cache:"no-store"});if(r.status===404)return {missing:true};if(!r.ok)throw Error("GitHub respondió HTTP "+r.status);if(apiMode){var j=await r.json();return {pack:JSON.parse(decode(j.content.replace(/\s/g,""))),sha:j.sha}}return {pack:await r.json()}}
function lockViewer(yes){["uploadBtn","newCycleBtn","renameCycleBtn","confirmImport","saveAction","createCycle","saveCycleName"].forEach(id=>{var n=el(id);if(n)n.disabled=yes});document.body.classList.toggle("cloud-readonly",yes)}
async function apply(data){suppress=true;try{state={cycles:data.cycles,sessions:data.sessions,actions:data.actions,_savedAt:data._savedAt||new Date().toISOString()};currentCycle=state.cycles[0]&&state.cycles[0].id||"";var first=state.sessions.find(s=>s.cycleId===currentCycle);currentAisle=first&&first.aisle||"01";selectedSession=first&&first.id||"";await persist();render()}finally{suppress=false}}
async function connect(){
if(!window.crypto||!crypto.subtle)throw Error("Abre esta web desde GitHub Pages con HTTPS");
var r=el("cloudRole").value,s=el("cloudKey").value,t=el("cloudToken").value.trim();
if(s.length<16)throw Error("Utiliza una clave compartida de por lo menos 16 caracteres");
if(r==="admin"&&!t)throw Error("Falta el token GitHub (Contents: Read and write)");
role=r;secret=s;token=r==="admin"?t:"";status("Conectando...");
var data=await readRemote(role==="admin");
if(data.missing){
  if(role==="viewer")throw Error("No hay inventarios publicados todavía. El administrador debe pulsar «Publicar ahora»");
  lastSha=null;connected=true;status("Conectado · datos de GitHub aún vacíos. Pulsa Publicar ahora","warning")
}else{
  var remote=await decrypt(data.pack);lastSha=data.sha||null;lastRev=data.pack.revision||"";
  if(role==="admin"&&state.sessions.length>remote.sessions.length&&!confirm("Este navegador tiene más registros locales. ¿Quieres cargar el registro compartido? Pulsa Cancelar si prefieres publicar tus datos locales.")){
    connected=true;status("Conectado · datos locales aún no publicados. Usa Publicar ahora","warning")
  }else{await apply(remote);connected=true;status("Sincronizado · "+new Date(data.pack.savedAt).toLocaleString("es-PE"),"ok")}
}
el("cloudPublish").disabled=role!=="admin";el("cloudDisconnect").disabled=false;
lockViewer(role==="viewer");el("cloudKey").value="";el("cloudToken").value="";
clearInterval(pollTimer);pollTimer=setInterval(()=>poll().catch(e=>status("Error de actualización: "+e.message,"error")),30000)
}
async function poll(){if(!connected||pushing||role!=="viewer")return;var r=await readRemote(false);if(r.missing||r.pack.revision===lastRev)return;var data=await decrypt(r.pack);lastRev=r.pack.revision;await apply(data);status("Actualizado · "+new Date(r.pack.savedAt).toLocaleString("es-PE"),"ok")}
async function publish(manual){
if(!connected||role!=="admin")return;if(pushing){queued=true;return}
pushing=true;status("Guardando inventarios cifrados en GitHub...");
try{
 var r=await readRemote(true);
 if(!r.missing&&lastSha&&r.sha!==lastSha&&!manual)throw Error("Hay una nueva versión en GitHub: sincroniza antes de continuar");
 if(!r.missing&&!lastSha&&!manual)throw Error("Hay datos remotos no cargados. Usa Publicar ahora");
 if(manual&&!r.missing&&lastSha!==r.sha&&!confirm("Los datos de GitHub cambiaron. ¿Reemplazarlos con tus registros locales?"))return;
 var pack=await encrypt(JSON.parse(JSON.stringify(state)));
 var payload={message:"Inventarios 3A · guardado cifrado "+new Date().toISOString(),content:encode(JSON.stringify(pack)),branch:"main"};
 if(!r.missing)payload.sha=r.sha;
 var w=await fetch(api,{method:"PUT",headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json","Content-Type":"application/json"},body:JSON.stringify(payload)});
 if(!w.ok){var message="";try{message=(await w.json()).message||""}catch(e){}throw Error("GitHub HTTP "+w.status+" "+message)}
 var result=await w.json();lastSha=result.content&&result.content.sha||null;lastRev=pack.revision;
 status("Datos compartidos guardados · "+new Date().toLocaleTimeString("es-PE"),"ok")
}catch(e){status("NO se subió: "+e.message,"error");alert("Los cambios siguen guardados localmente, pero NO se sincronizaron. "+e.message)}
finally{pushing=false;if(queued){queued=false;setTimeout(()=>publish(false),900)}}
}
window.cloudSyncQueue=function(){if(suppress||!connected||role!=="admin")return;clearTimeout(timer);timer=setTimeout(()=>publish(false),1250)};
function disconnect(){connected=false;role="";secret="";token="";lastSha=null;lastRev="";queued=false;clearInterval(pollTimer);clearTimeout(timer);lockViewer(false);el("cloudPublish").disabled=true;el("cloudDisconnect").disabled=true;status("Modo local · Sin sincronización","warning")}
function init(){
 el("cloudRole").onchange=function(){el("cloudTokenWrap").hidden=el("cloudRole").value!=="admin"};
 el("cloudConnect").onclick=function(){connect().catch(e=>{connected=false;secret="";token="";status("Error: "+e.message,"error")})};
 el("cloudPublish").onclick=function(){publish(true)};
 el("cloudDisconnect").onclick=disconnect;
 document.addEventListener("click",function(e){if(role!=="viewer")return;if(e.target.closest("[data-delete],[data-action-key],[data-start-upload]")){e.preventDefault();e.stopImmediatePropagation();alert("Modo consulta: solo el administrador puede modificar inventarios")}},true);
 status("Modo local · Conecta para compartir","warning")
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();