'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { uploadData, copy, remove, getUrl } from 'aws-amplify/storage';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import Link from 'next/link';
import '@aws-amplify/ui-react/styles.css';
import styles from './admin.module.css';

const client=generateClient<Schema>();
type Section=Schema['Section']['type']; type Submission=Schema['Submission']['type']; type Document=Schema['Document']['type']; type Report=Schema['Report']['type']; type Activity=Schema['ActivityLog']['type'];
type QItem={id:string;file:File;sectionId:string;progress:number;status:'queued'|'uploading'|'done'|'error';error?:string};
const MAX=50*1024*1024;
function size(n?:number|null){const x=Number(n??0);if(!x)return '—';if(x<1024)return x+' B';if(x<1024**2)return (x/1024).toFixed(0)+' KB';if(x<1024**3)return (x/1024**2).toFixed(1)+' MB';return (x/1024**3).toFixed(2)+' GB'}
function date(v?:string|null){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)}
function norm(v:unknown){return String(v??'').toLowerCase().trim()}
async function hashFile(file:File){const b=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')}
async function assertPdfHeader(file:File){const header=new TextDecoder().decode(new Uint8Array(await file.slice(0,5).arrayBuffer()));if(header!=='%PDF-')throw new Error('The file does not contain a valid PDF header.')}
async function metaFile(file:File){const text=new TextDecoder('latin1').decode(new Uint8Array(await file.arrayBuffer()).subarray(0,Math.min(file.size,8*1024*1024)));const pages=(text.match(/\/Type\s*\/Page(?:\s|[>\/])/g)||[]).length||undefined;const read=(k:string)=>{const m=text.match(new RegExp('/'+k+'\\s*\\(([^)]{1,260})\\)','i'));return m?.[1]?.replace(/\\([\\()])/g,'$1').trim()||undefined};return{pages,title:read('Title'),author:read('Author')}}

export default function AdminPage(){return <Authenticator hideSignUp><AdminArea/></Authenticator>}

function AdminArea(){
 const {signOut}=useAuthenticator();
 const [allowed,setAllowed]=useState<boolean|null>(null),[pending,setPending]=useState<Submission[]>([]),[docs,setDocs]=useState<Document[]>([]),[sections,setSections]=useState<Section[]>([]),[reports,setReports]=useState<Report[]>([]),[activity,setActivity]=useState<Activity[]>([]);
 const [busy,setBusy]=useState(''),[message,setMessage]=useState(''),[query,setQuery]=useState(''),[statusFilter,setStatusFilter]=useState('attention'),[submissionFilter,setSubmissionFilter]=useState('pending'),[sectionFilter,setSectionFilter]=useState('all'),[dateFilter,setDateFilter]=useState('all'),[sort,setSort]=useState('newest');
 const [selectedIds,setSelectedIds]=useState<string[]>([]),[activityQuery,setActivityQuery]=useState(''),[detail,setDetail]=useState<Document|Submission|null>(null),[detailUrl,setDetailUrl]=useState(''),[shortcutHelp,setShortcutHelp]=useState(false),[replaceTarget,setReplaceTarget]=useState<Document|null>(null),[undoDoc,setUndoDoc]=useState<Document|null>(null);
 const [name,setName]=useState(''),[description,setDescription]=useState(''),[parentId,setParentId]=useState(''),[editingSection,setEditingSection]=useState<Section|null>(null),[deleteSection,setDeleteSection]=useState<Section|null>(null),[deleteDestination,setDeleteDestination]=useState('');
 const [queue,setQueue]=useState<QItem[]>([]),[drag,setDrag]=useState(false),[queueSection,setQueueSection]=useState('');

 const replaceInput=useRef<HTMLInputElement>(null); const searchRef=useRef<HTMLInputElement>(null); const newlyPublishedHashes=useRef(new Set<string>());

 async function logAction(action:string,entityType:string,entityId:string|null|undefined,summary:string,metadata?:unknown){await client.models.ActivityLog.create({action,entityType,entityId,summary,actor:'admin',metadata:metadata?JSON.stringify(metadata):undefined},{authMode:'userPool'}).catch(()=>undefined)}
 async function load(){setMessage('');try{const[p,d,s,r,a]=await Promise.all([client.models.Submission.list({authMode:'userPool'}),client.models.Document.list({authMode:'userPool'}),client.models.Section.list({authMode:'userPool'}),client.models.Report.list({authMode:'userPool'}),client.models.ActivityLog.list({authMode:'userPool'})]);const err=p.errors?.[0]?.message||d.errors?.[0]?.message||s.errors?.[0]?.message||r.errors?.[0]?.message||a.errors?.[0]?.message;if(err)throw new Error(err);setPending(p.data);setDocs(d.data);setSections([...s.data].sort((x,y)=>(x.sortOrder??0)-(y.sortOrder??0)));setReports([...r.data].sort((x,y)=>new Date(y.createdAt||0).getTime()-new Date(x.createdAt||0).getTime()));setActivity([...a.data].sort((x,y)=>new Date(y.createdAt||0).getTime()-new Date(x.createdAt||0).getTime()).slice(0,80))}catch(e){setMessage(e instanceof Error?e.message:'Could not load admin data.')}}
 useEffect(()=>{fetchAuthSession().then(s=>{const g=s.tokens?.accessToken?.payload?.['cognito:groups'];const ok=Array.isArray(g)&&g.includes('ADMINS');setAllowed(ok);if(ok)void load()}).catch(()=>setAllowed(false))},[])
 useEffect(()=>{const fn=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchRef.current?.focus()}if(e.key==='Escape'){setDetail(null);setDeleteSection(null);setShortcutHelp(false)}if(detail&&e.key.toLowerCase()==='p'&&detailUrl)window.open(detailUrl,'_blank','noopener,noreferrer');if(detail&&e.key.toLowerCase()==='a'&&'status' in detail&&detail.status==='pending')void approve(detail as Submission);if(detail&&e.key.toLowerCase()==='r'&&'status' in detail&&detail.status==='pending')void reject(detail as Submission);if(detail&&e.key==='Delete'&&'status' in detail&&detail.status==='published')void trashDoc(detail as Document)};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn)},[detail,detailUrl])

 const sectionMap=useMemo(()=>new Map(sections.map(s=>[s.id,s])),[sections]);
 const childCount=useMemo(()=>{const m=new Map<string,number>();sections.forEach(s=>{if(s.parentId)m.set(s.parentId,(m.get(s.parentId)||0)+1)});return m},[sections]);
 const docCount=useMemo(()=>{const m=new Map<string,number>();docs.forEach(d=>m.set(d.sectionId,(m.get(d.sectionId)||0)+1));return m},[docs]);
 const matches=(value:string)=>!query||norm(value).includes(norm(query));
 const withinDate=(value?:string|null)=>{if(dateFilter==='all'||!value)return true;const d=new Date(value),now=Date.now();if(Number.isNaN(d.getTime()))return false;const age=now-d.getTime();return dateFilter==='24h'?age<=86400000:dateFilter==='7d'?age<=604800000:age<=2592000000};
 const publishedDocs=useMemo(()=>{let list=docs.filter(d=>sectionFilter==='all'||d.sectionId===sectionFilter).filter(d=>{const s=(d.status??'published');if(statusFilter==='published')return s==='published';if(statusFilter==='trash')return s==='trashed';if(statusFilter==='attention')return s==='published'||s==='trashed';return true}).filter(d=>withinDate(d.updatedAt||d.createdAt)&&matches([d.originalName,d.title,d.author,sectionMap.get(d.sectionId)?.name].filter(Boolean).join(' ')));if(sort==='az')list.sort((a,b)=>norm(a.originalName).localeCompare(norm(b.originalName)));else if(sort==='size')list.sort((a,b)=>(b.size??0)-(a.size??0));else list.sort((a,b)=>new Date(b.updatedAt||b.createdAt||0).getTime()-new Date(a.updatedAt||a.createdAt||0).getTime());return list},[docs,query,sectionFilter,sort,statusFilter,sectionMap,dateFilter]);
 const pendingFiltered=useMemo(()=>pending.filter(x=>(submissionFilter==='all'||x.status===submissionFilter)&&withinDate(x.createdAt)&&matches([x.originalName,sectionMap.get(x.sectionId)?.name].join(' '))&&(sectionFilter==='all'||x.sectionId===sectionFilter)),[pending,query,sectionFilter,sectionMap,submissionFilter,dateFilter]);
 const reportFiltered=useMemo(()=>reports.filter(r=>(r.status??'open')==='open'&&matches([r.reason,r.description,docs.find(d=>d.id===r.documentId)?.originalName].join(' '))),[docs,reports,query]);
 const activityFiltered=useMemo(()=>activity.filter(a=>!activityQuery||norm([a.action,a.summary,a.entityType,a.actor].join(' ')).includes(norm(activityQuery))),[activity,activityQuery]);
 const attentionCount=pending.filter(x=>x.status==='pending').length+reportFiltered.length;
 const toggleAllPending=()=>{const ids=pendingFiltered.map(x=>x.id);setSelectedIds(v=>ids.every(id=>v.includes(id))?v.filter(id=>!ids.includes(id)):Array.from(new Set([...v,...ids])))};
 async function rejectSelected(){const ids=selectedIds; if(!ids.length||!window.confirm('Reject the selected submissions?'))return; for(const id of ids){const item=pending.find(x=>x.id===id);if(item&&item.status==='pending')await reject(item)} setSelectedIds([]);await load()}
 const focusedDetailUrl=async(item:Document|Submission)=>{const p=item.storagePath;try{const r=await getUrl({path:p});setDetailUrl(r.url.toString())}catch{setDetailUrl('')}};
 function openDetail(item:Document|Submission){setDetail(item);setDetailUrl('');void focusedDetailUrl(item)}
 function qadd(files:FileList|File[]){const accepted:QItem[]=[];for(const f of Array.from(files)){if(f.type!=='application/pdf'&&!f.name.toLowerCase().endsWith('.pdf')){setMessage(f.name+': PDF only');continue}if(f.size>MAX){setMessage(f.name+': max 50 MB');continue}accepted.push({id:crypto.randomUUID(),file:f,sectionId:queueSection||sections[0]?.id||'',progress:0,status:'queued'})}if(accepted.length)setQueue(q=>[...q,...accepted])}
 function qpatch(id:string,p:Partial<QItem>){setQueue(q=>q.map(x=>x.id===id?{...x,...p}:x))}
 async function publishQueue(){if(busy||!queue.length)return;setBusy('queue');let count=0;const seenHashes=new Set<string>([...docs.map(d=>d.fileHash),...pending.map(s=>s.fileHash)].filter((x):x is string=>Boolean(x)));for(const item of queue.filter(x=>x.status==='queued'||x.status==='error')){if(!item.sectionId){qpatch(item.id,{status:'error',error:'Choose a section.'});continue}qpatch(item.id,{status:'uploading',progress:0,error:undefined});let path='';let reservedHash='';try{await assertPdfHeader(item.file);const h=await hashFile(item.file),m=await metaFile(item.file);if(seenHashes.has(h)){qpatch(item.id,{status:'error',error:'Duplicate file detected.'});continue}path='public/'+crypto.randomUUID()+'.pdf';await uploadData({path,data:item.file,options:{contentType:'application/pdf',onProgress:({transferredBytes,totalBytes})=>qpatch(item.id,{progress:Math.min(99,totalBytes?Math.round(transferredBytes/totalBytes*100):0)})}}).result;const lock=await client.models.HashReservation.create({id:h,status:"published",documentId:h},{authMode:"userPool"});if(lock.errors?.length||!lock.data)throw new Error("This PDF is already reserved, submitted, or published.");reservedHash=h;const r=await client.models.Document.create({id:h,originalName:item.file.name.slice(0,180),storagePath:path,size:item.file.size,sectionId:item.sectionId,status:'published',pageCount:m.pages,title:m.title,author:m.author,fileHash:h,processingStatus:'complete',publishedAt:new Date().toISOString(),currentVersion:1},{authMode:'userPool'});if(r.errors?.length)throw new Error(r.errors[0].message);reservedHash="";path="";seenHashes.add(h);await logAction('upload','Document',r.data?.id,item.file.name);qpatch(item.id,{status:'done',progress:100});count++}catch(e){if(reservedHash)await client.models.HashReservation.delete({id:reservedHash},{authMode:"userPool"}).catch(()=>undefined);if(path)await remove({path}).catch(()=>undefined);qpatch(item.id,{status:'error',error:e instanceof Error?e.message:'Upload failed.'})}}setBusy('');if(count){setMessage(count+' PDF'+(count>1?'s':'')+' published.');setQueue(q=>q.filter(x=>x.status!=='done'));await load()}}
 async function approve(item:Submission){
 if(item.fileHash&&(docs.some(d=>d.fileHash===item.fileHash)||newlyPublishedHashes.current.has(item.fileHash))){setMessage('This PDF matches an existing or just-published document. Reject this duplicate instead.');return}
 setBusy(item.id);let dest='';let createdId:string|undefined;let reservationPublished=false;let submissionApproved=false;
 try{
  if(item.fileHash){
   const existing=await client.models.HashReservation.get({id:item.fileHash},{authMode:'userPool'});
   if(existing.errors?.length)throw new Error(existing.errors[0].message);
   if(existing.data){if(existing.data.status!=='pending'||existing.data.submissionId!==item.id)throw new Error('This PDF hash is already reserved by another submission or document.');}
   else{
    const claim=await client.models.HashReservation.create({id:item.fileHash,status:'pending',submissionId:item.id},{authMode:'userPool'});
    if(claim.errors?.length||!claim.data){const raced=await client.models.HashReservation.get({id:item.fileHash},{authMode:'userPool'});if(raced.errors?.length||raced.data?.status!=='pending'||raced.data.submissionId!==item.id)throw new Error('This PDF hash is already reserved by another submission or document.');}
   }
  }
  dest='public/'+(item.fileHash||item.id)+'-'+crypto.randomUUID()+'.pdf';await copy({source:{path:item.storagePath},destination:{path:dest}});
  const r=await client.models.Document.create({id:item.fileHash||crypto.randomUUID(),originalName:item.originalName,storagePath:dest,size:item.size,sectionId:item.sectionId,status:'published',pageCount:item.pageCount,title:item.title,author:item.author,fileHash:item.fileHash,processingStatus:item.processingStatus||'complete',publishedAt:new Date().toISOString(),currentVersion:1},{authMode:'userPool'});
  if(r.errors?.length||!r.data)throw new Error(r.errors?.[0]?.message||'The document could not be published.');createdId=r.data.id;
  if(item.fileHash){const lock=await client.models.HashReservation.update({id:item.fileHash,status:'published',documentId:createdId},{authMode:'userPool'});if(lock.errors?.length)throw new Error(lock.errors[0].message);reservationPublished=true;}
  const u=await client.models.Submission.update({id:item.id,status:'approved'},{authMode:'userPool'});if(u.errors?.length)throw new Error(u.errors[0].message);submissionApproved=true;
  if(item.fileHash)newlyPublishedHashes.current.add(item.fileHash);await remove({path:item.storagePath}).catch(()=>undefined);await logAction('approve','Submission',item.id,'Approved '+item.originalName,{documentId:createdId}).catch(()=>undefined);setMessage('Published successfully.');await load().catch(()=>undefined);
 }catch(e){
  if(submissionApproved)await client.models.Submission.update({id:item.id,status:'pending'},{authMode:'userPool'}).catch(()=>undefined);
  if(reservationPublished&&item.fileHash)await client.models.HashReservation.update({id:item.fileHash,status:'pending',documentId:null,submissionId:item.id},{authMode:'userPool'}).catch(()=>undefined);
  let winnerExists=false;
  if(createdId){
   try{
    const check=await client.models.Document.get({id:createdId},{authMode:'userPool'});
    winnerExists=Boolean(check.data);
   }catch{}
   if(!winnerExists)await client.models.Document.delete({id:createdId},{authMode:'userPool'}).catch(()=>undefined);
  }
  if(dest&&!winnerExists)await remove({path:dest}).catch(()=>undefined);
  setMessage(e instanceof Error?e.message:'Approval failed.');
 }finally{setBusy('')}
}
 async function reject(item:Submission){
 if(!window.confirm('Reject '+item.originalName+'?'))return;setBusy(item.id);let reservationReleaseFailed=false;
 try{
  const r=await client.models.Submission.update({id:item.id,status:'rejected',processingError:'Rejected by administrator'},{authMode:'userPool'});if(r.errors?.length)throw new Error(r.errors[0].message);
  if(item.fileHash){try{const lock=await client.models.HashReservation.get({id:item.fileHash},{authMode:'userPool'});if(lock.errors?.length)reservationReleaseFailed=true;else if(lock.data?.status==='pending'&&lock.data.submissionId===item.id){const released=await client.models.HashReservation.delete({id:item.fileHash},{authMode:'userPool'});if(released.errors?.length)reservationReleaseFailed=true;}}catch{reservationReleaseFailed=true}}
  await remove({path:item.storagePath}).catch(()=>undefined);await logAction('reject','Submission',item.id,'Rejected '+item.originalName).catch(()=>undefined);setMessage(reservationReleaseFailed?'Submission rejected, but its hash reservation could not be released.':'Submission rejected.');await load().catch(()=>undefined);
 }catch(e){setMessage(e instanceof Error?e.message:'Reject failed.')}finally{setBusy('')}
}
 async function trashDoc(item:Document){if(item.status==='trashed')return;if(!window.confirm('Move '+item.originalName+' to Trash?'))return;setBusy(item.id);let trashPath='';try{trashPath='trash/'+item.id+'.pdf';await copy({source:{path:item.storagePath},destination:{path:trashPath}});const r=await client.models.Document.update({id:item.id,status:'trashed',storagePath:trashPath,trashedAt:new Date().toISOString(),trashedFromPath:item.storagePath},{authMode:'userPool'});if(r.errors?.length)throw new Error(r.errors[0].message);await remove({path:item.storagePath}).catch(()=>undefined);await logAction('trash','Document',item.id,'Moved '+item.originalName+' to Trash');setMessage('Moved to Trash.');setUndoDoc(item);window.setTimeout(()=>setUndoDoc(null),5000);await load()}catch(e){if(trashPath)await remove({path:trashPath}).catch(()=>undefined);setMessage(e instanceof Error?e.message:'Trash failed.')}finally{setBusy('')}}
 async function restoreDoc(item:Document){setBusy(item.id);let restorePath='';try{restorePath=item.trashedFromPath||'public/'+item.id+(item.currentVersion&&item.currentVersion>1?'-v'+item.currentVersion:'')+'.pdf';await copy({source:{path:item.storagePath},destination:{path:restorePath}});const r=await client.models.Document.update({id:item.id,status:'published',storagePath:restorePath,trashedAt:null,trashedFromPath:null},{authMode:'userPool'});if(r.errors?.length)throw new Error(r.errors[0].message);await remove({path:item.storagePath}).catch(()=>undefined);await logAction('restore','Document',item.id,'Restored '+item.originalName);setMessage('Restored.');await load()}catch(e){if(restorePath)await remove({path:restorePath}).catch(()=>undefined);setMessage(e instanceof Error?e.message:'Restore failed.')}finally{setBusy('')}}
 async function permanentDelete(item:Document){
  if(!window.confirm('Permanently delete '+item.originalName+'? This cannot be undone.'))return;
  setBusy(item.id);
  try{
   const listed=await client.models.DocumentVersion.list({authMode:'userPool'});
   if(listed.errors?.length)throw new Error(listed.errors[0].message);
   const versions=listed.data.filter(x=>x.documentId===item.id);
   const r=await client.models.Document.delete({id:item.id},{authMode:'userPool'});
   if(r.errors?.length)throw new Error(r.errors[0].message);
   let metadataFailures=0;let cleanupFailures=0;let reservationFailures=0;
   for(const v of versions){
    try{const deleted=await client.models.DocumentVersion.delete({id:v.id},{authMode:'userPool'});if(deleted.errors?.length){metadataFailures++;continue}await remove({path:v.storagePath})}catch{cleanupFailures++}
   }
   try{await remove({path:item.storagePath})}catch{cleanupFailures++}
   if(item.fileHash){try{const held=await client.models.HashReservation.get({id:item.fileHash},{authMode:'userPool'});if(held.errors?.length)reservationFailures++;else if(held.data?.status==='published'&&held.data.documentId===item.id){const released=await client.models.HashReservation.delete({id:item.fileHash},{authMode:'userPool'});if(released.errors?.length)reservationFailures++}}catch{reservationFailures++}}
   await logAction('permanent_delete','Document',item.id,'Permanently deleted '+item.originalName).catch(()=>undefined);
   await load().catch(()=>undefined);
   setMessage(metadataFailures||cleanupFailures||reservationFailures?'Record deleted, but cleanup was incomplete ('+metadataFailures+' version record(s), '+cleanupFailures+' file(s), '+reservationFailures+' hash reservation(s)).':'Permanently deleted.');
  }catch(e){setMessage(e instanceof Error?e.message:'Permanent deletion failed.')}finally{setBusy('')}
 }
 async function bulkTrash(){if(!selectedIds.length||!window.confirm('Move the selected PDFs to Trash?'))return;let failed=0;for(const id of selectedIds){const d=docs.find(x=>x.id===id);if(d&&d.status!=='trashed'&&!await trashDocSilent(d))failed++}setSelectedIds([]);await load();if(failed)setMessage(failed+' file(s) could not be moved to Trash; their originals were kept.')}

 async function trashDocSilent(item:Document):Promise<boolean>{
  let trash='';let copied=false;
  try{
   trash='trash/'+item.id+'.pdf';
   await copy({source:{path:item.storagePath},destination:{path:trash}});copied=true;
   const r=await client.models.Document.update({id:item.id,status:'trashed',storagePath:trash,trashedAt:new Date().toISOString(),trashedFromPath:item.storagePath},{authMode:'userPool'});
   if(r.errors?.length)throw new Error(r.errors[0].message);
   await remove({path:item.storagePath}).catch(()=>undefined);
   await logAction('trash','Document',item.id,'Bulk moved '+item.originalName);
   return true;
  }catch{if(copied)await remove({path:trash}).catch(()=>undefined);return false}
 }
 async function approveSelected(){for(const id of selectedIds){const s=pending.find(x=>x.id===id);if(s&&s.status==='pending')await approve(s)}setSelectedIds([])}

 const MAX_SECTION_DEPTH=3;
 const sectionPath=(id:string)=>{const out:string[]=[];let cur=sectionMap.get(id)||null;const seen=new Set<string>();while(cur&&!seen.has(cur.id)){seen.add(cur.id);out.unshift(cur.name||'Unnamed');cur=cur.parentId?sectionMap.get(cur.parentId)||null:null}return out.join(' / ')};
 const isSectionDescendant=(candidateId:string,ancestorId:string)=>{let cur=sectionMap.get(candidateId)||null;const seen=new Set<string>();while(cur&&cur.parentId&&!seen.has(cur.id)){if(cur.parentId===ancestorId)return true;seen.add(cur.id);cur=sectionMap.get(cur.parentId)||null}return false};
 const sectionDepthForParent=(candidateParentId:string|undefined,movingId?:string)=>{let depth=1,current=candidateParentId||null;const seen=new Set<string>();while(current){if(current===movingId)return Number.POSITIVE_INFINITY;if(seen.has(current))return Number.POSITIVE_INFINITY;seen.add(current);const parent=sectionMap.get(current);if(!parent)return Number.POSITIVE_INFINITY;depth++;current=parent.parentId||null}return depth};
 const sectionSubtreeHeight=(rootId:string)=>{const children=new Map<string,string[]>();sections.forEach(s=>{if(s.parentId){const a=children.get(s.parentId)||[];a.push(s.id);children.set(s.parentId,a)}});const walk=(id:string,seen=new Set<string>()):number=>{if(seen.has(id))return Number.POSITIVE_INFINITY;const next=new Set(seen);next.add(id);const kids=children.get(id)||[];return kids.length?1+Math.max(...kids.map(k=>walk(k,next))):1};return walk(rootId)};
 const siblingNameExists=(candidateName:string,candidateParentId:string|undefined,excludeId?:string)=>sections.some(s=>s.id!==excludeId&&(s.parentId||'')===(candidateParentId||'')&&norm(s.name)===norm(candidateName));
 const sectionRows=useMemo(()=>{const byParent=new Map<string,Section[]>();sections.forEach(s=>{const key=s.parentId||'';const arr=byParent.get(key)||[];arr.push(s);byParent.set(key,arr)});for(const arr of byParent.values())arr.sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)||norm(a.name).localeCompare(norm(b.name)));const rows:{section:Section;depth:number}[]=[];const seen=new Set<string>();const walk=(parentId:string|undefined,depth:number)=>{for(const s of byParent.get(parentId||'')||[]){if(seen.has(s.id))continue;seen.add(s.id);rows.push({section:s,depth});walk(s.id,depth+1)}};walk(undefined,1);for(const s of sections)if(!seen.has(s.id))rows.push({section:s,depth:1});return rows},[sections]);
 const sectionParentOptions=useMemo(()=>sectionRows.filter(({section})=>section.id!==editingSection?.id&&!isSectionDescendant(section.id,editingSection?.id||'')&&(!editingSection?sectionDepthForParent(section.id)+1<=MAX_SECTION_DEPTH:sectionDepthForParent(section.id,editingSection.id)+sectionSubtreeHeight(editingSection.id)<=MAX_SECTION_DEPTH)).map(({section})=>({section,label:sectionPath(section.id)})),[sectionRows,editingSection,sections]);
 async function addSection(){const cleanName=name.trim();const newParentId=parentId||undefined;if(!cleanName){setMessage('Section name is required.');return}if(newParentId&&!sectionMap.has(newParentId)){setMessage('Selected parent section no longer exists.');return}if(editingSection){if(newParentId===editingSection.id){setMessage('A section cannot be its own parent.');return}if(newParentId&&isSectionDescendant(newParentId,editingSection.id)){setMessage('A section cannot be moved inside its own descendant.');return}const subtreeHeight=sectionSubtreeHeight(editingSection.id);if(!Number.isFinite(subtreeHeight)){setMessage('The existing section hierarchy contains a cycle. Fix that hierarchy before moving this section.');return}if(newParentId&&sectionDepthForParent(newParentId,editingSection.id)+subtreeHeight>MAX_SECTION_DEPTH){setMessage('Moving this section would make a descendant deeper than the 3-level limit.');return}if(siblingNameExists(cleanName,newParentId,editingSection.id)){setMessage('Another section with this name already exists here.');return}const r=await client.models.Section.update({id:editingSection.id,name:cleanName,description:description.trim(),parentId:newParentId},{authMode:'userPool'});if(r.errors?.length){setMessage(r.errors[0].message);return}await logAction('section_update','Section',editingSection.id,'Updated section '+cleanName).catch(()=>undefined);setEditingSection(null);setName('');setDescription('');setParentId('');setMessage('Section updated.');await load();return}if(newParentId&&sectionDepthForParent(newParentId)+1>MAX_SECTION_DEPTH){setMessage('Maximum section depth is 3 levels.');return}if(siblingNameExists(cleanName,newParentId)){setMessage('Another section with this name already exists here.');return}const r=await client.models.Section.create({name:cleanName,description:description.trim(),sortOrder:sections.filter(s=>(s.parentId||'')===(newParentId||'')).length+1,parentId:newParentId},{authMode:'userPool'});if(r.errors?.length){setMessage(r.errors[0].message);return}await logAction('section_create','Section',r.data?.id,'Created section '+cleanName).catch(()=>undefined);setName('');setDescription('');setParentId('');await load()}
 async function moveSection(s:Section,dir:-1|1){const siblings=sections.filter(x=>(x.parentId||'')===(s.parentId||'')).sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0));const i=siblings.findIndex(x=>x.id===s.id),j=i+dir;if(i<0||j<0||j>=siblings.length)return;const other=siblings[j];const r1=await client.models.Section.update({id:s.id,sortOrder:other.sortOrder},{authMode:'userPool'});if(r1.errors?.length){setMessage(r1.errors[0].message);return}const r2=await client.models.Section.update({id:other.id,sortOrder:s.sortOrder},{authMode:'userPool'});if(r2.errors?.length){await client.models.Section.update({id:s.id,sortOrder:s.sortOrder},{authMode:'userPool'});setMessage(r2.errors[0].message);await load();return}await logAction('section_reorder','Section',s.id,'Reordered '+s.name).catch(()=>undefined);await load()}
 async function confirmDeleteSection(){const s=deleteSection;if(!s)return;const affected=docs.filter(d=>d.sectionId===s.id);const destination=deleteDestination||undefined;if(affected.length&&!destination){setMessage('Choose where affected PDFs should move.');return}if(destination&&(destination===s.id||!sectionMap.has(destination)||isSectionDescendant(destination,s.id))){setMessage('Choose a destination outside the section being deleted.');return}const movedDocs:{id:string;sectionId:string}[]=[];const movedChildren:{id:string;parentId:string|undefined}[]=[];try{for(const d of affected){const r=await client.models.Document.update({id:d.id,sectionId:destination},{authMode:'userPool'});if(r.errors?.length)throw new Error(r.errors[0].message);movedDocs.push({id:d.id,sectionId:s.id})}for(const child of sections.filter(x=>x.parentId===s.id)){const r=await client.models.Section.update({id:child.id,parentId:s.parentId||undefined},{authMode:'userPool'});if(r.errors?.length)throw new Error(r.errors[0].message);movedChildren.push({id:child.id,parentId:s.id})}const deleted=await client.models.Section.delete({id:s.id},{authMode:'userPool'});if(deleted.errors?.length)throw new Error(deleted.errors[0].message);await logAction('section_delete','Section',s.id,'Deleted '+s.name,{movedDocuments:affected.length,destination:destination||null}).catch(()=>undefined);setDeleteSection(null);setDeleteDestination('');setMessage('Section deleted.');await load()}catch(e){for(const d of movedDocs)await client.models.Document.update({id:d.id,sectionId:d.sectionId},{authMode:'userPool'}).catch(()=>undefined);for(const child of movedChildren)await client.models.Section.update({id:child.id,parentId:child.parentId},{authMode:'userPool'}).catch(()=>undefined);setMessage(e instanceof Error?e.message:'Section deletion failed. If any rollback step failed, reload and verify the affected sections.');await load().catch(()=>undefined)}} async function replaceDoc(item:Document,file:File){
 setBusy(item.id);
 let reservedHash='';let historyId='';let archivePath='';let newPath='';let documentUpdated=false;let rollbackFailed=false;let cleanupWarning=false;
 try{
  if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf'))throw new Error('PDF files only.');
  if(file.size>MAX)throw new Error('Maximum file size is 50 MB.');
  await assertPdfHeader(file);const h=await hashFile(file),m=await metaFile(file);
  if(docs.some(d=>d.id!==item.id&&d.fileHash===h))throw new Error('This replacement is already published.');
  const existingLock=await client.models.HashReservation.get({id:h},{authMode:'userPool'});
  if(existingLock.errors?.length)throw new Error(existingLock.errors[0].message);
  if(existingLock.data){
   if(existingLock.data.documentId!==item.id||existingLock.data.status!=='published')throw new Error('This replacement hash is already reserved or published.');
  }else{
   const lock=await client.models.HashReservation.create({id:h,status:'pending',documentId:item.id},{authMode:'userPool'});
   if(lock.errors?.length||!lock.data)throw new Error('This replacement hash is already reserved or published.');
   reservedHash=h;
  }
  const versions=await client.models.DocumentVersion.list({authMode:'userPool'});
  if(versions.errors?.length)throw new Error(versions.errors[0].message);
  const current=Math.max(item.currentVersion||1,...versions.data.filter(v=>v.documentId===item.id).map(v=>v.versionNumber||0));
  archivePath='archive/'+item.id+'-v'+current+'.pdf';
  await copy({source:{path:item.storagePath},destination:{path:archivePath}});
  const history=await client.models.DocumentVersion.create({documentId:item.id,versionNumber:current,originalName:item.originalName,storagePath:archivePath,size:item.size,pageCount:item.pageCount,title:item.title,author:item.author,fileHash:item.fileHash,createdBy:'admin'},{authMode:'userPool'});
  if(history.errors?.length||!history.data)throw new Error(history.errors?.[0]?.message||'Could not save the previous PDF version.');
  historyId=history.data.id;
  newPath='public/'+item.id+'-v'+(current+1)+'.pdf';
  await uploadData({path:newPath,data:file,options:{contentType:'application/pdf'}}).result;
  const updated=await client.models.Document.update({id:item.id,storagePath:newPath,size:file.size,originalName:file.name.slice(0,180),pageCount:m.pages,title:m.title,author:m.author,fileHash:h,processingStatus:'complete',currentVersion:current+1,publishedAt:new Date().toISOString(),status:'published'},{authMode:'userPool'});
  if(updated.errors?.length)throw new Error(updated.errors[0].message);
  documentUpdated=true;
  const promoted=await client.models.HashReservation.update({id:h,status:'published',documentId:item.id},{authMode:'userPool'});
  if(promoted.errors?.length)throw new Error(promoted.errors[0].message);
  reservedHash='';
  if(item.fileHash&&item.fileHash!==h){
   const oldLock=await client.models.HashReservation.get({id:item.fileHash},{authMode:'userPool'});
   if(oldLock.errors?.length)cleanupWarning=true;
   else if(oldLock.data?.documentId===item.id){
    const released=await client.models.HashReservation.delete({id:item.fileHash},{authMode:'userPool'});
    if(released.errors?.length)cleanupWarning=true;
   }
  }
  try{await remove({path:item.storagePath})}catch{cleanupWarning=true}
  await logAction('replace','Document',item.id,'Replaced '+item.originalName,{version:current+1}).catch(()=>undefined);
  await load().catch(()=>undefined);
  setMessage(cleanupWarning?'PDF replaced, but old-version cleanup needs attention.':'PDF replaced.');
 }catch(e){
  if(documentUpdated){
   const restore=await client.models.Document.update({id:item.id,originalName:item.originalName,storagePath:item.storagePath,size:item.size,sectionId:item.sectionId,status:item.status,pageCount:item.pageCount,title:item.title,author:item.author,thumbnailPath:item.thumbnailPath,fileHash:item.fileHash,processingStatus:item.processingStatus,processingError:item.processingError,publishedAt:item.publishedAt,trashedAt:item.trashedAt,trashedFromPath:item.trashedFromPath,currentVersion:item.currentVersion},{authMode:'userPool'});
   if(restore.errors?.length)rollbackFailed=true;
  }
  if(historyId)await client.models.DocumentVersion.delete({id:historyId},{authMode:'userPool'}).catch(()=>undefined);
  if(archivePath)await remove({path:archivePath}).catch(()=>undefined);
  if(newPath)await remove({path:newPath}).catch(()=>undefined);
  if(reservedHash)await client.models.HashReservation.delete({id:reservedHash},{authMode:'userPool'}).catch(()=>undefined);
  setMessage(rollbackFailed?'Replacement failed and rollback was incomplete.':e instanceof Error?e.message:'Replacement failed.');
 }finally{setBusy('')}
}
 async function resolveReport(r:Report){const next=(r.status??'open')==='open'?'resolved':'open';await client.models.Report.update({id:r.id,status:next,reviewedAt:next==='resolved'?new Date().toISOString():null,reviewedBy:'admin'},{authMode:'userPool'});await logAction('report_'+next,'Report',r.id,'Marked report '+next);await load()}

 if(allowed===null)return <div className={styles.shell+' '+styles.center}><span>Checking administrator access…</span></div>;
 if(!allowed)return <div className={styles.shell+' '+styles.center}><div className={styles.panel}><h2>Admin access required</h2><p className={styles.muted}>Your account is not in the ADMINS group.</p><Link className={styles.primary} href="/">Return to site</Link></div></div>;

 return (
  <div className={styles.shell}>
  <nav className={styles.nav}><div><div className={styles.brand}><span className={styles.mark}>✦</span>PaperDROPL <span className={styles.dim}>/ Admin</span></div><div className={styles.subbrand}>Library control center</div></div><div className={styles.actions}><Link className={styles.navLink} href="/">Public site</Link><button className={styles.iconButton} onClick={()=>setShortcutHelp(true)} title="Keyboard shortcuts">⌨</button><button className={styles.secondary} onClick={signOut}>Sign out</button></div></nav>
  <main className={styles.adminPanel}>
   <div className={styles.heroRow}><div><span className={styles.kicker}>CONTROL ROOM</span><h1>Keep the library clean, useful, and moving.</h1><p className={styles.muted}>Review submissions, publish responsibly, and manage every PDF lifecycle state from one dark dashboard.</p></div><div className={styles.notice}>{attentionCount}<span>items need attention</span></div></div>
   <div className={styles.overviewGrid}><Overview title="Published" value={docs.filter(d=>(d.status??'published')==='published').length} /><Overview title="Pending" value={pending.filter(x=>x.status==='pending').length} /><Overview title="Sections" value={sections.length} /><Overview title="Reports" value={reportFiltered.length} /></div>
   {message&&<div className={styles.message}>{message}{undoDoc&&<button type="button" className={styles.secondary} onClick={()=>{setUndoDoc(null);void restoreDoc(undoDoc)}}>Undo</button>}</div>}
   <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.kicker}>QUICK PUBLISH</span><h2>Upload & publish</h2><p className={styles.muted}>Drag multiple PDFs here or choose them. Each file gets its own progress, section, and retry state.</p></div><select className={styles.field} value={queueSection} onChange={e=>setQueueSection(e.target.value)}><option value="">Default section</option>{sectionRows.map(({section:s})=><option value={s.id} key={s.id}>{sectionPath(s.id)}</option>)}</select></div><div className={styles.dropzone+(drag?' '+styles.dragging:'')} onDragEnter={e=>{e.preventDefault();setDrag(true)}} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={e=>{e.preventDefault();setDrag(false)}} onDrop={e=>{e.preventDefault();setDrag(false);qadd(e.dataTransfer.files)}} onClick={()=>document.getElementById('admin-queue-file')?.click()}><input id="admin-queue-file" hidden type="file" multiple accept="application/pdf,.pdf" onChange={e=>{if(e.target.files)qadd(e.target.files);e.currentTarget.value=''}}/><strong>Drop PDFs here</strong><span>or tap to choose · 50 MB max each</span></div>{queue.length>0&&<div className={styles.queue}>{queue.map(item=><div className={styles.queueItem} key={item.id}><div className={styles.pdfBadge}>PDF</div><div className={styles.queueCopy}><b>{item.file.name}</b><span>{size(item.file.size)} · {item.status==='uploading'?item.progress+'%':item.status}</span></div><select className={styles.compactField} disabled={busy==='queue'||item.status==='done'} value={item.sectionId} onChange={e=>qpatch(item.id,{sectionId:e.target.value})}>{sectionRows.map(({section:s})=><option key={s.id} value={s.id}>{sectionPath(s.id)}</option>)}</select>{item.status==='uploading'&&<div className={styles.progress}><i style={{width:item.progress+'%'}}/></div>}{item.error&&<small className={styles.dangerText}>{item.error}</small>}<div className={styles.queueActions}>{item.status==='error'&&<button className={styles.textButton} onClick={()=>qpatch(item.id,{status:'queued',error:undefined})}>Retry</button>}{item.status!=='done'&&<button className={styles.textButton} disabled={busy==='queue'} onClick={()=>setQueue(q=>q.filter(x=>x.id!==item.id))}>Remove</button>}{item.status==='done'&&<span className={styles.successText}>✓ Done</span>}</div></div>)}</div>}<div className={styles.panelFoot}><span>{queue.filter(x=>x.status==='done').length} complete · {queue.filter(x=>x.status!=='done').length} remaining</span><button className={styles.primary} disabled={busy==='queue'||!queue.some(x=>x.status==='queued'||x.status==='error')} onClick={()=>void publishQueue()}>{busy==='queue'?'Publishing…':'Publish all'}</button></div></section>

   <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.kicker}>REVIEW QUEUE</span><h2>Pending submissions <span className={styles.count}>{pendingFiltered.length}</span></h2><p className={styles.muted}>Preview the submitted PDF, then approve or reject it.</p></div>{selectedIds.length>0&&<div className={styles.bulkBar}><b>{selectedIds.length} selected</b><button className={styles.secondary} onClick={toggleAllPending}>Select all</button><button className={styles.okButton} onClick={()=>void approveSelected()}>Approve</button><button className={styles.dangerButton} onClick={()=>void rejectSelected()}>Reject</button></div>}</div><div className={styles.statusTabs}>{[['all','All'],['pending','Pending'],['approved','Approved'],['rejected','Rejected']].map(([v,l])=><button type="button" key={v} className={submissionFilter===v?styles.tabActive:styles.tab} onClick={()=>setSubmissionFilter(v)}>{l}</button>)}</div><div className={styles.filters}><input ref={searchRef} className={styles.field} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search PDFs, sections, reports…" /><select className={styles.field} value={sectionFilter} onChange={e=>setSectionFilter(e.target.value)}><option value="all">All sections</option>{sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><select className={styles.field} value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest</option><option value="az">A–Z</option><option value="size">Largest</option></select><select className={styles.field} value={dateFilter} onChange={e=>setDateFilter(e.target.value)}><option value="all">Any date</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></div>{pendingFiltered.length?<div className={styles.cardGrid}>{pendingFiltered.map(item=><SubmissionCard key={item.id} item={item} section={sectionMap.get(item.sectionId)} checked={selectedIds.includes(item.id)} busy={busy} onToggle={()=>setSelectedIds(v=>v.includes(item.id)?v.filter(x=>x!==item.id):[...v,item.id])} onOpen={()=>openDetail(item)} onApprove={()=>void approve(item)} onReject={()=>void reject(item)}/>)}</div>:<Empty text="No pending submissions."/>}</section>

   <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.kicker}>LIBRARY</span><h2>Published & Trash <span className={styles.count}>{publishedDocs.length}</span></h2><p className={styles.muted}>Move to Trash instead of immediate deletion. Restore or permanently delete from there.</p></div><div className={styles.bulkBar}>{selectedIds.length>0&&<><b>{selectedIds.length} selected</b><button className={styles.dangerButton} onClick={()=>void bulkTrash()}>Trash selected</button><button className={styles.textButton} onClick={()=>setSelectedIds([])}>Clear</button></>}</div></div><div className={styles.statusTabs}>{[['attention','Active + Trash'],['published','Published'],['trash','Trash']].map(([v,l])=><button key={v} className={statusFilter===v?styles.tabActive:styles.tab} onClick={()=>setStatusFilter(v)}>{l}</button>)}</div>{publishedDocs.length?<div className={styles.cardGrid}>{publishedDocs.map(doc=><DocumentCard key={doc.id} doc={doc} section={sectionMap.get(doc.sectionId)} checked={selectedIds.includes(doc.id)} busy={busy} onToggle={()=>setSelectedIds(v=>v.includes(doc.id)?v.filter(x=>x!==doc.id):[...v,doc.id])} onOpen={()=>openDetail(doc)} onTrash={()=>void trashDoc(doc)} onRestore={()=>void restoreDoc(doc)} onPermanent={()=>void permanentDelete(doc)} onReplace={()=>{setReplaceTarget(doc);setDetail(doc);replaceInput.current?.click()}}/>)}</div>:<Empty text="No documents match the current filters."/>}</section>
   <input ref={replaceInput} hidden type="file" accept="application/pdf,.pdf" onChange={e=>{const f=e.target.files?.[0];if(f&&replaceTarget)void replaceDoc(replaceTarget,f);setReplaceTarget(null);e.currentTarget.value=''}}/>

   <section className={styles.twoCol}>
    <section className={styles.panel}>
     <div className={styles.panelHead}>
      <div>
       <span className={styles.kicker}>SECTIONS</span>
       <h2>Section manager</h2>
       <p className={styles.muted}>Nested sections are supported up to a practical three-level hierarchy.</p>
      </div>
     </div>
     <div className={styles.sectionForm}>
      <input className={styles.field} value={name} onChange={e=>setName(e.target.value)} placeholder="Section name" />
      <input className={styles.field} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Description" />
      <select className={styles.field} value={parentId} onChange={e=>setParentId(e.target.value)}>
       <option value="">Top-level</option>
       {sections.map(s=><option key={s.id} value={s.id}>Child of {s.name}</option>)}
      </select>
      <button className={styles.primary} disabled={!name.trim()} onClick={()=>void addSection()}>
       {editingSection?'Save changes':'Add section'}
      </button>
      {editingSection&&
       <button className={styles.secondary} onClick={()=>{setEditingSection(null);setName('');setDescription('');setParentId('')}}>
        Cancel
       </button>}
     </div>
     <div className={styles.sectionTree}>
      {sectionRows.map(({section:s,depth})=>(
       <div className={styles.sectionRow} key={s.id}>
        <div className={styles.treeIndent} style={{marginLeft:Math.min(54,(depth-1)*18)}}>
         <b>{s.name}</b>
         <span>{docCount.get(s.id)||0} PDFs · {childCount.get(s.id)||0} children · Level {depth}</span>
        </div>
        <div className={styles.actions}>
         <button className={styles.iconButton} onClick={()=>void moveSection(s,-1)} title="Move up">↑</button>
         <button className={styles.iconButton} onClick={()=>void moveSection(s,1)} title="Move down">↓</button>
         <button className={styles.textButton} onClick={()=>{setEditingSection(s);setName(s.name);setDescription(s.description||'');setParentId(s.parentId||'')}}>Use</button>
         <button className={styles.dangerLink} onClick={()=>{setDeleteSection(s);setDeleteDestination(s.parentId||'')}}>Delete</button>
        </div>
       </div>
      ))}
     </div>
    </section>
    <section className={styles.panel}>
     <div className={styles.panelHead}>
      <div>
       <span className={styles.kicker}>REPORTS</span>
       <h2>Problem PDFs <span className={styles.count}>{reportFiltered.length}</span></h2>
       <p className={styles.muted}>User reports land here without exposing private submission files.</p>
      </div>
     </div>
     {reportFiltered.length ? reportFiltered.map(r=>(
      <div className={styles.reportRow} key={r.id}>
       <div>
        <b>{docs.find(d=>d.id===r.documentId)?.originalName||'Unknown PDF'}</b>
        <span>{r.reason} · {date(r.createdAt)}</span>
        <p>{r.description||'No details.'}</p>
       </div>
       <button className={styles.secondary} onClick={()=>void resolveReport(r)}>Resolve</button>
      </div>
     )) : <Empty text="No open reports."/>}
    </section>
   </section>

   <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.kicker}>ACTIVITY</span><h2>Recent admin activity</h2></div><input className={styles.field} value={activityQuery} onChange={e=>setActivityQuery(e.target.value)} placeholder="Search activity…" /></div>{activityFiltered.length?activityFiltered.slice(0,18).map(a=><div className={styles.activityRow} key={a.id}><span className={styles.activityDot}/><div><b>{a.summary}</b><span>{a.action} · {date(a.createdAt)}</span></div></div>):<Empty text="No activity yet."/>}</section>
  </main>
  {detail&&<div className={styles.drawerBackdrop} onMouseDown={e=>{if(e.currentTarget===e.target)setDetail(null)}}><aside className={styles.drawer}><button className={styles.drawerClose} onClick={()=>setDetail(null)}>×</button><span className={styles.kicker}>{'status' in detail?(detail.status||'pending').toUpperCase():'DOCUMENT'}</span><h2>{detail.originalName}</h2><div className={styles.previewBox}>{detailUrl?<button className={styles.previewButton} onClick={()=>window.open(detailUrl,'_blank','noopener,noreferrer')}>Open PDF preview ↗</button>:<span>Loading preview…</span>}</div><div className={styles.detailGrid}><div><span>Section</span><b>{sectionMap.get(detail.sectionId)?.name||'Unknown'}</b></div><div><span>Size</span><b>{size(detail.size)}</b></div><div><span>Pages</span><b>{'pageCount' in detail&&detail.pageCount||'—'}</b></div><div><span>Updated</span><b>{date(detail.updatedAt||detail.createdAt)}</b></div></div>{'title' in detail&&detail.title&&<p><b>Title:</b> {detail.title}</p>}{'author' in detail&&detail.author&&<p><b>Author:</b> {detail.author}</p>}<div className={styles.drawerActions}>{'status' in detail&&detail.status==='pending'&&<><button className={styles.okButton} disabled={!!busy} onClick={()=>void approve(detail as Submission)}>Approve</button><button className={styles.dangerButton} disabled={!!busy} onClick={()=>void reject(detail as Submission)}>Reject</button></>}{'status' in detail&&(detail.status??'published')==='published'&&<><button className={styles.dangerButton} disabled={!!busy} onClick={()=>void trashDoc(detail as Document)}>Trash</button><button className={styles.secondary} onClick={()=>{setReplaceTarget(detail as Document);replaceInput.current?.click()}}>Replace PDF</button></>}{'status' in detail&&detail.status==='trashed'&&<><button className={styles.okButton} disabled={!!busy} onClick={()=>void restoreDoc(detail as Document)}>Restore</button><button className={styles.dangerButton} disabled={!!busy} onClick={()=>void permanentDelete(detail as Document)}>Permanently delete</button></>}</div></aside></div>}
  {deleteSection&&<div className={styles.modalBackdrop}><div className={styles.confirmModal}><h2>Delete {deleteSection.name}?</h2><p>This affects {docCount.get(deleteSection.id)||0} PDFs and {childCount.get(deleteSection.id)||0} child sections. Choose where PDFs should go before deletion.</p>{(docCount.get(deleteSection.id)||0)>0&&<select className={styles.field} value={deleteDestination} onChange={e=>setDeleteDestination(e.target.value)}><option value="">Choose destination</option>{sectionRows.filter(({section:s})=>s.id!==deleteSection.id&&!isSectionDescendant(s.id,deleteSection.id)).map(({section:s})=><option key={s.id} value={s.id}>{sectionPath(s.id)}</option>)}</select>}<div className={styles.drawerActions}><button className={styles.secondary} onClick={()=>setDeleteSection(null)}>Cancel</button><button className={styles.dangerButton} onClick={()=>void confirmDeleteSection()}>Delete section</button></div></div></div>}
  {shortcutHelp&&<div className={styles.modalBackdrop}><div className={styles.confirmModal}><h2>Keyboard shortcuts</h2><p><b>Ctrl/Cmd + K</b> focus search</p><p><b>P</b> preview selected detail</p><p><b>Esc</b> close drawers/modals</p><p><b>A</b> and <b>R</b> are reserved for the focused review flow.</p><button className={styles.primary} onClick={()=>setShortcutHelp(false)}>Done</button></div></div>}
  </div>
  );
 }
function Overview({title,value}:{title:string;value:number}){return <div className={styles.overview}><span>{title}</span><b>{value}</b></div>}
function Empty({text}:{text:string}){return <div className={styles.empty}>{text}</div>}
function SubmissionCard({item,section,checked,busy,onToggle,onOpen,onApprove,onReject}:{item:Submission;section?:Section;checked:boolean;busy:string;onToggle:()=>void;onOpen:()=>void;onApprove:()=>void;onReject:()=>void}){return <article className={styles.card}><div className={styles.thumb}><div className={styles.pdfBadge}>PDF</div><span>Preview available</span></div><div className={styles.cardBody}><div className={styles.cardTop}><label><input type="checkbox" checked={checked} onChange={onToggle}/></label><span className={item.status==='pending'?styles.statusPending:item.status==='approved'?styles.statusLive:styles.statusTrash}>{(item.status||'unknown').toUpperCase()}</span></div><h3 title={item.originalName}>{item.originalName}</h3><p>{section?.name||'Unknown'} · {size(item.size)} · {item.pageCount||'—'} pages</p><small>{date(item.createdAt)}</small></div><div className={styles.cardActions}><button className={styles.secondary} disabled={!!busy||item.status!=='pending'} onClick={onOpen}>Preview</button><button className={styles.okButton} disabled={!!busy||item.status!=='pending'} onClick={onApprove}>Approve</button><button className={styles.dangerButton} disabled={!!busy||item.status!=='pending'} onClick={onReject}>Reject</button></div></article>}
function DocumentCard({doc,section,checked,busy,onToggle,onOpen,onTrash,onRestore,onPermanent,onReplace}:{doc:Document;section?:Section;checked:boolean;busy:string;onToggle:()=>void;onOpen:()=>void;onTrash:()=>void;onRestore:()=>void;onPermanent:()=>void;onReplace:()=>void}){const trash=doc.status==='trashed';return <article className={styles.card}><div className={styles.thumb}><div className={styles.pdfBadge}>PDF</div><span>{trash?'In Trash':'Ready'}</span></div><div className={styles.cardBody}><div className={styles.cardTop}><label><input type="checkbox" checked={checked} onChange={onToggle}/></label><span className={trash?styles.statusTrash:styles.statusLive}>{trash?'TRASHED':'PUBLISHED'}</span></div><h3 title={doc.originalName}>{doc.originalName}</h3><p>{section?.name||'Unknown'} · {size(doc.size)} · {doc.pageCount||'—'} pages</p><small>{date(doc.updatedAt||doc.createdAt)} {doc.currentVersion&&doc.currentVersion>1?' · v'+doc.currentVersion:''}</small></div><div className={styles.cardActions}><button className={styles.secondary} onClick={onOpen}>Preview</button>{trash?<><button className={styles.okButton} disabled={!!busy} onClick={onRestore}>Restore</button><button className={styles.dangerButton} disabled={!!busy} onClick={onPermanent}>Delete forever</button></>:<><button className={styles.secondary} disabled={!!busy} onClick={onReplace}>Replace</button><button className={styles.dangerButton} disabled={!!busy} onClick={onTrash}>Trash</button></>}</div></article>}





