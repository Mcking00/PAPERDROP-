import type { } from "@/amplify/data/resource";

export type Searchable = { originalName?: string | null; name?: string | null; title?: string | null; author?: string | null; description?: string | null };
export function normalize(value: unknown): string { return String(value ?? "").toLowerCase().normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").trim(); }
export function fuzzyScore(query: string, value: Searchable | string): number {
  const q = normalize(query); if (!q) return 1;
  const text = typeof value === "string" ? normalize(value) : normalize([value.originalName,value.name,value.title,value.author,value.description].filter(Boolean).join(" "));
  if (!text) return 0; if (text === q) return 1000; if (text.startsWith(q)) return 900 - Math.min(200, text.length-q.length); if (text.includes(q)) return 750 - Math.min(200,text.indexOf(q));
  let cursor=0, matched=0, streak=0; for (const ch of q) { const found=text.indexOf(ch,cursor); if(found<0) continue; matched++; streak += found===cursor ? 2 : 1; cursor=found+1; }
  return matched ? (matched/q.length)*500 + streak*8 - (cursor-matched) : 0;
}
export function formatSize(bytes?: number | null): string { const n=Number(bytes??0); if(!Number.isFinite(n)||n<=0) return "—"; if(n<1024) return n+" B"; if(n<1024**2) return (n/1024).toFixed(0)+" KB"; if(n<1024**3) return (n/1024**2).toFixed(1)+" MB"; return (n/1024**3).toFixed(2)+" GB"; }
export function formatDate(value?: string | null): string { if(!value) return "—"; const d=new Date(value); if(Number.isNaN(d.getTime())) return "—"; return new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",year:"numeric"}).format(d); }
export function isPdf(file: File): boolean { return file.type==="application/pdf" || file.name.toLowerCase().endsWith(".pdf"); }
export async function sha256(file: File): Promise<string> { const digest=await crypto.subtle.digest("SHA-256", await file.arrayBuffer()); return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join(""); }
export type PdfInspection = { pageCount?: number; title?: string; author?: string };
export async function inspectPdf(file: File): Promise<PdfInspection> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sample = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 8 * 1024 * 1024)));
  const pageCount = (sample.match(/\/Type\s*\/Page(?:\s|[>\/])/g) || []).length || undefined;
  const readInfo = (key: string): string | undefined => {
    const match = sample.match(new RegExp("/" + key + "\\s*\\(([^)]{1,300})\\)", "i"));
    return match?.[1]?.replace(/\\([\\()])/g, "$1").trim() || undefined;
  };
  return { pageCount, title: readInfo("Title"), author: readInfo("Author") };
}
export function pdfThumbData(name: string): string {
  const safe=String(name||"PDF").replace(/[&<>"\']/g,"");
  const svg="<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"280\" height=\"190\"><defs><linearGradient id=\"g\" x1=\"0\" x2=\"1\" y1=\"0\" y2=\"1\"><stop stop-color=\"#1d285f\"/><stop offset=\"1\" stop-color=\"#090b24\"/></linearGradient></defs><rect width=\"280\" height=\"190\" rx=\"24\" fill=\"url(#g)\"/><rect x=\"78\" y=\"25\" width=\"124\" height=\"140\" rx=\"12\" fill=\"#eef2ff\"/><path d=\"M176 25v34h26\" fill=\"#c5ccef\"/><path d=\"M176 25l26 34h-26z\" fill=\"#d7dcf4\"/><rect x=\"97\" y=\"78\" width=\"86\" height=\"7\" rx=\"3.5\" fill=\"#b7bfdc\"/><rect x=\"97\" y=\"94\" width=\"68\" height=\"7\" rx=\"3.5\" fill=\"#c8cde1\"/><rect x=\"97\" y=\"110\" width=\"78\" height=\"7\" rx=\"3.5\" fill=\"#c8cde1\"/><text x=\"140\" y=\"146\" text-anchor=\"middle\" font-family=\"Arial\" font-weight=\"700\" font-size=\"18\" fill=\"#6f4cff\">PDF</text><title>"+safe+"</title></svg>";
  return "data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(svg);
}
const DB_NAME="paperdropl-local", STORE="upload-drafts";
export type DraftUpload={id:string;name:string;size:number;type:string;sectionId:string;file:File};
function openDb():Promise<IDBDatabase|null>{ return new Promise(resolve=>{ if(typeof window==="undefined"||!("indexedDB" in window)) return resolve(null); const req=indexedDB.open(DB_NAME,1); req.onupgradeneeded=()=>req.result.createObjectStore(STORE,{keyPath:"id"}); req.onsuccess=()=>resolve(req.result); req.onerror=()=>resolve(null); }); }
export async function saveDraftUploads(items:DraftUpload[]):Promise<void>{const db=await openDb(); if(!db) return; await new Promise<void>(resolve=>{const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).clear(); items.forEach(i=>tx.objectStore(STORE).put(i)); tx.oncomplete=()=>resolve(); tx.onerror=()=>resolve();}); db.close();}
export async function loadDraftUploads():Promise<DraftUpload[]>{const db=await openDb(); if(!db) return []; const rows=await new Promise<DraftUpload[]>(resolve=>{const tx=db.transaction(STORE,"readonly"); const req=tx.objectStore(STORE).getAll(); req.onsuccess=()=>resolve(Array.isArray(req.result)?req.result:[]); req.onerror=()=>resolve([]);}); db.close(); return rows;}
export async function clearDraftUploads():Promise<void>{const db=await openDb(); if(!db) return; await new Promise<void>(resolve=>{const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).clear(); tx.oncomplete=()=>resolve(); tx.onerror=()=>resolve();}); db.close();}