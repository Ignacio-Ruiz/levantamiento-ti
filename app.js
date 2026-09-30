const DB_NAME="levantamiento_ti_db";
const DB_VERSION=1;
const STORE="equipos";
const SETTINGS_KEY="levantamiento_ti_settings_v11";
const DRAFT_KEY="levantamiento_ti_draft_v11";
const DELETED_SYNC_KEY="levantamiento_ti_deleted_sync_v1";

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
let supabaseClient=null;
let cloudUser=null;
let cloudSyncInProgress=false;

const SUPABASE_CONFIG=(typeof window!=="undefined"&&window.SUPABASE_CONFIG)?window.SUPABASE_CONFIG:null;
if(SUPABASE_CONFIG&&SUPABASE_CONFIG.url&&SUPABASE_CONFIG.anonKey&&window.supabase){
  supabaseClient=window.supabase.createClient(SUPABASE_CONFIG.url,SUPABASE_CONFIG.anonKey);
}

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
  clearDraft();
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
    procesador:$("procesador").value.trim(),
    sistemaOperativo:$("sistemaOperativo").value,
    ram:$("ram").value.trim(),
    discoDuro:$("discoDuro").value.trim(),
    contrasenaInicio:$("contrasenaInicio").value,
    usuarioAdmin:$("usuarioAdmin").value.trim(),
    contrasenaAdmin:$("contrasenaAdmin").value,
    estado:$("estado").value
  }
}

function saveDraft(){
  const draft={recordId:$("recordId").value||"",...readForm()};
  localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));
}

function clearDraft(){localStorage.removeItem(DRAFT_KEY)}

function extractLabeledValue(text,labelPattern){
  const pattern=new RegExp(`^\\s*(?:${labelPattern})\\s*[:#-]?\\s*(.+?)\\s*$`,"im");
  return String(text||"").match(pattern)?.[1]?.trim()||"";
}

function normalizeCapacity(text){
  const match=String(text||"").match(/\b(\d+(?:[.,]\d+)?)\s*(TB|GB|GIB|MB|MIB)\b/i);
  if(!match)return "";
  const amount=Number(match[1].replace(",","."));
  const value=Number.isInteger(amount)?String(amount):String(amount);
  const unit=match[2].toUpperCase().replace("GIB","GB").replace("MIB","MB");
  return `${value} ${unit}`;
}

function parseOcrText(text){
  const source=String(text||"").replace(/\r/g,"");
  const cleaned=source.replace(/\s+/g," ").trim();
  const out={};
  const deviceName=extractLabeledValue(source,"device\\s*name|computer\\s*name|host\\s*name|nombre\\s+(?:del\\s+)?(?:dispositivo|equipo|host)");
  if(deviceName)out.nombreDispositivo=deviceName.toUpperCase();

  const deviceId=extractLabeledValue(source,"service\\s*tag|asset\\s*tag|serial\\s*(?:number|no\\.?|#)|s\\s*[/\\\\-]?\\s*n|n[uú]mero\\s+(?:de\\s+)?serie|n\\s*[°ºo]?\\s*\\.?\\s*(?:de\\s+)?serie|no\\.?\\s+de\\s+serie|id\\s+(?:del\\s+)?dispositivo|identificador\\s+(?:del\\s+)?dispositivo");
  if(deviceId)out.idDispositivo=deviceId.toUpperCase();

  const processorPatterns=[
    /\bIntel(?:\s*\(R\))?\s*(?:Core(?:\s*\(TM\))?\s*)?(?:Ultra\s*)?i[3579]\s*[- ]?\s*\d{3,5}[A-Z]{0,2}(?:\s+CPU)?(?:\s*@\s*[\d.]+\s*GHz)?/i,
    /\bIntel(?:\s*\(R\))?\s*(?:Pentium|Xeon)\s+[A-Z0-9-]+(?:\s+CPU)?/i,
    /\bAMD(?:\s+Ryzen)?\s+[3579]\s+\d{4,5}[A-Z]{0,2}(?:\s+CPU)?/i,
    /\bRyzen\s+[3579]\s+\d{4,5}[A-Z]{0,2}/i
  ];
  for(const pattern of processorPatterns){
    const match=cleaned.match(pattern);
    if(match){out.procesador=match[0].replace(/\s+/g," ").trim();break;}
  }

  const ramLine=extractLabeledValue(source,"installed\\s+memory|installed\\s+ram|memory|ram(?:\\s+instalada)?|memoria(?:\\s+instalada)?");
  const ram=normalizeCapacity(ramLine)||normalizeCapacity(cleaned.match(/\b(?:\d+(?:[.,]\d+)?\s*(?:GB|GIB))\b/i)?.[0]);
  if(ram)out.ram=ram;

  const diskLine=extractLabeledValue(source,"storage|almacenamiento|disco(?:\\s+duro)?|hard\\s*drive|disk");
  const diskSource=diskLine||cleaned;
  const diskMatch=diskSource.match(/\b(SSD|NVMe|HDD)\b\s*(\d+(?:[.,]\d+)?\s*(?:TB|GB|GIB|MB|MIB))?|\b(\d+(?:[.,]\d+)?\s*(?:TB|GB|GIB|MB|MIB))\s*\b(SSD|NVMe|HDD)\b/i);
  const diskType=(diskMatch?.[1]||diskMatch?.[4]||"").toUpperCase();
  const diskCapacity=normalizeCapacity(diskMatch?.[2]||diskMatch?.[3]||diskLine);
  if(diskType||diskLine&&diskCapacity)out.discoDuro=[diskCapacity,diskType].filter(Boolean).join(" ");

  const server=cleaned.match(/\bWindows\s*Server\s*(2016|2019|2022)\b/i);
  if(server)out.sistemaOperativo=`Windows Server ${server[1]}`;
  else{
    const windows=cleaned.match(/\bWindows\s*(11|10|8(?:\.1)?|7)\b(?:\s*([\w.-]+))?/i);
    if(windows)out.sistemaOperativo=windows[1]==="11"?"W11":windows[1]==="10"?(/ltc/i.test(windows[2]||"")?"W10 LTSC":"W10"):"Otro";
  }

  const model=extractLabeledValue(source,"model(?:\\s*name)?|modelo(?:\\s+del\\s+equipo)?|product\\s*name|system\\s*model");
  const knownModel=cleaned.match(/\b(?:OptiPlex|Latitude|ThinkPad|EliteBook|ProBook|Torre|Notebook|Desktop|AIO|Precision|IdeaPad|Vostro|ThinkCentre|ProDesk|ZBook)\s*[A-Z0-9-]*/i)?.[0];
  if(model)out.producto=model;
  else if(knownModel)out.producto=knownModel.trim();
  return out;
}

async function fillFromOcr(file){
  if(!window.Tesseract){toast("OCR no está disponible aún. Conéctate a Internet y vuelve a intentarlo.");return;}
  try{
    toast("Leyendo la imagen...");
    const { data } = await window.Tesseract.recognize(file,'eng+spa');
    const parsed=parseOcrText(data.text||"");
    const filled=[];
    const textFields={nombreDispositivo:"nombreDispositivo",idDispositivo:"idDispositivo",producto:"producto",procesador:"procesador",ram:"ram",discoDuro:"discoDuro"};
    for(const [key,id] of Object.entries(textFields)){
      const field=$(id);
      if(parsed[key]&&field&&!field.value.trim()){field.value=parsed[key];filled.push(key);}
    }
    const osField=$("sistemaOperativo");
    if(parsed.sistemaOperativo&&osField&&(osField.value===settings.sistemas[0]||!osField.value)&&Array.from(osField.options).some(option=>option.value===parsed.sistemaOperativo)){
      osField.value=parsed.sistemaOperativo;filled.push("sistema operativo");
    }
    if(filled.length){saveDraft();toast(`Detecté: ${filled.join(", ")}. Revisa los datos antes de guardar.`);}
    else toast("No se detectaron campos nuevos. Prueba con una foto nítida de la etiqueta o de Información del sistema.");
  }catch(err){console.error(err);toast("No se pudo leer la imagen. Prueba con una foto más nítida.")}
}

function newSyncId(){
  if(crypto.randomUUID)return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
  return [...bytes].map((byte,index)=>`${[4,6,8,10].includes(index)?"-":""}${byte.toString(16).padStart(2,"0")}`).join("");
}

function queuedCloudDeletes(){
  try{return JSON.parse(localStorage.getItem(DELETED_SYNC_KEY)||"[]")}catch{return []}
}

function queueCloudDelete(record){
  if(!record?.sync_id||!record?.sync_user_id)return;
  const queued=queuedCloudDeletes();
  if(!queued.some(item=>item.syncId===record.sync_id&&item.userId===record.sync_user_id)){
    queued.push({syncId:record.sync_id,userId:record.sync_user_id});
    localStorage.setItem(DELETED_SYNC_KEY,JSON.stringify(queued));
  }
}

async function clearLocalRecordsAndQueueCloudDeletes(){
  (await allRecords()).forEach(queueCloudDelete);
  await clearRecords();
}

function cloudPayload(record,userId){
  return {
    sync_id:record.sync_id,
    user_id:userId,
    sucursal:record.sucursal||null,
    descripcion:record.descripcion||null,
    id_dispositivo:record.idDispositivo||null,
    nombre_dispositivo:record.nombreDispositivo||null,
    ubicacion_cargo:record.ubicacionCargo||null,
    producto:record.producto||null,
    procesador:record.procesador||null,
    sistema_operativo:record.sistemaOperativo||null,
    ram:record.ram||null,
    disco_duro:record.discoDuro||null,
    contrasena_inicio:record.contrasenaInicio||null,
    usuario_admin:record.usuarioAdmin||null,
    contrasena_admin:record.contrasenaAdmin||null,
    estado:record.estado||null,
    created_at:record.createdAt||new Date().toISOString(),
    updated_at:record.updatedAt||new Date().toISOString()
  };
}

function cloudRowToLocal(row,existing={}){
  return {
    ...existing,
    sync_id:row.sync_id,
    sync_user_id:row.user_id,
    sucursal:row.sucursal||"",
    descripcion:row.descripcion||"",
    idDispositivo:row.id_dispositivo||"",
    nombreDispositivo:row.nombre_dispositivo||"",
    ubicacionCargo:row.ubicacion_cargo||"",
    producto:row.producto||"",
    procesador:row.procesador||"",
    sistemaOperativo:row.sistema_operativo||"",
    ram:row.ram||"",
    discoDuro:row.disco_duro||"",
    contrasenaInicio:row.contrasena_inicio||"",
    usuarioAdmin:row.usuario_admin||"",
    contrasenaAdmin:row.contrasena_admin||"",
    estado:row.estado||"",
    createdAt:row.created_at||existing.createdAt||new Date().toISOString(),
    updatedAt:row.updated_at||existing.updatedAt||new Date().toISOString(),
    photoBlob:existing.photoBlob||null
  };
}

function timestamp(value){const parsed=Date.parse(value||"");return Number.isNaN(parsed)?0:parsed}

function setCloudStatus(message){
  const status=$("cloudStatus");
  if(status)status.textContent=message;
}

function updateCloudControls(){
  const configured=Boolean(supabaseClient);
  const authForm=$("cloudAuthForm");
  if(authForm)authForm.classList.toggle("hidden",!configured||Boolean(cloudUser));
  $("cloudSignOut")?.classList.toggle("hidden",!configured||!cloudUser);
  const syncButton=$("cloudSync");
  if(syncButton)syncButton.disabled=!configured||!cloudUser||cloudSyncInProgress;
  if(!configured)setCloudStatus("Sin configurar: falta la conexión segura con Supabase.");
  else if(cloudUser)setCloudStatus(`Sesión iniciada: ${cloudUser.email||"cuenta autenticada"}`);
  else setCloudStatus("Inicia sesión para sincronizar con este dispositivo.");
}

async function initializeCloudAuth(){
  if(!supabaseClient){updateCloudControls();return;}
  supabaseClient.auth.onAuthStateChange((_event,session)=>{
    cloudUser=session?.user||null;
    updateCloudControls();
  });
  const {data,error}=await supabaseClient.auth.getSession();
  if(error)throw error;
  cloudUser=data.session?.user||null;
  updateCloudControls();
}

async function synchronizeRecords({silent=false}={}){
  if(!supabaseClient||!cloudUser){
    setCloudStatus("Inicia sesión con Supabase antes de sincronizar.");
    if(!silent)toast("Inicia sesión antes de sincronizar.");
    return false;
  }
  if(cloudSyncInProgress)return false;
  cloudSyncInProgress=true;updateCloudControls();setCloudStatus("Sincronizando registros...");
  try{
    const userId=cloudUser.id;
    const queued=queuedCloudDeletes();
    const userDeletes=queued.filter(item=>item.userId===userId);
    if(userDeletes.length){
      const {error}=await supabaseClient.from("equipos").delete().eq("user_id",userId).in("sync_id",userDeletes.map(item=>item.syncId));
      if(error)throw error;
      localStorage.setItem(DELETED_SYNC_KEY,JSON.stringify(queued.filter(item=>item.userId!==userId)));
    }

    let local=await allRecords();
    for(const record of local){
      if(record.sync_user_id&&record.sync_user_id!==userId)throw new Error("Hay registros locales vinculados a otra cuenta. No se subió ni mezcló ningún dato.");
      if(!record.sync_id)record.sync_id=newSyncId();
      record.sync_user_id=userId;
      await putRecord(record);
    }

    let {data:remote,error}=await supabaseClient.from("equipos").select("*").eq("user_id",userId);
    if(error)throw error;
    const remoteById=new Map((remote||[]).map(record=>[record.sync_id,record]));
    const push=[];
    for(const record of local){
      const cloud=remoteById.get(record.sync_id);
      if(!cloud||timestamp(record.updatedAt)>=timestamp(cloud.updated_at))push.push(cloudPayload(record,userId));
      else await putRecord(cloudRowToLocal(cloud,record));
    }
    for(let start=0;start<push.length;start+=250){
      const {error:upsertError}=await supabaseClient.from("equipos").upsert(push.slice(start,start+250),{onConflict:"sync_id"});
      if(upsertError)throw upsertError;
    }

    const {data:latest,error:downloadError}=await supabaseClient.from("equipos").select("*").eq("user_id",userId);
    if(downloadError)throw downloadError;
    const localById=new Map((await allRecords()).map(record=>[record.sync_id,record]));
    for(const row of latest||[]){
      const existing=localById.get(row.sync_id);
      const record=cloudRowToLocal(row,existing||{});
      if(existing){record.id=existing.id;await putRecord(record);}
      else await addRecord(record);
    }
    await renderRecords();await updateSummary();
    const message=`Sincronizado: ${local.length} registros enviados o revisados; ${Math.max(0,(latest||[]).length-local.length)} descargados.`;
    setCloudStatus(message);
    if(!silent)toast("Sincronización completada.");
    return true;
  }catch(error){
    console.error(error);
    const message=error.message||"No se pudo sincronizar. Revisa la migración y las políticas de Supabase.";
    setCloudStatus(`Error de sincronización: ${message}`);
    if(!silent)toast("No se pudo sincronizar. Revisa la conexión y la configuración.");
    return false;
  }finally{cloudSyncInProgress=false;updateCloudControls();}
}

function restoreDraft(){
  try{
    const draft=JSON.parse(localStorage.getItem(DRAFT_KEY)||"null");
    if(!draft)return;
    renderFormSelects({sucursal:draft.sucursal||"",descripcion:draft.descripcion||"",sistemaOperativo:draft.sistemaOperativo||"",estado:draft.estado||settings.estados[0]||""});
    $("recordId").value=draft.recordId||"";
    $("sucursal").value=draft.sucursal||settings.sucursales[0]||"";
    $("descripcion").value=draft.descripcion||settings.descripciones[0]||"";
    $("idDispositivo").value=draft.idDispositivo||"";
    $("nombreDispositivo").value=draft.nombreDispositivo||"";
    $("ubicacionCargo").value=draft.ubicacionCargo||"";
    $("producto").value=draft.producto||"";
    $("procesador").value=draft.procesador||"";
    $("sistemaOperativo").value=draft.sistemaOperativo||"";
    $("ram").value=draft.ram||"";
    $("discoDuro").value=draft.discoDuro||"";
    $("contrasenaInicio").value=draft.contrasenaInicio||"";
    $("usuarioAdmin").value=draft.usuarioAdmin||"";
    $("contrasenaAdmin").value=draft.contrasenaAdmin||"";
    $("estado").value=draft.estado||settings.estados[0]||"";
    $("formTitle").textContent=$("recordId").value?"Editar equipo":"Registrar equipo";
    $("cancelEdit").classList.toggle("hidden",!$("recordId").value);
  }catch(err){console.error(err)}
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

  try{
    const old=id?await getRecord(id):null;
    const record={...values,...(old?{sync_id:old.sync_id,sync_user_id:old.sync_user_id,createdAt:old.createdAt||now}:{createdAt:now}),photoBlob:selectedPhoto||existingPhoto||null,updatedAt:now};
    if(id){record.id=id;await putRecord(record);toast("Equipo actualizado.")}
    else{await addRecord(record);toast("Equipo guardado.")}
    const branch=values.sucursal;
    clearForm(true);
    if(settings.sucursales.includes(branch))$("sucursal").value=branch;
    await updateSummary();
    if(cloudUser)await synchronizeRecords({silent:true});
  }catch(err){console.error(err);toast("No se pudo guardar el registro.")}
});

["sucursal","descripcion","idDispositivo","nombreDispositivo","ubicacionCargo","producto","procesador","sistemaOperativo","ram","discoDuro","contrasenaInicio","usuarioAdmin","contrasenaAdmin","estado"].forEach(id=>{
  const el=$(id);
  if(el){el.addEventListener("input",saveDraft);el.addEventListener("change",saveDraft)}
});

$("cancelEdit").addEventListener("click",()=>clearForm(true));

$("photoInput").addEventListener("change",()=>{
  const f=$("photoInput").files?.[0];if(!f)return;
  selectedPhoto=f;existingPhoto=null;
  $("photoPreview").src=URL.createObjectURL(f);
  $("photoPreviewWrap").classList.remove("hidden");
  fillFromOcr(f);
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
  $("producto").value=r.producto||"";$("procesador").value=r.procesador||"";$("sistemaOperativo").value=r.sistemaOperativo||"";
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
    queueCloudDelete(r);await removeRecord(id);await renderRecords();await updateSummary();
    if(cloudUser)await synchronizeRecords({silent:true});
    toast("Registro eliminado.")
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
  const headers=["N°","Descripcion","ID dispositivo","Nombre Dispositivo","Ubicación/cargo","Producto","Procesador","Sistema operativo","Acopio","RAM","Disco Duro","Contraseña Inicio","Usuario Admin","Contraseña Admin","Estado","Fecha registro","Última actualización"];
  const rows=[headers,...records.map((r,i)=>[
    i+1,r.descripcion,r.idDispositivo,r.nombreDispositivo,r.ubicacionCargo,r.producto,r.procesador||"",r.sistemaOperativo,r.sucursal,r.ram,r.discoDuro,r.contrasenaInicio,r.usuarioAdmin,r.contrasenaAdmin,r.estado,dateFmt(r.createdAt),dateFmt(r.updatedAt)
  ])];
  const sheetRows=rows.map((row,ri)=>{
    const cells=row.map((v,ci)=>{
      const ref=colName(ci+1)+(ri+1),text=xmlEsc(v),style=ri===0?1:(ri%2===0?2:3);
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${text}</t></is></c>`
    }).join("");
    return `<row r="${ri+1}"${ri===0?' ht="30" customHeight="1"':' ht="24" customHeight="1"'}>${cells}</row>`
  }).join("");
  const widths=[7,18,18,28,24,24,25,24,18,12,20,24,22,24,20,22,22];
  const cols=widths.map((width,i)=>`<col min="${i+1}" max="${i+1}" width="${width}" customWidth="1"/>`).join("");
  const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:Q${rows.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:Q${rows.length}"/></worksheet>`;
  const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Inventario" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const rootrels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos Display"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17324D"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD9E2E8"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const content=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const bytes=zipStore([
    {name:"[Content_Types].xml",data:content},
    {name:"_rels/.rels",data:rootrels},
    {name:"xl/workbook.xml",data:workbook},
    {name:"xl/_rels/workbook.xml.rels",data:rels},
    {name:"xl/worksheets/sheet1.xml",data:sheet},
    {name:"xl/styles.xml",data:styles}
  ]);
  return new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})
}

$("exportExcel").addEventListener("click",async()=>{
  const records=await allRecords();if(!records.length){toast("No hay equipos para exportar.");return}
  const blob=makeXlsx(records);download(blob,`levantamiento_equipos_${dateStamp()}.xlsx`);toast("Excel generado.")
});

function blobToDataURL(blob){return new Promise((res,rej)=>{if(!blob)return res(null);const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(blob)})}
function dataURLToBlob(data){if(!data)return null;const [meta,b]=data.split(",");const mime=(meta.match(/data:(.*?);base64/)||[])[1]||"application/octet-stream";const bin=atob(b),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new Blob([u],{type:mime})}

function normalizeHeaderToken(v){return String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g,"")}
function cellValue(row,keyList){
  for(const key of keyList){
    const token=normalizeHeaderToken(key);
    if(Object.prototype.hasOwnProperty.call(row,token)){
      const value=row[token];
      if(value!==null&&value!==undefined&&String(value).trim()!=="")return String(value).trim();
    }
  }
  return "";
}
function excelRowToRecord(rawRow){
  const row={};Object.entries(rawRow||{}).forEach(([k,v])=>{row[normalizeHeaderToken(k)]=v});
  const nombreDispositivo=cellValue(row,["nombredispositivo","nombre","nombrecomputador","nombreequipo"]);
  if(!nombreDispositivo) return null;
  return {
    sucursal:cellValue(row,["acopio","sucursal"]),
    descripcion:cellValue(row,["descripcion","descripcin"]),
    idDispositivo:cellValue(row,["iddispositivo","id"]),
    nombreDispositivo,
    ubicacionCargo:cellValue(row,["ubicacioncargo","ubicacion","cargo"]),
    producto:cellValue(row,["producto","modelo","model"]),
    procesador:cellValue(row,["procesador","cpu","processor"]),
    sistemaOperativo:cellValue(row,["sistemaoperativo","sistema","os"]),
    ram:cellValue(row,["ram","memoriaram"]),
    discoDuro:cellValue(row,["discoduro","disco","ssd","almacenamiento"]),
    contrasenaInicio:cellValue(row,["contrasenainicio","passwordinicio"]),
    usuarioAdmin:cellValue(row,["usuarioadmin","usuario","adminuser"]),
    contrasenaAdmin:cellValue(row,["contrasenaadmin","passwordadmin"]),
    estado:cellValue(row,["estado","status"])
  };
}

$("importExcel").addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    if(!window.XLSX) throw new Error("No está disponible la lectura de Excel.");
    const buffer=await file.arrayBuffer();
    const workbook=XLSX.read(buffer,{type:"array"});
    const sheet=workbook.Sheets[workbook.SheetNames[0]];
    const rows=XLSX.utils.sheet_to_json(sheet,{defval:"",raw:false});
    const records=[];
    rows.forEach(r=>{const rec=excelRowToRecord(r);if(rec)records.push(rec)});
    if(!records.length) throw new Error("No se encontraron filas válidas.");
    const replace=confirm("¿Reemplazar el inventario actual?\nAceptar = reemplazar\nCancelar = agregar");
    if(replace)await clearLocalRecordsAndQueueCloudDeletes();
    for(const record of records){
      await addRecord({
        ...record,
        createdAt:new Date().toISOString(),
        updatedAt:new Date().toISOString(),
        photoBlob:null
      });
    }
    e.target.value="";
    await renderRecords();
    await updateSummary();
    if(cloudUser)await synchronizeRecords({silent:true});
    toast(`Se importaron ${records.length} equipos desde Excel.`);
  }catch(err){console.error(err);e.target.value="";toast("Excel inválido o sin registros compatibles.")}
});

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
    if(replace)await clearLocalRecordsAndQueueCloudDeletes();
    if(p.settings&&confirm("El respaldo incluye listas de configuración. ¿Importarlas también?")){settings=p.settings;saveSettings()}
    for(const r of p.records){
      await addRecord({...r,photoBlob:dataURLToBlob(r.photoDataURL),photoDataURL:undefined});
    }
    e.target.value="";renderFormSelects();renderSettings();await renderRecords();await updateSummary();
    if(cloudUser)await synchronizeRecords({silent:true});
    toast("Respaldo importado.")
  }catch(err){console.error(err);e.target.value="";toast("Respaldo inválido.")}
});

$("deleteAll").addEventListener("click",async()=>{
  if(!confirm("¿Borrar todo el inventario de este teléfono?"))return;
  if(!confirm("Esta acción no se puede deshacer. ¿Continuar?"))return;
  await clearLocalRecordsAndQueueCloudDeletes();clearForm(false);await renderRecords();await updateSummary();
  if(cloudUser)await synchronizeRecords({silent:true});
  toast("Inventario borrado.")
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

$("cloudAuthForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!supabaseClient){setCloudStatus("La app no tiene conexión con Supabase configurada.");return;}
  try{
    const {data,error}=await supabaseClient.auth.signInWithPassword({email:$("cloudEmail").value.trim(),password:$("cloudPassword").value});
    if(error)throw error;
    cloudUser=data.user;$("cloudPassword").value="";updateCloudControls();toast("Sesión iniciada.");
  }catch(error){setCloudStatus(error.message||"No se pudo iniciar sesión.");}
});

$("cloudSignUp").addEventListener("click",async()=>{
  if(!supabaseClient){setCloudStatus("La app no tiene conexión con Supabase configurada.");return;}
  try{
    const {data,error}=await supabaseClient.auth.signUp({email:$("cloudEmail").value.trim(),password:$("cloudPassword").value});
    if(error)throw error;
    if(data.session){cloudUser=data.user;$("cloudPassword").value="";updateCloudControls();setCloudStatus("Cuenta creada e iniciada.");}
    else setCloudStatus("Cuenta creada. Confirma el correo y luego inicia sesión.");
  }catch(error){setCloudStatus(error.message||"No se pudo crear la cuenta.");}
});

$("cloudSignOut").addEventListener("click",async()=>{
  if(!supabaseClient)return;
  const {error}=await supabaseClient.auth.signOut();
  if(error){setCloudStatus(error.message);return;}
  cloudUser=null;updateCloudControls();
});

$("cloudSync").addEventListener("click",()=>synchronizeRecords());

window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installEvent=e;$("installBtn").classList.remove("hidden")});
$("installBtn").addEventListener("click",async()=>{if(!installEvent)return;installEvent.prompt();await installEvent.userChoice;installEvent=null;$("installBtn").classList.add("hidden")});

if("serviceWorker" in navigator){
  window.addEventListener("load",async()=>{
    try{
      const reg=await navigator.serviceWorker.register("./sw.js");
      reg.addEventListener("updatefound",()=>{
        const worker=reg.installing;
        if(!worker)return;
        worker.addEventListener("statechange",()=>{
          if(worker.state==="activated" && navigator.serviceWorker.controller){
            window.location.reload();
          }
        });
      });
    }catch(err){console.error(err)}
  });
}

(async()=>{try{await openDB();renderFormSelects({estado:settings.estados[0]||""});renderSettings();restoreDraft();await updateSummary();try{await initializeCloudAuth()}catch(error){console.error(error);setCloudStatus("No se pudo comprobar la sesión de Supabase.")}}catch(e){console.error(e);alert("No se pudo iniciar el almacenamiento local.")}})();
