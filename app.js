const DB_NAME="levantamiento_ti_db";
const DB_VERSION=1;
const STORE="equipos";
const SETTINGS_KEY="levantamiento_ti_settings_v11";

const DEFAULTS={
  sucursales:["Dalcahue","Ilque","Quellón"],
  descripciones:["PC","Notebook","All-in-One","Mini-PC","Servidor","Otro"],
  sistemas:["W10","W10 LTSC","W11","Windows Server 2016","Windows Server 2019","Windows Server 2022","Otro"],
  estados:["Operativo","Backup","Fuera de Servicio"]
};

const $=id=>document.getElementById(id);
const clone=o=>JSON.parse(JSON.stringify(o));

let settings=loadSettings();
let db;
let selectedPhoto=null;
let existingPhoto=null;
let installEvent=null;

function loadSettings(){
  try{
    const p=JSON.parse(localStorage.getItem(SETTINGS_KEY)||"null");
    return p?{...DEFAULTS,...p}:clone(DEFAULTS);
  }catch{return clone(DEFAULTS)}
}
function saveSettings(){localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings))}

function openDB(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,DB_VERSION);
    r.onupgradeneeded=()=>{
      const d=r.result;
      if(!d.objectStoreNames.contains(STORE)){
        const s=d.createObjectStore(STORE,{keyPath:"id",autoIncrement:true});
        s.createIndex("createdAt","createdAt");
      }
    };
    r.onsuccess=()=>{db=r.result;resolve()};
    r.onerror=()=>reject(r.error);
  })
}
function store(mode="readonly"){return db.transaction(STORE,mode).objectStore(STORE)}
function allRecords(){return new Promise((res,rej)=>{const r=store().getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
function getRecord(id){return new Promise((res,rej)=>{const r=store().get(Number(id));r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function addRecord(x){return new Promise((res,rej)=>{const r=store("readwrite").add(x);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function putRecord(x){return new Promise((res,rej)=>{const r=store("readwrite").put(x);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function removeRecord(id){return new Promise((res,rej)=>{const r=store("readwrite").delete(Number(id));r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function clearRecords(){return new Promise((res,rej)=>{const r=store("readwrite").clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}

function toast(msg){const e=$("toast");e.textContent=msg;e.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("show"),2200)}
function esc(v=""){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function dateFmt(v){try{return new Intl.DateTimeFormat("es-CL",{dateStyle:"short",timeStyle:"short"}).format(new Date(v))}catch{return v||""}}
function dateStamp(){const d=new Date(),p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`}
function normalizeStatus(v=""){return String(v||"").trim().toLowerCase()}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}

function fillSelect(id,items,selected=""){
  const s=$(id);s.innerHTML="";
  items.forEach(x=>{const o=document.createElement("option");o.value=x;o.textContent=x;s.appendChild(o)});
  if(selected&&items.includes(selected))s.value=selected;
}

function renderFormSelects(previous={}){
  fillSelect("sucursal",settings.sucursales,previous.sucursal||"");
  fillSelect("descripcion",settings.descripciones,previous.descripcion||"");
  fillSelect("sistemaOperativo",settings.sistemas,previous.sistemaOperativo||"");
  fillSelect("estado",settings.estados,previous.estado||settings.estados[0]||"");
  fillSelect("filterSucursal",["",...settings.sucursales],$("filterSucursal").value||"");
  $("filterSucursal").options[0].textContent="Todas las sucursales";
  fillSelect("filterEstado",["",...settings.estados],$("filterEstado").value||"");
  $("filterEstado").options[0].textContent="Todos los estados";
}

function clearForm(keepSucursal=true){
  const current=keepSucursal?$("sucursal").value:"";
  $("equipmentForm").reset();
  $("recordId").value="";
  $("formTitle").textContent="Registrar equipo";
  $("cancelEdit").classList.add("hidden");
  selectedPhoto=null;existingPhoto=null;
  $("photoPreview").src="";$("photoPreviewWrap").classList.add("hidden");
  renderFormSelects({sucursal:current,estado:settings.estados[0]||""});
  if(current&&settings.sucursales.includes(current))$("sucursal").value=current;
  $("nombreDispositivo").focus();
}

function readForm(){
  return {
    sucursal:$("sucursal").value,
    descripcion:$("descripcion").value,
    idDispositivo:$("idDispositivo").value.trim(),
    nombreDispositivo:$("nombreDispositivo").value.trim().toUpperCase(),
    ubicacionCargo:$("ubicacionCargo").value.trim(),
    producto:$("producto").value.trim(),
    sistemaOperativo:$("sistemaOperativo").value,
    ram:$("ram").value.trim(),
    discoDuro:$("discoDuro").value.trim(),
    contrasenaInicio:$("contrasenaInicio").value,
    usuarioAdmin:$("usuarioAdmin").value.trim(),
    contrasenaAdmin:$("contrasenaAdmin").value,
    estado:$("estado").value
  }
}

function showView(name){
  document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(x=>x.classList.remove("active"));
  $(`view-${name}`).classList.add("active");
  document.querySelector(`.nav-btn[data-view="${name}"]`).classList.add("active");
  if(name==="inventario"){renderRecords();updateSummary()}
}

document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));

$("equipmentForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const values=readForm();
  if(!values.sucursal||!values.descripcion||!values.nombreDispositivo){toast("Completa los campos obligatorios.");return}
  const now=new Date().toISOString();
  const id=$("recordId").value?Number($("recordId").value):null;
  const record={...values,photoBlob:selectedPhoto||existingPhoto||null,updatedAt:now};

  try{
    if(id){const old=await getRecord(id);record.id=id;record.createdAt=old.createdAt||now;await putRecord(record);toast("Equipo actualizado.")}
    else{record.createdAt=now;await addRecord(record);toast("Equipo guardado.")}
    const branch=values.sucursal;
    clearForm(true);
    if(settings.sucursales.includes(branch))$("sucursal").value=branch;
    await updateSummary();
  }catch(err){console.error(err);toast("No se pudo guardar el registro.")}
});

$("cancelEdit").addEventListener("click",()=>clearForm(true));

$("photoInput").addEventListener("change",()=>{
  const f=$("photoInput").files?.[0];if(!f)return;
  selectedPhoto=f;existingPhoto=null;
  $("photoPreview").src=URL.createObjectURL(f);
  $("photoPreviewWrap").classList.remove("hidden");
});
$("removePhoto").addEventListener("click",()=>{
  selectedPhoto=null;existingPhoto=null;$("photoInput").value="";
  $("photoPreview").src="";$("photoPreviewWrap").classList.add("hidden");
});

async function editRecord(id){
  const r=await getRecord(id);if(!r)return;
  $("recordId").value=r.id;$("formTitle").textContent=`Editar: ${r.nombreDispositivo}`;$("cancelEdit").classList.remove("hidden");
  $("sucursal").value=r.sucursal;$("descripcion").value=r.descripcion;$("idDispositivo").value=r.idDispositivo||"";
  $("nombreDispositivo").value=r.nombreDispositivo||"";$("ubicacionCargo").value=r.ubicacionCargo||"";
  $("producto").value=r.producto||"";$("sistemaOperativo").value=r.sistemaOperativo||"";
  $("ram").value=r.ram||"";$("discoDuro").value=r.discoDuro||"";
  $("contrasenaInicio").value=r.contrasenaInicio||"";$("usuarioAdmin").value=r.usuarioAdmin||"";
  $("contrasenaAdmin").value=r.contrasenaAdmin||"";$("estado").value=r.estado||"";
  selectedPhoto=null;existingPhoto=r.photoBlob||null;
  if(existingPhoto){$("photoPreview").src=URL.createObjectURL(existingPhoto);$("photoPreviewWrap").classList.remove("hidden")}
  showView("registro");scrollTo({top:0,behavior:"smooth"})
}

async function renderRecords(){
  const all=await allRecords();
  const term=$("search").value.trim().toLowerCase(),branch=$("filterSucursal").value,status=$("filterEstado").value;
  const filtered=all.filter(r=>{
    const text=Object.values(r).filter(v=>typeof v==="string").join(" ").toLowerCase();
    return(!term||text.includes(term))&&(!branch||r.sucursal===branch)&&(!status||r.estado===status)
  }).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
  $("inventoryCount").textContent=`${all.length} ${all.length===1?"equipo":"equipos"}`;
  if(!filtered.length){$("records").innerHTML=`<div class="empty">No hay registros que coincidan con los filtros.</div>`;return}
  const wrap=$("records");wrap.innerHTML="";
  filtered.forEach(r=>{
    const el=document.createElement("article");el.className="record";
    const statusNorm=normalizeStatus(r.estado);
    el.innerHTML=`
      <div>
        <h3>${esc(r.nombreDispositivo)} <span class="status ${statusNorm==="operativo"?"ok":"review"}">${esc(r.estado||"")}</span></h3>
        <div class="record-meta">
          ${esc(r.sucursal)} · ${esc(r.ubicacionCargo||"Sin ubicación")}<br>
          ${esc(r.descripcion)} · ${esc(r.producto||"Sin modelo")}<br>
          <dl>
            <dt>ID</dt><dd>${esc(r.idDispositivo||"—")}</dd>
            <dt>Sistema</dt><dd>${esc(r.sistemaOperativo||"—")}</dd>
            <dt>RAM</dt><dd>${esc(r.ram||"—")}</dd>
            <dt>Disco</dt><dd>${esc(r.discoDuro||"—")}</dd>
            <dt>Admin</dt><dd>${esc(r.usuarioAdmin||"—")}</dd>
          </dl>
          ${r.contrasenaInicio||r.contrasenaAdmin?"<strong>Credenciales registradas</strong>":""}<br>
          Actualizado: ${dateFmt(r.updatedAt)}
        </div>
      </div>
      <div class="record-actions">
        <button class="small-btn" data-action="edit" data-id="${r.id}" type="button">Editar</button>
        <button class="small-btn danger" data-action="delete" data-id="${r.id}" type="button">Eliminar</button>
      </div>`;
    if(r.photoBlob){
      const img=document.createElement("img");img.className="record-photo";img.src=URL.createObjectURL(r.photoBlob);img.alt="Fotografía";img.dataset.action="photo";img.dataset.id=r.id;el.querySelector("div").appendChild(img)
    }
    wrap.appendChild(el)
  })
}

$("records").addEventListener("click",async e=>{
  const b=e.target.closest("[data-action]");if(!b)return;
  const id=Number(b.dataset.id),action=b.dataset.action;
  if(action==="edit")return editRecord(id);
  if(action==="photo"){const r=await getRecord(id);if(r?.photoBlob){$("modalTitle").textContent=r.nombreDispositivo;$("modalImage").src=URL.createObjectURL(r.photoBlob);$("modal").classList.remove("hidden")}return}
  if(action==="delete"){
    const r=await getRecord(id);if(!r)return;
    if(!confirm(`¿Eliminar ${r.nombreDispositivo}?`))return;
    await removeRecord(id);await renderRecords();await updateSummary();toast("Registro eliminado.")
  }
});
$("search").addEventListener("input",renderRecords);
$("filterSucursal").addEventListener("change",renderRecords);
$("filterEstado").addEventListener("change",renderRecords);

async function updateSummary(){
  const all=await allRecords();
  const ok=all.filter(r=>normalizeStatus(r.estado)==="operativo").length;
  $("totalCount").textContent=all.length;$("okCount").textContent=ok;$("reviewCount").textContent=all.length-ok;
}

function settingList(containerId, key){
  const wrap=$(containerId);wrap.innerHTML="";
  settings[key].forEach((value,i)=>{
    const div=document.createElement("div");div.className="setting";
    div.innerHTML=`<div><strong>${esc(value)}</strong></div><button type="button" data-list="${key}" data-index="${i}">Eliminar</button>`;
    wrap.appendChild(div)
  })
}
function renderSettings(){
  settingList("branchList","sucursales");settingList("descList","descripciones");settingList("osList","sistemas");settingList("statusList","estados");renderFormSelects({sucursal:$("sucursal").value,estado:$("estado").value})
}
document.querySelectorAll("#branchForm,#descForm,#osForm,#statusForm").forEach(form=>{
  form.addEventListener("submit",e=>{
    e.preventDefault();
    const map={branchForm:["sucursales","newBranch"],descForm:["descripciones","newDesc"],osForm:["sistemas","newOs"],statusForm:["estados","newStatus"]};
    const [key,input]=map[form.id];const value=$(input).value.trim();if(!value)return;
    if(!settings[key].some(x=>x.toLowerCase()===value.toLowerCase()))settings[key].push(value);
    saveSettings();$(input).value="";renderSettings();toast("Elemento agregado.")
  })
});
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-list]");if(!b)return;
  const key=b.dataset.list,i=Number(b.dataset.index);
  if(settings[key].length<=1){toast("Debe quedar al menos un elemento.");return}
  if(!confirm(`¿Eliminar "${settings[key][i]}" de la lista?`))return;
  settings[key].splice(i,1);saveSettings();renderSettings();toast("Elemento eliminado.")
});

function xmlEsc(v){
  return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;")
}
function colName(n){
  let s="";while(n>0){let r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)}return s
}
function crc32(bytes){
  let table=crc32.table;if(!table){table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);table[n]=c>>>0}crc32.table=table}
  let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0
}
function u16(n){return new Uint8Array([n&255,(n>>>8)&255])}
function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255])}
function concatBytes(...arrays){const len=arrays.reduce((a,b)=>a+b.length,0),out=new Uint8Array(len);let p=0;for(const a of arrays){out.set(a,p);p+=a.length}return out}
function zipStore(files){
  const enc=new TextEncoder(),local=[],central=[];let offset=0;
  for(const f of files){
    const name=enc.encode(f.name),data=enc.encode(f.data),crc=crc32(data);
    const lh=concatBytes(new Uint8Array([80,75,3,4]),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data);
    local.push(lh);
    const ch=concatBytes(new Uint8Array([80,75,1,2]),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name);
    central.push(ch);offset+=lh.length
  }
  const body=concatBytes(...local),cen=concatBytes(...central);
  const end=concatBytes(new Uint8Array([80,75,5,6]),u16(0),u16(0),u16(files.length),u16(files.length),u32(cen.length),u32(body.length),u16(0));
  return concatBytes(body,cen,end)
}
function makeXlsx(records){
  const headers=["N°","Descripcion","ID dispositivo","Nombre Dispositivo","Ubicación/cargo","Producto","Sistema operativo","Acopio","RAM","Disco Duro","Contraseña Inicio","Usuario Admin","Contraseña Admin","Estado","Fecha registro","Última actualización"];
  const rows=[headers,...records.map((r,i)=>[
    i+1,r.descripcion,r.idDispositivo,r.nombreDispositivo,r.ubicacionCargo,r.producto,r.sistemaOperativo,r.sucursal,r.ram,r.discoDuro,r.contrasenaInicio,r.usuarioAdmin,r.contrasenaAdmin,r.estado,dateFmt(r.createdAt),dateFmt(r.updatedAt)
  ])];
  const sheetRows=rows.map((row,ri)=>{
    const cells=row.map((v,ci)=>{
      const ref=colName(ci+1)+(ri+1),text=xmlEsc(v);
      return `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`
    }).join("");
    return `<row r="${ri+1}">${cells}</row>`
  }).join("");
  const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:P${rows.length}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetData>${sheetRows}</sheetData></worksheet>`;
  const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Inventario" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const rootrels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const content=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  const bytes=zipStore([
    {name:"[Content_Types].xml",data:content},
    {name:"_rels/.rels",data:rootrels},
    {name:"xl/workbook.xml",data:workbook},
    {name:"xl/_rels/workbook.xml.rels",data:rels},
    {name:"xl/worksheets/sheet1.xml",data:sheet}
  ]);
  return new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})
}

$("exportExcel").addEventListener("click",async()=>{
  const records=await allRecords();if(!records.length){toast("No hay equipos para exportar.");return}
  const blob=makeXlsx(records);download(blob,`levantamiento_equipos_${dateStamp()}.xlsx`);toast("Excel generado.")
});

function blobToDataURL(blob){return new Promise((res,rej)=>{if(!blob)return res(null);const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(blob)})}
function dataURLToBlob(data){if(!data)return null;const [meta,b]=data.split(",");const mime=(meta.match(/data:(.*?);base64/)||[])[1]||"application/octet-stream";const bin=atob(b),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new Blob([u],{type:mime})}

$("exportBackup").addEventListener("click",async()=>{
  const records=await allRecords();if(!records.length){toast("No hay registros.");return}
  const out=[];for(const r of records)out.push({...r,photoDataURL:await blobToDataURL(r.photoBlob),photoBlob:undefined});
  const backup={app:"Levantamiento Equipos TI",version:"1.1",exportedAt:new Date().toISOString(),settings,records:out};
  download(new Blob([JSON.stringify(backup,null,2)],{type:"application/json"}),`respaldo_equipos_ti_${dateStamp()}.json`);toast("Respaldo creado.")
});

$("importBackup").addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    const p=JSON.parse(await file.text());if(!Array.isArray(p.records))throw new Error();
    const replace=confirm("¿Reemplazar el inventario actual?\nAceptar = reemplazar\nCancelar = agregar");
    if(replace)await clearRecords();
    if(p.settings&&confirm("El respaldo incluye listas de configuración. ¿Importarlas también?")){settings=p.settings;saveSettings()}
    for(const r of p.records){
      await addRecord({...r,photoBlob:dataURLToBlob(r.photoDataURL),photoDataURL:undefined});
    }
    e.target.value="";renderFormSelects();renderSettings();await renderRecords();await updateSummary();toast("Respaldo importado.")
  }catch(err){console.error(err);e.target.value="";toast("Respaldo inválido.")}
});

$("deleteAll").addEventListener("click",async()=>{
  if(!confirm("¿Borrar todo el inventario de este teléfono?"))return;
  if(!confirm("Esta acción no se puede deshacer. ¿Continuar?"))return;
  await clearRecords();clearForm(false);await renderRecords();await updateSummary();toast("Inventario borrado.")
});

$("closeModal").addEventListener("click",()=>$("modal").classList.add("hidden"));
$("modal").addEventListener("click",e=>{if(e.target===$("modal"))$("modal").classList.add("hidden")});

function renderSettings(){
  settingList("branchList","sucursales");settingList("descList","descripciones");settingList("osList","sistemas");settingList("statusList","estados")
}
function settingList(id,key){
  const wrap=$(id);wrap.innerHTML="";
  settings[key].forEach((v,i)=>{const d=document.createElement("div");d.className="setting";d.innerHTML=`<div><strong>${esc(v)}</strong></div><button type="button" data-key="${key}" data-index="${i}">Eliminar</button>`;wrap.appendChild(d)})
}
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-key]");if(!b)return;
  const key=b.dataset.key,i=Number(b.dataset.index);
  if(settings[key].length<=1){toast("Debe quedar al menos un elemento.");return}
  if(!confirm(`¿Eliminar "${settings[key][i]}" de la lista?`))return;
  settings[key].splice(i,1);saveSettings();renderSettings();renderFormSelects();toast("Elemento eliminado.")
});

window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installEvent=e;$("installBtn").classList.remove("hidden")});
$("installBtn").addEventListener("click",async()=>{if(!installEvent)return;installEvent.prompt();await installEvent.userChoice;installEvent=null;$("installBtn").classList.add("hidden")});

if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.error));

(async()=>{try{await openDB();renderFormSelects({estado:settings.estados[0]||""});renderSettings();await updateSummary()}catch(e){console.error(e);alert("No se pudo iniciar el almacenamiento local.")}})();
