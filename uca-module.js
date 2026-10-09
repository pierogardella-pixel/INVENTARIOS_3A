/* UCA · Control TVU y TMR, stock y vencimiento · Tiendas 3A */
(function(){
"use strict";
const $u=id=>document.getElementById(id);
let reference=new Map(),referenceStatus="Sin reglas cargadas · Importa TVU/TMR",lastRuleState=null,filter="all",query="",daysWindow=20;
const html=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const normalize=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const skuValue=s=>String(s??"").trim().replace(/\.0+$/,"");
const nfmt=n=>Number(n||0).toLocaleString("es-PE",{maximumFractionDigits:0});
const dateToIso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
function dateValue(v){
 if(v==null||v==="")return "";
 if(typeof v==="number"){return v>=30000&&v<100000?new Date(Date.UTC(1899,11,30)+Math.trunc(v)*86400000).toISOString().slice(0,10):""}
 const t=String(v).trim(),m=t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/),d=t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
 if(m){let x=new Date(+m[1],+m[2]-1,+m[3]);return x.getFullYear()===+m[1]&&x.getMonth()===+m[2]-1&&x.getDate()===+m[3]?dateToIso(x):""}
 if(d){let y=+d[3];if(y<100)y+=2000;let x=new Date(y,+d[2]-1,+d[1]);return x.getFullYear()===y&&x.getMonth()===+d[2]-1&&x.getDate()===+d[1]?dateToIso(x):""}
 return "";
}
function remaining(iso){if(!iso)return null;let t=new Date();let n=Date.UTC(t.getFullYear(),t.getMonth(),t.getDate());return Math.round((Date.parse(iso+"T00:00:00Z")-n)/86400000)}
function stockRows(){
 if(Array.isArray(state.uca?.rows))return state.uca.rows;
 const map=new Map();
 for(const r of rowsOf(effective())){if(!r.sku)continue;let k=skuValue(r.sku),v=map.get(k)||{sku:k,product:r.product||"",category:r.category||"",stock:0,expiry:"",received:"",aisle:r.aisle,location:r.location};v.stock+=Math.max(0,Number(r.system)||0);map.set(k,v)}
 return [...map.values()]
}
function evaluate(r){
 let t=reference.get(skuValue(r.sku)),left=remaining(r.expiry),stored=r.received?-remaining(r.received):null,alerts=[];
 if(Number(r.stock)>0){
  if(left!==null){
   if(left<0)alerts.push("VENCIDO");
   else if(left<=daysWindow)alerts.push("PRÓXIMO A VENCER ("+left+" días)");
   if(t&&Number.isFinite(t.tmr)&&left<t.tmr)alerts.push("TMR CEDI no cumple · mínimo "+t.tmr+" días");
   if(t&&Number.isFinite(t.store)&&left<t.store)alerts.push("TMR TIENDA no cumple · mínimo "+t.store+" días");
   if(t?.exception){let [tv,ex]=t.exception;let n=typeof ex==="number"?ex:typeof ex==="string"&&ex.includes("% TVU")?(Number(tv)||Number(t.tvu)||0)*parseFloat(ex)/100:null;if(n!==null&&left<n)alerts.push("Excepción no cumple · mínimo "+n+" días")}
  }else alerts.push("SIN FECHA DE VENCIMIENTO");
  if(t&&t.max>0&&stored!==null&&stored>t.max)alerts.push("TIEMPO MÁX. EN ALMACÉN · "+t.max+" días");
  if(!t)alerts.push("SIN REGLA TVU/TMR");
 }
 const critical=alerts.some(x=>!x.startsWith("SIN ")),status=Number(r.stock)<=0?"none":critical?"critical":alerts.length?"unknown":"ok";
 return {...r,rule:t,left,alerts,status}
}
function refreshRuleState(){
 if(lastRuleState===state.tvuRules)return;
 lastRuleState=state.tvuRules;
 reference.clear();
 for(const r of state.tvuRules?.rows||[]){
   const v={sku:skuValue(r[0]),name:r[1]||"",category:r[2]||"",tvu:r[3],tmr:r[4],store:r[5],max:r[6],active:r[7],exception:r[8]};
   if(v.sku)reference.set(v.sku,v)
 }
 referenceStatus=reference.size?reference.size+" productos TVU/TMR · "+(state.tvuRules.source||"Reglas cargadas"):"Sin reglas TVU/TMR: carga el Excel de referencia una vez";
}
function getRecords(){refreshRuleState();return stockRows().map(evaluate)}
function renderHome(){
 const box=$u("ucaHomeAlerts");if(!box)return;
 const all=getRecords(),stock=all.filter(x=>x.stock>0);
 if(!stock.length){box.style.display="none";return}
 const bad=stock.filter(x=>x.status==="critical"),unknown=stock.filter(x=>x.left===null);
 const content=bad.length?"⚠ UCA · "+bad.length+" SKU con incumplimientos TVU/TMR o vencimiento. Revisa los casos.":unknown.length?"◈ UCA · "+unknown.length+" SKU con stock sin fecha de vencimiento. Importa el reporte UCA para verificar TVU/TMR.":"✓ UCA · Los SKU con fechas verificables no presentan alertas de vencimiento o TVU/TMR.";
 box.textContent=content;box.style.display="block";
 box.onclick=()=>selectedView("uca");
}
window.renderUCAHome=renderHome;
function render(){
 let records=getRecords(),inStock=records.filter(r=>r.stock>0),zero=records.filter(r=>r.stock<=0),bad=inStock.filter(r=>r.status==="critical"),near=inStock.filter(r=>r.left!==null&&r.left<=daysWindow),unknown=inStock.filter(r=>r.left===null);
 const unique=records=>new Set(records.map(r=>r.sku)).size;
 const kpi=(title,value,desc,color)=>'<div class="metric"><label>'+html(title)+'</label><div class="value '+color+'">'+nfmt(value)+'</div><small>'+html(desc)+'</small></div>';
 $u("ucaMetrics").innerHTML=kpi("Productos con stock",unique(inStock),"SKU con cantidad positiva","green")+kpi("Productos sin stock",unique(zero),"SKU con cantidad cero reportada","red")+kpi("Próximos / vencidos",unique(near),"SKU con fecha y ≤ "+daysWindow+" días","red")+kpi("Alertas críticas",unique(bad),"TMR, vencimiento o estadía","red")+kpi("Sin fecha de vencimiento",unique(unknown),"SKU con cumplimiento no verificable","blue");
 $u("ucaReference").textContent=referenceStatus;
 $u("ucaSource").textContent=state.uca?.rows?"Archivo UCA · "+state.uca.source+" · "+new Date(state.uca.updatedAt).toLocaleString("es-PE"):"Último conteo WMS por pasillo · "+latestPerAisle().size+"/8";
 const notices=[];
 if(!state.uca?.rows)notices.push("Los conteos WMS no incluyen fecha de vencimiento. Para calcular alertas reales, importa un Excel UCA con SKU, Stock y Vencimiento.");
 if(!reference.size)notices.push("Para evaluar TVU/TMR, carga el archivo de reglas en «Importar TVU/TMR». Se guardará cifrado para las computadoras autorizadas.");
 if(bad.length)notices.push("⚠ "+unique(bad)+" SKU con alertas. Revisa los resultados y sus fechas antes de despachar.");
 if(unknown.length)notices.push(unique(unknown)+" SKU con stock no tienen fecha de vencimiento verificable.");
 notices.push("La ausencia de un SKU en los archivos no equivale a stock cero. Solo se clasifica «Sin stock» cuando se reporta cantidad 0.");
 $u("ucaNotice").innerHTML=notices.map(t=>'<p>'+html(t)+'</p>').join("");
 let r=records.filter(x=>(filter==="all"||filter==="stock"&&x.stock>0||filter==="none"&&x.stock<=0||filter==="near"&&x.stock>0&&x.left!==null&&x.left<=daysWindow||filter==="alert"&&x.status==="critical"||filter==="unknown"&&x.status==="unknown")&&(!query||[x.sku,x.product,x.category,x.aisle,...x.alerts].some(t=>normalize(t).includes(query))));
 let priority={critical:0,unknown:1,ok:2,none:3};
 r.sort((a,b)=>priority[a.status]-priority[b.status]||(a.left??999999)-(b.left??999999));
 $u("ucaCount").textContent=r.length+" registros";
 $u("ucaTable").innerHTML=r.slice(0,500).map(x=>{
   let label={none:"Sin stock",critical:"Alerta",unknown:"Por validar",ok:"Conforme"}[x.status];
   return '<tr><td><b>'+html(x.sku)+'</b><small>'+html(x.product||x.rule?.name||"Nombre no informado")+'</small></td><td class="num">'+nfmt(x.stock)+'</td><td>'+html(x.aisle||x.location||"—")+'</td><td>'+html(x.expiry||"Sin fecha")+'</td><td class="num">'+(x.left===null?"—":x.left+" d")+'</td><td class="num">'+(x.rule?.tvu??"N/A")+'</td><td class="num">'+(x.rule?.tmr??"N/A")+'</td><td class="num">'+(x.rule?.store??"N/A")+'</td><td class="num">'+(x.rule?.max??"N/A")+'</td><td><span class="uca-tag uca-'+x.status+'">'+label+'</span></td><td>'+html(x.alerts.join(" · ")||"—")+'</td></tr>'
 }).join("")||'<tr><td colspan="11" class="empty">No hay datos para este filtro. Carga un inventario UCA.</td></tr>';
 $u("ucaLimit").textContent=r.length>500?"Mostrando 500 filas: utiliza filtros o exportación para consultar todas.":"";
 renderHome();
}
window.renderUCA=render;
function rules(){refreshRuleState();if(document.querySelector("#view-uca.active"))render();else renderHome()}
function referenceExcel(grids){
 let grid=Object.entries(grids||{}).find(([name,rows])=>normalize(name)==="tmrs"||rows?.some(r=>Array.isArray(r)&&r.map(normalize).includes("tvu")&&r.map(normalize).includes("sku")))?.[1];
 if(!grid)throw Error("No se encontró la hoja TMRs de TVU/TMR.");
 let headerIndex=grid.findIndex(r=>Array.isArray(r)&&r.map(normalize).includes("tvu")&&r.map(normalize).includes("sku"));
 if(headerIndex<0)throw Error("Falta el encabezado SKU y TVU.");
 let head=grid[headerIndex].map(normalize),column=name=>head.indexOf(normalize(name)),indexSku=column("SKU"),indexTVU=column("TVU"),indexTMR=column("TMR");
 if(indexSku<0||indexTVU<0||indexTMR<0)throw Error("El archivo debe incluir SKU, TVU y TMR.");
 const numberOrNull=v=>v!==""&&v!=null&&Number.isFinite(Number(v))?Number(v):null;
 let exceptions=new Map();
 for(let r of grid){let id=r?.[12];if(id!=null&&/^\d{5,}$/.test(String(id).trim()))exceptions.set(skuValue(id),[numberOrNull(r[14])??r[14],numberOrNull(r[15])??r[15]])}
 let output=[];
 for(let r of grid.slice(headerIndex+1)){
  let sku=skuValue(r?.[indexSku]);if(!/^\d{5,}$/.test(sku))continue;
  output.push([sku,String(r?.[column("Nombre")]||""),String(r?.[column("Categoría")]||""),numberOrNull(r[indexTVU]),numberOrNull(r[indexTMR]),numberOrNull(r[column("TMR TIENDA")]),numberOrNull(r[column("DIAS MAX ALMACEN")]),String(r?.[column("Activo / Inactivo")]||""),exceptions.get(sku)||null])
 }
 if(output.length<50)throw Error("Solo se reconocieron "+output.length+" SKU. Comprueba que sea el Excel TVU/TMR correcto.");
 return output;
}
async function importTVUTMR(file){
 const label=$u("ucaUploadStatus");label.textContent="Leyendo referencia TVU/TMR…";
 try{
  let rows=referenceExcel(await xlsxRead(file));
  if(state.tvuRules?.rows?.length&&!confirm("¿Actualizar la referencia TVU/TMR actual con este Excel?"))return;
  state.tvuRules={source:file.name,updatedAt:new Date().toISOString(),rows};
  let saved=await persist();if(!saved)throw Error("No se pudieron guardar las reglas.");
  lastRuleState=null;rules();label.textContent="✓ "+rows.length+" SKU con reglas TVU/TMR · guardados. Revisa en DATOS la sincronización con Google Sheets.";
 }catch(e){label.textContent="⚠ "+e.message}
}
function get(obj,aliases){
 const keys=Object.keys(obj);for(let a of aliases){let k=keys.find(x=>normalize(x)===normalize(a));if(k)return obj[k]}
 return undefined
}
function extract(grids){
 let chosen;
 for(let [name,grid] of Object.entries(grids||{})){
  if(!Array.isArray(grid))continue;
  for(let i=0;i<Math.min(12,grid.length);i++){
   let header=(grid[i]||[]).map(normalize);
   if(header.some(h=>h==="sku"||h==="codigo sku"||h==="codigo producto")&&header.some(h=>["stock","cantidad","unidades","stock wms","stock disponible","cantidad disponible"].includes(h))){chosen={name,grid,start:i};break}
  }if(chosen)break
 }
 if(!chosen)throw Error("El Excel necesita columnas SKU y Stock o Cantidad.");
 let head=chosen.grid[chosen.start].map(v=>String(v??"")),result=[],discarded=0;
 for(let raw of chosen.grid.slice(chosen.start+1)){
  let obj=Object.fromEntries(head.map((k,i)=>[k,raw?.[i]]));
  let sku=skuValue(get(obj,["SKU","Código SKU","Código producto"]));
  let val=get(obj,["Stock","Stock disponible","Stock WMS","Cantidad disponible","Cantidad","Unidades"]);
  if(!sku||val===undefined||val===null||val===""){discarded++;continue}
  let stock=Number(String(val).replace(",","."));
  if(!Number.isFinite(stock)||stock<0){discarded++;continue}
  result.push({sku,stock,product:String(get(obj,["Producto","Nombre producto","Descripción","Descripcion","Nombre"])||""),category:String(get(obj,["Categoría","Categoria","Familia"])||""),
   expiry:dateValue(get(obj,["Vencimiento","Fecha vencimiento","Fecha de vencimiento","Fecha caducidad","Caducidad","F. Vencimiento","FV"])),
   received:dateValue(get(obj,["Fecha ingreso","Fecha de ingreso","Fecha recepción","Ingreso"])),
   aisle:String(get(obj,["Pasillo","Aisle"])||""),location:String(get(obj,["Ubicación","Ubicacion"])||"")});
 }
 if(!result.length)throw Error("No se encontraron filas válidas con SKU y stock.");
 const map=new Map();for(let r of result){let key=[r.sku,r.expiry,r.received,r.aisle,r.location].join("|"),old=map.get(key);if(old)old.stock+=r.stock;else map.set(key,r)}
 return {rows:[...map.values()],discarded};
}
async function importFile(file){
 let status=$u("ucaUploadStatus");status.textContent="Importando "+file.name+"…";
 try{let grids=/\.csv$/i.test(file.name)?csvRead(await file.text()):await xlsxRead(file);
 let x=extract(grids);if(state.uca?.rows?.length&&!confirm("Reemplazar el último stock UCA cargado (el histórico de conteos WMS no se borra)?"))return;
 state.uca={source:file.name,updatedAt:new Date().toISOString(),rows:x.rows};
 let saved=await persist();if(!saved)throw Error("El navegador no pudo guardar el inventario.");
 status.textContent="✓ "+x.rows.length+" registros UCA guardados · "+x.discarded+" filas descartadas. Revisa sincronización en DATOS.";
 render();
 }catch(e){status.textContent="⚠ "+e.message}
}
function init(){
 if(!$u("ucaUpload"))return;
 $u("ucaUpload").onclick=()=>$u("ucaFile").click();
 $u("ucaRulesUpload").onclick=()=>$u("ucaRulesFile").click();
 $u("ucaRulesFile").onchange=async e=>{let f=e.target.files?.[0];if(!f)return;e.target.value="";if(window.inventoryCloudRole==="viewer")return alert("Modo consulta: no puedes cambiar reglas.");await importTVUTMR(f)};
 $u("ucaFile").onchange=async e=>{let file=e.target.files?.[0];if(!file)return;e.target.value="";if(window.inventoryCloudRole==="viewer")return alert("Modo consulta: no se pueden cargar inventarios.");await importFile(file)};
 $u("ucaSearch").oninput=e=>{query=normalize(e.target.value);render()};
 $u("ucaFilter").onchange=e=>{filter=e.target.value;render()};
 $u("ucaDays").onchange=e=>{daysWindow=Math.max(1,Math.min(90,Number(e.target.value)||20));e.target.value=daysWindow;render()};
 $u("ucaExport").onclick=()=>{let rows=getRecords().map(x=>({SKU:x.sku,Producto:x.product,Stock:x.stock,Pasillo:x.aisle,Vencimiento:x.expiry,Dias_para_vencer:x.left??"",TMR_CEDI:x.rule?.tmr??"",TMR_Tienda:x.rule?.store??"",Estado:x.status,Alertas:x.alerts.join(" | ")}));if(rows.length)download("UCA_TVU_TMR_"+new Date().toISOString().slice(0,10)+".csv",csv(rows));else alert("No hay registros UCA para exportar")};
 rules();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();