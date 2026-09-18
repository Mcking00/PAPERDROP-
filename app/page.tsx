'use client';

import { useEffect, useMemo, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import { uploadData } from 'aws-amplify/storage';
import type { Schema } from '@/amplify/data/resource';
import Link from 'next/link';

const client = generateClient<Schema>();

export default function Home() {
  const [sections, setSections] = useState<Schema['Section']['type'][]>([]);
  const [docs, setDocs] = useState<Schema['Document']['type'][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [docSearch, setDocSearch] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sectionId, setSectionId] = useState('');
  const [message, setMessage] = useState('Files remain private until approved.');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [s, d] = await Promise.all([
      client.models.Section.list({ authMode: 'identityPool' }),
      client.models.Document.list({ authMode: 'identityPool' }),
    ]);
    setSections(s.data.sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)));
    setDocs(d.data);
    if (!sectionId && s.data[0]) setSectionId(s.data[0].id);
  }

  useEffect(() => { load().catch(console.error); }, []);

  const visibleSections = useMemo(() => sections.filter(s => (s.name ?? '').toLowerCase().includes(search.toLowerCase())), [sections, search]);
  const current = sections.find(s => s.id === selected);
  const currentDocs = docs.filter(d => d.sectionId === selected && (d.originalName ?? '').toLowerCase().includes(docSearch.toLowerCase()));

  async function submit() {
    if (!file) return setMessage('Choose a PDF first.');
    if (file.type !== 'application/pdf') return setMessage('Only PDF files are accepted.');
    if (file.size > 50 * 1024 * 1024) return setMessage('Maximum file size is 50 MB.');
    if (!sectionId) return setMessage('Choose a section.');
    setBusy(true); setMessage('Uploading for review…');
    try {
      const id = crypto.randomUUID();
      const path = `pending/${id}.pdf`;
      await uploadData({ path, data: file, options: { contentType: 'application/pdf' } }).result;
      const result = await client.models.Submission.create({
        originalName: file.name.slice(0, 180), storagePath: path, size: file.size,
        sectionId, status: 'pending', createdAt: new Date().toISOString(),
      }, { authMode: 'identityPool' });
      if (result.errors?.length) throw new Error(result.errors[0].message);
      setFile(null); setMessage('Submitted successfully. It will appear after admin approval.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Upload failed.'); }
    finally { setBusy(false); }
  }

  if (selected && current) return <div className="shell">
    <Nav />
    <main className="docs"><button className="back" onClick={() => { setSelected(null); setDocSearch(''); }}>← All sections</button>
      <div className="docsHead"><div><h2>{current.name}</h2><p className="muted">{current.description}</p></div><input className="search" value={docSearch} onChange={e=>setDocSearch(e.target.value)} placeholder="Search PDFs…" /></div>
      <div className="cards">{currentDocs.length ? currentDocs.map(d => <article className="pdfCard" key={d.id}><div className="pdfIcon">PDF</div><h3 title={d.originalName}>{d.originalName}</h3><div className="meta">{formatSize(d.size)} · {new Date(d.createdAt).toLocaleDateString()}</div><DocumentDownload path={d.storagePath} /></article>) : <div className="empty">No approved PDFs in this section.</div>}</div>
    </main>
  </div>;

  return <div className="shell"><Nav /><section className="hero"><span className="pill">PUBLIC PDF LIBRARY</span><h1>Find what you<br/>need, instantly.</h1><p>Browse approved documents and download PDFs. Visitor submissions are reviewed before publication.</p></section>
    <section className="submit"><div className="submitTitle">Submit a PDF for review</div><div className="formRow"><input className="fileInput" type="file" accept="application/pdf,.pdf" onChange={e=>setFile(e.target.files?.[0]??null)} /><select className="select" value={sectionId} onChange={e=>setSectionId(e.target.value)}>{sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button className="primary" disabled={busy} onClick={submit}>{busy?'Uploading…':'Submit'}</button></div><div className="hint">{message}</div></section>
    <input className="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search sections…" />
    <div className="grid">{visibleSections.length ? visibleSections.map((s,i)=>{const n=docs.filter(d=>d.sectionId===s.id).length;return <article className="sectionCard" key={s.id} onClick={()=>setSelected(s.id)}><div className="orb"/><h2>{s.name}</h2><p>{s.description || 'Browse documents in this section.'}</p><span className="open">Open section →</span><span className="count">{n} PDF{n===1?'':'s'}</span></article>}) : <div className="empty">No sections found.</div>}</div>
  </div>;
}

function Nav(){return <nav className="nav"><div className="brand"><span className="mark">↗</span>PaperDrop</div><Link className="navLink" href="/admin">Admin</Link></nav>}
function formatSize(n:number){return n<1048576?`${Math.max(1,Math.round(n/1024))} KB`:`${(n/1048576).toFixed(1)} MB`}
function DocumentDownload({path}:{path:string}){const [url,setUrl]=useState('');useEffect(()=>{import('aws-amplify/storage').then(({getUrl})=>getUrl({path}).then(r=>setUrl(r.url.toString())).catch(console.error))},[path]);return url?<a className="download" href={url} target="_blank" rel="noreferrer">Download PDF ↓</a>:<span className="small">Preparing download…</span>}
