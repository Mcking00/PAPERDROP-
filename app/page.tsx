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
  const [uploadOpen, setUploadOpen] = useState(false);

  async function load() {
    const [s, d] = await Promise.all([
      client.models.Section.list({ authMode: 'identityPool' }),
      client.models.Document.list({ authMode: 'identityPool' }),
    ]);

    setSections(
      s.data.sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      )
    );

    setDocs(d.data);

    if (!sectionId && s.data[0]) {
      setSectionId(s.data[0].id);
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  const visibleSections = useMemo(
    () =>
      sections.filter((s) =>
        (s.name ?? '').toLowerCase().includes(search.toLowerCase())
      ),
    [sections, search]
  );

  const current = sections.find((s) => s.id === selected);

  const currentDocs = docs.filter(
    (d) =>
      d.sectionId === selected &&
      (d.originalName ?? '')
        .toLowerCase()
        .includes(docSearch.toLowerCase())
  );

  async function submit() {
    if (!file) {
      setMessage('Choose a PDF first.');
      return;
    }

    if (file.type !== 'application/pdf') {
      setMessage('Only PDF files are accepted.');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setMessage('Maximum file size is 50 MB.');
      return;
    }

    if (!sectionId) {
      setMessage('Choose a section.');
      return;
    }

    setBusy(true);
    setMessage('Uploading for review…');

    try {
      const id = crypto.randomUUID();
      const path = `pending/${id}.pdf`;

      await uploadData({
        path,
        data: file,
        options: {
          contentType: 'application/pdf',
        },
      }).result;

      const result = await client.models.Submission.create(
        {
          originalName: file.name.slice(0, 180),
          storagePath: path,
          size: file.size,
          sectionId,
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
        {
          authMode: 'identityPool',
        }
      );

      if (result.errors?.length) {
        throw new Error(result.errors[0].message);
      }

      setFile(null);
      setMessage(
        'Submitted successfully. It will appear after admin approval.'
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Upload failed.'
      );
    } finally {
      setBusy(false);
    }
  }

  if (selected && current) {
    return (
      <div className="siteShell">
        <Ambient />
        <Nav />

        <main className="docs pageIn">
          <button
            className="back"
            onClick={() => {
              setSelected(null);
              setDocSearch('');
            }}
          >
            ← All sections
          </button>

          <div className="docsHead">
            <div>
              <span className="eyebrow">LIBRARY / SECTION</span>
              <h2>{current.name}</h2>
              <p className="muted">{current.description}</p>
            </div>

            <input
              className="search"
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              placeholder="Search PDFs…"
            />
          </div>

          <div className="cards">
            {currentDocs.length ? (
              currentDocs.map((d, i) => (
                <article
                  className="pdfCard"
                  style={{
                    ['--delay' as string]: `${i * 55}ms`,
                  }}
                  key={d.id}
                >
                  <div className="pdfTop">
                    <div className="pdfIcon">PDF</div>
                    <span className="spark">✦</span>
                  </div>

                  <h3 title={d.originalName}>
                    {d.originalName}
                  </h3>

                  <div className="meta">
                    {formatSize(d.size)} ·{' '}
                    {new Date(d.createdAt).toLocaleDateString()}
                  </div>

                  <DocumentDownload path={d.storagePath} />
                </article>
              ))
            ) : (
              <div className="empty">
                No approved PDFs in this section.
              </div>
            )}
          </div>
        </main>

        <UploadBubble
          open={uploadOpen}
          setOpen={setUploadOpen}
          file={file}
          setFile={setFile}
          sectionId={sectionId}
          setSectionId={setSectionId}
          sections={sections}
          busy={busy}
          message={message}
          submit={submit}
        />
      </div>
    );
  }

  return (
    <div className="siteShell">
      <Ambient />
      <Nav />

      <main>
        {/* HERO */}
        <section className="hero pageIn">
          <div className="heroCopy">
            <span className="pill">
              <span className="statusDot" />
              PUBLIC PDF LIBRARY
            </span>

            <h1>
              <span>DROP.</span>
              <br />
              <em>DISCOVER.</em>
              <br />
              <span>KEEP.</span>
            </h1>

            <p>
              PaperDrop is a curated space for sharing useful
              documents. Browse approved PDFs, find what you need,
              and send new files into the review queue.
            </p>

            <div className="heroActions">
              <button
                className="heroButton"
                onClick={() =>
                  document
                    .getElementById('library')
                    ?.scrollIntoView({
                      behavior: 'smooth',
                    })
                }
              >
                Explore library <span>↓</span>
              </button>

              <span className="heroNote">
                Private until approved · 50 MB PDF limit
              </span>
            </div>
          </div>

          {/* ANIME HERO ART */}
          <div className="heroArt" aria-hidden="true">
            <div className="moon" />
            <div className="halo haloOne" />
            <div className="halo haloTwo" />

            <div className="paperPlane">
              <span>PDF</span>
            </div>

            <div className="katakana">
              ペーパー
              <br />
              ドロップ
            </div>

            <div className="heroLines" />

            <div className="star s1">✦</div>
            <div className="star s2">✧</div>
            <div className="star s3">✦</div>
          </div>
        </section>

        {/* STATS */}
        <section className="statsStrip">
          <div>
            <strong>{sections.length}</strong>
            <span>Collections</span>
          </div>

          <div>
            <strong>{docs.length}</strong>
            <span>Approved PDFs</span>
          </div>

          <div>
            <strong>50 MB</strong>
            <span>Max submission</span>
          </div>

          <div>
            <strong>100%</strong>
            <span>Review first</span>
          </div>
        </section>

        {/* LIBRARY */}
        <section className="library" id="library">
          <div className="sectionHeading">
            <div>
              <span className="eyebrow">THE ARCHIVE</span>

              <h2>
                Choose your <em>world.</em>
              </h2>
            </div>

            <div className="searchWrap">
              <span>⌕</span>

              <input
                className="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search collections…"
              />
            </div>
          </div>

          <div className="grid">
            {visibleSections.length ? (
              visibleSections.map((s, i) => {
                const n = docs.filter(
                  (d) => d.sectionId === s.id
                ).length;

                return (
                  <article
                    className="sectionCard"
                    style={{
                      ['--delay' as string]: `${i * 70}ms`,
                    }}
                    key={s.id}
                    onClick={() => setSelected(s.id)}
                  >
                    <div className="cardGlow" />
                    <div className="cardIndex">
                      0{i + 1}
                    </div>

                    <div className="orb" />

                    <div className="sectionSymbol">
                      ◈
                    </div>

                    <h2>{s.name}</h2>

                    <p>
                      {s.description ||
                        'Browse documents in this section.'}
                    </p>

                    <div className="cardFooter">
                      <span>
                        {n} PDF{n === 1 ? '' : 's'}
                      </span>

                      <span className="open">
                        Enter ↗
                      </span>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="empty">
                No sections found.
              </div>
            )}
          </div>
        </section>

        {/* FEATURE SECTION */}
        <section className="featureBand">
          <div>
            <span className="eyebrow">
              WHY PAPERDROP
            </span>

            <h2>
              Simple files.
              <br />
              <em>More atmosphere.</em>
            </h2>
          </div>

          <div className="featureList">
            <div>
              <span>01</span>
              <p>
                <b>Curated</b> — submissions stay
                private until they are approved.
              </p>
            </div>

            <div>
              <span>02</span>
              <p>
                <b>Fast</b> — find and download
                documents without clutter.
              </p>
            </div>

            <div>
              <span>03</span>
              <p>
                <b>Human</b> — every new document
                enters a review queue.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <Logo />
        <span>
          PaperDrop · built for documents
        </span>

        <Link href="/admin">
          Admin ↗
        </Link>
      </footer>

      {/* FLOATING UPLOAD */}
      <UploadBubble
        open={uploadOpen}
        setOpen={setUploadOpen}
        file={file}
        setFile={setFile}
        sectionId={sectionId}
        setSectionId={setSectionId}
        sections={sections}
        busy={busy}
        message={message}
        submit={submit}
      />
    </div>
  );
}

/* BACKGROUND ANIMATION */

function Ambient() {
  return (
    <div
      className="ambient"
      aria-hidden="true"
    >
      <div className="grain" />
      <div className="scan" />

      <div className="particle p1" />
      <div className="particle p2" />
      <div className="particle p3" />
      <div className="particle p4" />
      <div className="particle p5" />
    </div>
  );
}

/* ANIMATED BRAND */

function Logo() {
  return (
    <div className="brand">
      <span className="logoMark">
        <span className="logoSheet" />
        <span className="logoSpark">
          ✦
        </span>
      </span>

      <span>
        Paper<span>Drop</span>
      </span>
    </div>
  );
}

/* NAVIGATION */

function Nav() {
  return (
    <nav className="nav">
      <Link
        href="/"
        className="brandLink"
      >
        <Logo />
      </Link>

      <div className="navRight">
        <a
          href="#library"
          className="navLink"
        >
          Library
        </a>

        <Link
          className="navLink navAdmin"
          href="/admin"
        >
          Admin ↗
        </Link>
      </div>
    </nav>
  );
}

/* FLOATING UPLOAD */

function UploadBubble({
  open,
  setOpen,
  file,
  setFile,
  sectionId,
  setSectionId,
  sections,
  busy,
  message,
  submit,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  file: File | null;
  setFile: (v: File | null) => void;
  sectionId: string;
  setSectionId: (v: string) => void;
  sections: Schema['Section']['type'][];
  busy: boolean;
  message: string;
  submit: () => void;
}) {
  return (
    <div
      className={`uploadDock ${
        open ? 'isOpen' : ''
      }`}
    >
      <div
        className="uploadPopover"
        aria-hidden={!open}
      >
        <div className="uploadHeader">
          <div>
            <span className="eyebrow">
              DROP ZONE
            </span>

            <h3>Send a PDF</h3>
          </div>

          <button
            className="closePop"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>

        <label
          className={`dropZone ${
            file ? 'hasFile' : ''
          }`}
        >
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) =>
              setFile(
                e.target.files?.[0] ?? null
              )
            }
          />

          <span className="uploadIcon">
            ↑
          </span>

          <b>
            {file
              ? file.name
              : 'Choose your PDF'}
          </b>

          <small>
            {file
              ? formatSize(file.size)
              : 'PDF only · up to 50 MB'}
          </small>
        </label>

        <select
          className="select"
          value={sectionId}
          onChange={(e) =>
            setSectionId(e.target.value)
          }
        >
          {sections.map((s) => (
            <option
              key={s.id}
              value={s.id}
            >
              {s.name}
            </option>
          ))}
        </select>

        <button
          className="primary uploadSubmit"
          disabled={busy}
          onClick={submit}
        >
          {busy
            ? 'Uploading…'
            : 'Submit for review'}

          <span>↗</span>
        </button>

        <div
          className={`hint ${
            message.includes('successfully')
              ? 'successText'
              : ''
          }`}
        >
          {message}
        </div>
      </div>

      <button
        className="uploadBubble"
        onClick={() =>
          setOpen(!open)
        }
        aria-label="Upload PDF"
      >
        <span className="bubbleRing" />

        <span className="bubbleIcon">
          {open ? '×' : '↑'}
        </span>

        <span className="bubbleLabel">
          {open ? 'Close' : 'Upload'}
        </span>
      </button>
    </div>
  );
}

/* HELPERS */

function formatSize(n: number) {
  return n < 1048576
    ? `${Math.max(
        1,
        Math.round(n / 1024)
      )} KB`
    : `${(
        n / 1048576
      ).toFixed(1)} MB`;
}

function DocumentDownload({
  path,
}: {
  path: string;
}) {
  const [url, setUrl] =
    useState('');

  useEffect(() => {
    import(
      'aws-amplify/storage'
    )
      .then(({ getUrl }) =>
        getUrl({ path })
          .then((r) =>
            setUrl(
              r.url.toString()
            )
          )
          .catch(console.error)
      );
  }, [path]);

  return url ? (
    <a
      className="download"
      href={url}
      target="_blank"
      rel="noreferrer"
    >
      Download PDF <span>↓</span>
    </a>
  ) : (
    <span className="small">
      Preparing download…
    </span>
  );
}