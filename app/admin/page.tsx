'use client';

import { useEffect, useState } from 'react';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { uploadData, copy, remove } from 'aws-amplify/storage';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import Link from 'next/link';
import '@aws-amplify/ui-react/styles.css';
import styles from './admin.module.css';

const client = generateClient<Schema>();
type Section = Schema['Section']['type'];
type Submission = Schema['Submission']['type'];
type Document = Schema['Document']['type'];

export default function AdminPage() {
  return <Authenticator hideSignUp><AdminArea /></Authenticator>;
}

function AdminArea() {
  const { signOut } = useAuthenticator();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [pending, setPending] = useState<Submission[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [adminFile, setAdminFile] = useState<File | null>(null);
  const [adminSection, setAdminSection] = useState('');

  async function load() {
    const [p, d, s] = await Promise.all([
      client.models.Submission.list({ authMode: 'userPool' }),
      client.models.Document.list({ authMode: 'userPool' }),
      client.models.Section.list({ authMode: 'userPool' }),
    ]);
    setPending(p.data.filter(x => x.status === 'pending'));
    setDocs(d.data);
    const sorted = s.data.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    setSections(sorted);
    if (!adminSection && sorted[0]) setAdminSection(sorted[0].id);
  }

  useEffect(() => {
    fetchAuthSession().then(session => {
      const groups = session.tokens?.accessToken?.payload?.['cognito:groups'];
      const isAdmin = Array.isArray(groups) && groups.includes('ADMINS');
      setAllowed(isAdmin);
      if (isAdmin) load().catch(() => setMessage('Could not load admin data.'));
    }).catch(() => setAllowed(false));
  }, []);

  async function uploadDirectly() {
    if (!adminFile) return setMessage('Choose a PDF first.');
    if (adminFile.type !== 'application/pdf') return setMessage('Only PDF files are accepted.');
    if (adminFile.size > 50 * 1024 * 1024) return setMessage('Maximum file size is 50 MB.');
    if (!adminSection) return setMessage('Choose a section.');
    setBusy('upload'); setMessage('Publishing PDF…');
    try {
      const id = crypto.randomUUID();
      const path = `public/${id}.pdf`;
      await uploadData({ path, data: adminFile, options: { contentType: 'application/pdf' } }).result;
      const result = await client.models.Document.create({
        originalName: adminFile.name.slice(0, 180), storagePath: path,
        size: adminFile.size, sectionId: adminSection, createdAt: new Date().toISOString(),
      }, { authMode: 'userPool' });
      if (result.errors?.length) throw new Error(result.errors[0].message);
      setAdminFile(null); setMessage('PDF published successfully.');
      const input = document.getElementById('adminFile') as HTMLInputElement | null;
      if (input) input.value = '';
      await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Upload failed.'); }
    finally { setBusy(''); }
  }

  async function approve(item: Submission) {
    setBusy(item.id); setMessage('');
    try {
      const destination = `public/${item.id}.pdf`;
      await copy({ source: { path: item.storagePath }, destination: { path: destination } });
      const created = await client.models.Document.create({
        originalName: item.originalName, storagePath: destination, size: item.size,
        sectionId: item.sectionId, createdAt: new Date().toISOString(),
      }, { authMode: 'userPool' });
      if (created.errors?.length) throw new Error(created.errors[0].message);
      await remove({ path: item.storagePath });
      await client.models.Submission.update({ id: item.id, status: 'approved' }, { authMode: 'userPool' }).catch(() => undefined);
      await client.models.Submission.delete({ id: item.id }, { authMode: 'userPool' });
      setMessage('Published successfully.'); await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Approval failed.'); }
    finally { setBusy(''); }
  }

  async function reject(item: Submission) {
    if (!confirm(`Reject and delete ${item.originalName}?`)) return;
    setBusy(item.id); setMessage('');
    try {
      await remove({ path: item.storagePath });
      await client.models.Submission.delete({ id: item.id }, { authMode: 'userPool' });
      setMessage('Submission rejected.'); await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Reject failed.'); }
    finally { setBusy(''); }
  }

  async function deleteDoc(item: Document) {
    if (!confirm(`Delete ${item.originalName} permanently?`)) return;
    setBusy(item.id); setMessage('');
    try {
      await remove({ path: item.storagePath });
      await client.models.Document.delete({ id: item.id }, { authMode: 'userPool' });
      setMessage('Published PDF deleted.'); await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Delete failed.'); }
    finally { setBusy(''); }
  }

  async function addSection() {
    if (!name.trim()) return;
    setBusy('section');
    try {
      const result = await client.models.Section.create({
        name: name.trim(), description: description.trim(), sortOrder: sections.length + 1,
      }, { authMode: 'userPool' });
      if (result.errors?.length) throw new Error(result.errors[0].message);
      setName(''); setDescription(''); setMessage('Section added.'); await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not add section.'); }
    finally { setBusy(''); }
  }

  async function initializeSections() {
    setBusy('init');
    try {
      const defaults = [
        ['Graphics', 'Graphics and visual design resources'],
        ['Section 2', 'Add your PDFs here'], ['Section 3', 'Add your PDFs here'],
        ['Section 4', 'Add your PDFs here'], ['Section 5', 'Add your PDFs here'],
      ];
      for (let i = 0; i < defaults.length; i++) {
        await client.models.Section.create({ name: defaults[i][0], description: defaults[i][1], sortOrder: i + 1 }, { authMode: 'userPool' });
      }
      setMessage('Five starter sections created.'); await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Initialization failed.'); }
    finally { setBusy(''); }
  }

  if (allowed === null) return <div className={`${styles.shell} ${styles.center}`}><p>Checking administrator access…</p></div>;
  if (!allowed) return <div className={`${styles.shell} ${styles.center}`}><div className={styles.panel}><h2>Admin access required</h2><p className={styles.muted}>Your account is not in the ADMINS group.</p><Link className={styles.navLink} href="/">Return to site</Link></div></div>;

  return <div className={styles.shell}>
    <nav className={styles.nav}><div className={styles.brand}><span className={styles.mark}>↗</span>PaperDrop / Admin</div><div className={styles.actions}><Link className={styles.navLink} href="/">Public site</Link><button className={styles.secondary} onClick={signOut}>Sign out</button></div></nav>
    <main className={styles.adminPanel}><div className={styles.adminGrid}>
      <section className={styles.panel}><h2>Upload & publish</h2><p className={styles.muted}>Admin uploads go directly to the public library.</p><div className={styles.sectionForm}><input id="adminFile" className={styles.search} style={{margin:0}} type="file" accept="application/pdf,.pdf" onChange={e => setAdminFile(e.target.files?.[0] ?? null)} /><select className={styles.search} style={{margin:0}} value={adminSection} onChange={e => setAdminSection(e.target.value)}>{sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button className={styles.primary} disabled={busy === 'upload'} onClick={uploadDirectly}>{busy === 'upload' ? 'Publishing…' : 'Publish'}</button></div></section>
      <section className={styles.panel}><h2>Pending submissions ({pending.length})</h2><p className={styles.muted}>Nothing appears publicly until you approve it.</p>{pending.length ? pending.map(x => <div className={styles.item} key={x.id}><div><b>{x.originalName}</b><div className={styles.muted}>{sectionName(sections, x.sectionId)} · {formatSize(x.size)}</div></div><div className={styles.actions}><button className={`${styles.secondary} ${styles.ok}`} disabled={!!busy} onClick={() => approve(x)}>Approve & publish</button><button className={`${styles.secondary} ${styles.danger}`} disabled={!!busy} onClick={() => reject(x)}>Reject</button></div></div>) : <p className={styles.muted}>No pending submissions.</p>}</section>
      <section className={styles.panel}><h2>Sections</h2><p className={styles.muted}>The final odd-numbered card is automatically centered on the public site.</p>{sections.length === 0 && <button className={styles.primary} disabled={!!busy} onClick={initializeSections}>Create five starter sections</button>}{sections.map(s => <div className={styles.item} key={s.id}><div><b>{s.name}</b><div className={styles.muted}>{s.description}</div></div><span className={styles.small}>#{s.sortOrder}</span></div>)}<div className={styles.sectionForm} style={{marginTop:15}}><input className={styles.search} style={{margin:0}} value={name} onChange={e=>setName(e.target.value)} placeholder="New section name"/><input className={styles.search} style={{margin:0}} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Description"/><button className={styles.primary} disabled={busy === 'section' || !name.trim()} onClick={addSection}>Add</button></div></section>
      <section className={styles.panel}><h2>Published PDFs</h2>{docs.length ? docs.map(x => <div className={styles.item} key={x.id}><div><b>{x.originalName}</b><div className={styles.muted}>{sectionName(sections, x.sectionId)} · {formatSize(x.size)}</div></div><div className={styles.actions}><DocumentLink path={x.storagePath}/><button className={`${styles.secondary} ${styles.danger}`} disabled={!!busy} onClick={() => deleteDoc(x)}>Delete</button></div></div>) : <p className={styles.muted}>No published PDFs.</p>}</section>
      {message && <div className={`${styles.notice} ${styles.success}`}>{message}</div>}
    </div></main>
  </div>;
}
function sectionName(list: Section[], id: string) { return list.find(s => s.id === id)?.name ?? 'Unknown section'; }
function formatSize(n: number) { return n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`; }
function DocumentLink({path}:{path:string}) { const [url,setUrl]=useState(''); useEffect(()=>{import('aws-amplify/storage').then(({getUrl})=>getUrl({path}).then(r=>setUrl(r.url.toString())).catch(console.error))},[path]); return url ? <a className={styles.download} href={url} target="_blank" rel="noreferrer">View</a> : <span className={styles.small}>…</span>; }
