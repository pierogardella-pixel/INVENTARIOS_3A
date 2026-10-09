/* UCA · Control TVU y TMR, stock y vencimiento · Tiendas 3A */
(function(){
"use strict";
const $u=id=>document.getElementById(id);
let reference=new Map(),referenceStatus="Sin reglas cargadas · Importa TVU/TMR",lastRuleState=null,filter="all",query="",daysWindow=20,selectedSnapshot="current",aisleType="ACTIVO",aisleZone="SECOS_FOOD";
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
function currentSnapshot(){
 if(selectedSnapshot==="current")return state.uca;
 let id=Number(String(selectedSnapshot).replace(/^h/,""));
 return Number.isInteger(id)?state.ucaHistory?.[id]||state.uca:state.uca;
}
function stockRows(){
 const snap=currentSnapshot();
 if(Array.isArray(snap?.rows))return snap.rows;
 const map=new Map();
 for(const r of rowsOf(effective())){if(!r.sku)continue;let k=skuValue(r.sku),v=map.get(k)||{sku:k,product:r.product||"",category:r.category||"",stock:0,expiry:"",received:"",aisle:r.aisle,location:r.location};v.stock+=Math.max(0,Number(r.system)||0);map.set(k,v)}
 return [...map.values()]
}
function qty(v){
 if(v===undefined||v===null||String(v).trim()==="")return null;
 const n=Number(String(v).trim().replace(/\s/g,"").replace(",","."));
 return Number.isFinite(n)&&n>=0?n:null;
}
// "Sin stock" se confirma solo con K = 0 Y L = 0.
// Los campos vacíos no se convierten artificialmente en cero.
function stockBasis(r){
 if(r.stockMode==="wms")return "wms";
 if(r.stockMode==="kl")return "kl";
 // Compatibilidad con archivos WMS UCA cargados en versiones anteriores.
 // En ese reporte J=CANTIDAD, K=VENCIMIENTO y L=ESTADO.
 // Las fechas numéricas de Excel NO representan stock de la columna K.
 const k=qty(r.stockK),l=qty(r.stockL),j=qty(r.stock);
 if(j!==null&&l===null&&(k===null||k===0||(k>=30000&&k<100000&&!!r.expiry)))return "wms";
 return "kl";
}
function stockKind(r){
 const k=qty(r.stockK),l=qty(r.stockL),amount=qty(r.stock);
 if(stockBasis(r)==="wms"){
  // Solo se confirma stock positivo; 0 en J no cumple la condición K=0 y L=0.
  return amount!==null&&amount>0?"stock":"unverified";
 }
 if(k===0&&l===0)return "none";
 if((k!==null&&k>0)||(l!==null&&l>0))return "stock";
 return "unverified";
}
function stockSummary(rows){
 const groups=new Map();
 for(const r of rows){
  const k=String(r.sku||"").trim();if(!k)continue;
  if(!groups.has(k))groups.set(k,[]);
  groups.get(k).push(r);
 }
 let stocked=0,empty=0,unknown=0;
 for(const rr of groups.values()){
  const kinds=rr.map(stockKind);
  if(kinds.includes("stock"))stocked++;
  else if(kinds.every(k=>k==="none"))empty++;
  else unknown++;
 }
 const validated=stocked+empty,total=validated+unknown;
 return {stocked,empty,unknown,validated,total,pStock:validated?100*stocked/validated:0,pEmpty:validated?100*empty/validated:0};
}

function storageType(r){
 const t=normalize(r.storageType||r.locationType||r.type||"").replace(/\s/g,"_").toUpperCase();
 if(["ACTIVO","RESERVA","RESERVA_PISO","DROP_ZONE"].includes(t))return t;
 const loc=String(r.location||"").trim().match(/^(\d{1,2})-\d{1,3}-(\d{2})-\d{2}/);
 const aisle=Number(r.aisle||loc?.[1]),level=Number(loc?.[2]);
 if(!loc||!Number.isFinite(aisle))return "";
 if(aisle>=9&&aisle<=13)return "RESERVA_PISO";
 if(aisle>=1&&aisle<=8&&level===1)return "ACTIVO";
 if(aisle>=1&&aisle<=4&&level>=2&&level<=5)return "RESERVA";
 return "";
}
function stockZone(r){return normalize(r.zone||r.category||"").replace(/\s/g,"_").toUpperCase()}
function aisleLabel(r){
 const raw=String(r.aisle??"").trim()||(String(r.location||"").match(/^(\d{1,2})-/)||[])[1]||"";
 const number=Number(raw);
 return Number.isInteger(number)&&number>=1&&number<=99?String(number).padStart(2,"0"):"";
}
function matchedStorage(type,choice){
 if(choice==="SOLO_RESERVAS")return type==="RESERVA"||type==="RESERVA_PISO";
 return type===choice;
}
function aisleStats(rows,type=aisleType,zone=aisleZone){
 const result=new Map();
 let inferred=0,unknownType=0,otherZones=0;
 // Las barras representan ubicaciones ocupadas únicas por pasillo, no bultos.
 // El porcentaje es la participación de cada pasillo en las ubicaciones
 // filtradas; no implica porcentaje de capacidad de rack.
 for(const r of rows){
  const real=storageType(r),aisle=aisleLabel(r),z=stockZone(r);
  if(!real){unknownType++;continue}
  if(!matchedStorage(real,type)||!aisle)continue;
  if(!result.has(aisle))result.set(aisle,{aisle,locations:new Set(),sku:new Set(),units:0,category:real});
  if(z!==zone){otherZones++;continue}
  const qtyVal=qty(r.stock);
  if(qtyVal===null||qtyVal<=0)continue;
  const location=String(r.location||"").trim().toUpperCase();
  if(!location)continue;
  const d=result.get(aisle);
  d.locations.add(location);
  d.sku.add(skuValue(r.sku));
  d.units+=qtyVal;
  if(!r.storageType&&!r.locationType&&!r.type)inferred++;
 }
 const items=[...result.values()].sort((a,b)=>Number(a.aisle)-Number(b.aisle));
 const total=items.reduce((n,a)=>n+a.locations.size,0);
 return {rows:items.map(a=>({aisle:a.aisle,locations:a.locations.size,sku:a.sku.size,units:a.units,pct:total?100*a.locations.size/total:0})),total,inferred,unknownType,otherZones};
}
function renderAisleChart(){
 const target=$u("ucaAisleBars"),note=$u("ucaAisleInfo"),count=$u("ucaAisleCount");
 if(!target)return;
 const s=aisleStats(stockRows());
 if(count)count.textContent=nfmt(s.total)+" ubicaciones · "+s.rows.length+" pasillos";
 if(!s.total){
  target.innerHTML='<div class="uca-aisle-empty">Sin ubicaciones para estos filtros. Comprueba que el Excel contenga <strong>TIPO, ZONA, PASILLO, UBICACIÓN y CANTIDAD</strong>. Si cargaste una versión anterior, vuelve a importar el mismo archivo UCA para actualizar estos campos.</div>';
 }else{
  target.innerHTML=s.rows.map(r=>{
   const pct=r.pct.toLocaleString("es-PE",{minimumFractionDigits:1,maximumFractionDigits:1});
   const width=Math.max(0,Math.min(100,r.pct)).toFixed(3);
   return '<div class="uca-aisle-row" title="Pasillo '+r.aisle+': '+nfmt(r.locations)+' ubicaciones · '+nfmt(r.sku)+' SKU · '+nfmt(r.units)+' bultos">'
    +'<span class="uca-aisle-label">Pasillo '+r.aisle+'</span>'
    +'<div class="uca-aisle-bar"><span class="uca-aisle-bar-fill" style="width:'+width+'%"></span></div>'
    +'<strong class="uca-aisle-pct">'+pct+'%</strong>'
    +'<small class="uca-aisle-meta">'+nfmt(r.locations)+' UBI · '+nfmt(r.sku)+' SKU</small></div>';
  }).join("");
 }
 const tp=aisleType==="SOLO_RESERVAS"?"RESERVA + RESERVA_PISO":aisleType;
 note.textContent="TIPO: "+tp+" · ZONA: "+aisleZone.replace("_","-")
  +" · Porcentaje = ubicaciones únicas ocupadas del pasillo ÷ "+nfmt(s.total)+" ubicaciones únicas ocupadas del filtro."
  +(s.inferred?" "+nfmt(s.inferred)+" filas con tipo inferido de ubicación; importa de nuevo para validar TIPO.":"");
}

function evaluate(r){
 let t=reference.get(skuValue(r.sku)),left=remaining(r.expiry),stored=r.received?-remaining(r.received):null,alerts=[],kind=stockKind(r);
 if(kind==="stock"){
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
 if(kind==="unverified")alerts.push("STOCK K/L POR VALIDAR");
 const critical=alerts.some(x=>!x.startsWith("SIN ")&&!x.includes("POR VALIDAR")),status=kind==="none"?"none":kind==="unverified"?"unknown":critical?"critical":alerts.length?"unknown":"ok";
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
 const keep=selectedSnapshot;selectedSnapshot="current";const all=getRecords();selectedSnapshot=keep;const stock=all.filter(x=>stockKind(x)==="stock");
 if(!stock.length){box.style.display="none";return}
 const bad=stock.filter(x=>x.status==="critical"),unknown=stock.filter(x=>x.left===null);
 const content=bad.length?"⚠ UCA · "+bad.length+" SKU con incumplimientos TVU/TMR o vencimiento. Revisa los casos.":unknown.length?"◈ UCA · "+unknown.length+" SKU con stock sin fecha de vencimiento. Importa el reporte UCA para verificar TVU/TMR.":"✓ UCA · Los SKU con fechas verificables no presentan alertas de vencimiento o TVU/TMR.";
 box.textContent=content;box.style.display="block";
 box.onclick=()=>selectedView("uca");
}
window.renderUCAHome=renderHome;
function render(){
 let records=getRecords(),summary=stockSummary(records),inStock=records.filter(r=>stockKind(r)==="stock"),zero=records.filter(r=>stockKind(r)==="none"),bad=inStock.filter(r=>r.status==="critical"),near=inStock.filter(r=>r.left!==null&&r.left<=daysWindow),unknown=inStock.filter(r=>r.left===null);
 const unique=records=>new Set(records.map(r=>r.sku)).size;
 const kpi=(title,value,desc,color)=>'<div class="metric"><label>'+html(title)+'</label><div class="value '+color+'">'+nfmt(value)+'</div><small>'+html(desc)+'</small></div>';
 $u("ucaMetrics").innerHTML=kpi("Productos con stock",summary.stocked,"Cantidad WMS (J) o stock K/L positivo","green")+kpi("Productos sin stock",summary.empty,"K = 0 y L = 0 en todas sus filas","red")+kpi("Próximos / vencidos",unique(near),"SKU con fecha y ≤ "+daysWindow+" días","red")+kpi("Alertas críticas",unique(bad),"TMR, vencimiento o estadía","red")+kpi("Sin fecha de vencimiento",unique(unknown),"SKU con cumplimiento no verificable","blue");
 renderAisleChart();
 $u("ucaReference").textContent=referenceStatus;
 const archives=state.ucaHistory||[],picker=$u("ucaHistorySelect");
 if(picker){
  const opts=['<option value="current">Stock más reciente</option>'];
  archives.forEach((v,i)=>opts.push('<option value="h'+i+'">'+html(v.updatedAt?.slice(0,10)||"Fecha")+' · '+html(v.source||"Carga UCA")+'</option>'));
  picker.innerHTML=opts.join("");
  if(![...picker.options].some(o=>o.value===selectedSnapshot))selectedSnapshot="current";
  picker.value=selectedSnapshot;
 }
 const snap=currentSnapshot();
 $u("ucaSource").textContent=snap?.rows?"Archivo UCA · "+snap.source+" · "+new Date(snap.updatedAt).toLocaleString("es-PE")+(selectedSnapshot!=="current"?" · histórico":""):"Último conteo WMS por pasillo · "+latestPerAisle().size+"/8";
 const notices=[];
 if(!currentSnapshot()?.rows)notices.push("Los conteos WMS no incluyen fecha de vencimiento. Para calcular alertas reales, importa un Excel UCA con SKU, Stock y Vencimiento.");
 if(!reference.size)notices.push("Para evaluar TVU/TMR, carga el archivo de reglas en «Importar TVU/TMR». Se guardará cifrado para las computadoras autorizadas.");
 if(bad.length)notices.push("⚠ "+unique(bad)+" SKU con alertas. Revisa los resultados y sus fechas antes de despachar.");
 if(unknown.length)notices.push(unique(unknown)+" SKU con stock no tienen fecha de vencimiento verificable.");
 notices.push("Regla Sin stock: se exige K=0 y L=0 únicamente cuando ambas columnas corresponden a campos numéricos. En UCA del WMS, J=CANTIDAD, K=VENCIMIENTO y L=ESTADO: se toma J como stock; el Excel solo enumera productos registrados, no los que faltan.");
 if((currentSnapshot()?.mode==="global")||(String(currentSnapshot()?.source||"").toUpperCase().includes("STOCK GLOBAL")))notices.push("ATENCIÓN STOCK GLOBAL: K es ASIGNADO y L BLOQUEADO. Que ambos sean 0 NO significa stock físico 0: comprueba STOCK TOTAL (I) y DISPONIBLE (J). El gráfico K/L representa la regla personalizada, no una rotura real de stock.");
 $u("ucaNotice").innerHTML=notices.map(t=>'<p>'+html(t)+'</p>').join("");
 let r=records.filter(x=>(filter==="all"||filter==="stock"&&stockKind(x)==="stock"||filter==="none"&&stockKind(x)==="none"||filter==="near"&&stockKind(x)==="stock"&&x.left!==null&&x.left<=daysWindow||filter==="alert"&&x.status==="critical"||filter==="unknown"&&x.status==="unknown")&&(!query||[x.sku,x.product,x.category,x.aisle,...x.alerts].some(t=>normalize(t).includes(query))));
 let priority={critical:0,unknown:1,ok:2,none:3};
 r.sort((a,b)=>priority[a.status]-priority[b.status]||(a.left??999999)-(b.left??999999));
 $u("ucaCount").textContent=r.length+" registros";
 $u("ucaTable").innerHTML=r.slice(0,500).map(x=>{
   let label={none:"Sin stock",critical:"Alerta",unknown:"Por validar",ok:"Conforme"}[x.status];
   return '<tr><td><b>'+html(x.sku)+'</b><small>'+html(x.product||x.rule?.name||"Nombre no informado")+'</small></td><td class="num">'+(stockBasis(x)==="wms"?nfmt(x.stock)+" (J)":(qty(x.stockK)===null?"—":nfmt(x.stockK))+" / "+(qty(x.stockL)===null?"—":nfmt(x.stockL)))+'</td><td>'+html(x.aisle||x.location||"—")+'</td><td>'+html(x.expiry||"Sin fecha")+'</td><td class="num">'+(x.left===null?"—":x.left+" d")+'</td><td class="num">'+(x.rule?.tvu??"N/A")+'</td><td class="num">'+(x.rule?.tmr??"N/A")+'</td><td class="num">'+(x.rule?.store??"N/A")+'</td><td class="num">'+(x.rule?.max??"N/A")+'</td><td><span class="uca-tag uca-'+x.status+'">'+label+'</span></td><td>'+html(x.alerts.join(" · ")||"—")+'</td></tr>'
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
 // Reconoce por encabezados: WMS UCA, STOCK DETALLE y STOCK GLOBAL.
 // No se presupone que K/L sean cantidades: en UCA son VENCIMIENTO y ESTADO.
 let selected=null,score=-1;
 for(const [name,grid] of Object.entries(grids||{})){
  if(!Array.isArray(grid))continue;
  for(let i=0;i<Math.min(15,grid.length);i++){
   const hs=(grid[i]||[]).map(normalize);
   const hasSku=hs.some(h=>["sku","codigo sku","codigo producto","cod sku","cod producto"].includes(h));
   const hasQuantity=hs.some(h=>["stock","stock total","stock disponible","cantidad","unidades","stock wms","disponible","cantidad disponible","stock global"].includes(h));
   if(!hasSku||!hasQuantity)continue;
   const isUca=hs.includes("sku")&&hs.includes("cantidad")&&hs.includes("vencimiento")&&hs.includes("estado");
   const isDetail=hs.some(h=>h.includes("vencimiento"))&&hs.includes("cantidad")&&hs.includes("estado");
   const isGlobal=hs.includes("stock total")&&hs.includes("asignado")&&hs.includes("bloqueado");
   let priority=isUca?100:isDetail?90:isGlobal?75:30;
   if(normalize(name)==="uca")priority+=15;
   if(priority>score){score=priority;selected={name,grid,index:i,isUca,isDetail,isGlobal}}
  }
 }
 if(!selected)throw Error("No encontré una hoja WMS con SKU y CANTIDAD/STOCK. Revisa los encabezados del Excel.");
 const {name,grid,index,isUca,isDetail,isGlobal}=selected;
 const head=(grid[index]||[]).map(x=>String(x??""));
 const normalizeRow=row=>Object.fromEntries(head.map((k,i)=>[k,row?.[i]]));
 const result=[];let discarded=0,invalid=0;
 for(const raw of grid.slice(index+1)){
  if(!raw||!raw.some(v=>v!==null&&v!==undefined&&v!==""))continue;
  const obj=normalizeRow(raw);
  const sku=skuValue(get(obj,["SKU","Código SKU","Código producto","COD. PRODUCTO","Cod SKU"]));
  if(!sku){discarded++;continue}
  const val=get(obj,["Stock total","Stock disponible","Stock WMS","Cantidad disponible","Cantidad","Unidades","Stock global","Stock","Disponible"]);
  const amount=qty(val);
  const klHeaderNames=[head[10],head[11]].map(normalize);
  const numericKLPair=grid.slice(index+1,index+25).some(row=>qty(row?.[10])!==null&&qty(row?.[11])!==null);
  const kl=!(isUca||isDetail)&&(isGlobal||numericKLPair||klHeaderNames.every(h=>/stock|cantidad|existencia|disponible|asignado|bloqueado/.test(h)));
  const stockK=kl?qty(raw[10]):null,stockL=kl?qty(raw[11]):null;
  if(amount===null&&stockK===null&&stockL===null){invalid++;continue}
  const stockMode=kl?"kl":"wms";
  result.push({
   sku,stock:amount??Math.max(stockK??0,stockL??0),stockK,stockL,stockMode,
   product:String(get(obj,["Producto","NOM. PRODUCTO","Nombre producto","Descripción","Descripcion","Nombre"])||""),
   category:String(get(obj,["Categoría","Categoria","Familia","Zona"])||""),
   expiry:dateValue(get(obj,["Vencimiento","Fecha vencimiento","F. VENCIMIENTO","Fecha de vencimiento","Fecha caducidad","Caducidad","FV"])),
   received:dateValue(get(obj,["Fecha ingreso","Fecha de ingreso","Ingreso a almacen","Ingreso a almacén","Fecha recepción","Ingreso"])),
   aisle:String(get(obj,["Pasillo","Aisle"])||""),
   location:String(get(obj,["Ubicación","Ubicacion","Posicion"])||""),
   zone:String(get(obj,["Zona","Zona almacén","Área","Area"])||""),
   storageType:String(get(obj,["TIPO","Tipo ubicación","Tipo ubic.","Tipo almacenaje"])||"")
  });
 }
 if(!result.length)throw Error("El Excel no contiene productos con cantidades numéricas válidas.");
 // Conservar lotes y ubicaciones; sumar únicamente filas de igual SKU, fecha y posición.
 const rows=new Map();
 for(const r of result){
  const key=[r.sku,r.expiry,r.received,r.aisle,r.location,r.stockMode,r.storageType,r.zone].join("|");
  let old=rows.get(key);
  if(old){
   old.stock+=r.stock;
   old.stockK=old.stockK!==null&&r.stockK!==null?old.stockK+r.stockK:null;
   old.stockL=old.stockL!==null&&r.stockL!==null?old.stockL+r.stockL:null;
  }else rows.set(key,r);
 }
 return {rows:[...rows.values()],discarded:discarded+invalid,source:name,mode:isGlobal?"global":isUca?"uca":isDetail?"detalle":"other"};
}
async function importFile(file){
 let status=$u("ucaUploadStatus");status.textContent="Importando "+file.name+"…";
 try{let grids=/\.csv$/i.test(file.name)?csvRead(await file.text()):await xlsxRead(file);
 let x=extract(grids);if(state.uca?.rows?.length&&!confirm("¿Guardar una nueva carga UCA y conservar la anterior en el historial?"))return;
 if(state.uca?.rows?.length){state.ucaHistory=[...(state.ucaHistory||[]),state.uca]}selectedSnapshot="current";state.uca={source:file.name,sheet:x.source,mode:x.mode,updatedAt:new Date().toISOString(),rows:x.rows};
 let saved=await persist();if(!saved)throw Error("El navegador no pudo guardar el inventario.");
 status.textContent="✓ "+x.rows.length+" registros ("+x.source+") leídos; "+x.discarded+" descartados. Stock detectado: "+(x.mode==="uca"?"CANTIDAD (J)":x.mode==="detalle"?"CANTIDAD":"campos del reporte")+". Revisa la sincronización en DATOS.";
 render();
 }catch(e){status.textContent="⚠ "+e.message}
}
function init(){
 if(!$u("ucaUpload"))return;
 $u("ucaUpload").onclick=()=>$u("ucaFile").click();
 $u("ucaHistorySelect").onchange=e=>{selectedSnapshot=e.target.value;render()};
 $u("ucaTypeFilter").onchange=e=>{aisleType=e.target.value;renderAisleChart()};
 $u("ucaZoneFilter").onchange=e=>{aisleZone=e.target.value;renderAisleChart()};
 $u("ucaRulesUpload").onclick=()=>$u("ucaRulesFile").click();
 $u("ucaRulesFile").onchange=async e=>{let f=e.target.files?.[0];if(!f)return;e.target.value="";if(window.inventoryCloudRole==="viewer")return alert("Modo consulta: no puedes cambiar reglas.");await importTVUTMR(f)};
 $u("ucaFile").onchange=async e=>{let file=e.target.files?.[0];if(!file)return;e.target.value="";if(window.inventoryCloudRole==="viewer")return alert("Modo consulta: no se pueden cargar inventarios.");await importFile(file)};
 $u("ucaSearch").oninput=e=>{query=normalize(e.target.value);render()};
 $u("ucaFilter").onchange=e=>{filter=e.target.value;render()};
 $u("ucaDays").onchange=e=>{daysWindow=Math.max(1,Math.min(90,Number(e.target.value)||20));e.target.value=daysWindow;render()};
 $u("ucaExport").onclick=()=>{let rows=getRecords().map(x=>({SKU:x.sku,Producto:x.product,Stock_K:x.stockK??"",Stock_L:x.stockL??"",Estado_stock:stockKind(x),Stock_WMS:x.stock??"",Stock_fuente:stockBasis(x),Pasillo:x.aisle,Vencimiento:x.expiry,Dias_para_vencer:x.left??"",TMR_CEDI:x.rule?.tmr??"",TMR_Tienda:x.rule?.store??"",Estado:x.status,Alertas:x.alerts.join(" | ")}));if(rows.length)download("UCA_TVU_TMR_"+new Date().toISOString().slice(0,10)+".csv",csv(rows));else alert("No hay registros UCA para exportar")};
 rules();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();