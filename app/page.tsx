"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { generateClient } from "aws-amplify/data";
import { uploadData } from "aws-amplify/storage";
import type { Schema } from "@/amplify/data/resource";
import outputs from "@/amplify_outputs.json";
import Link from "next/link";

type CSSVars = React.CSSProperties & {
  "--delay"?: string;
  "--x"?: string;
  "--y"?: string;
};
const client = generateClient<Schema>();
const LOCAL_DEMO = Object.keys(outputs).length === 0;

type Settings = { comments: boolean; meteors: boolean; reducedMotion: boolean };
const defaultSettings: Settings = {
  comments: true,
  meteors: true,
  reducedMotion: false,
};

const DEMO_SECTIONS = [
  {
    id: "demo-cs",
    name: "Computer Science",
    description: "Coding, AI, and more.",
    sortOrder: 1,
  },
  {
    id: "demo-eng",
    name: "Engineering",
    description: "Build the future.",
    sortOrder: 2,
  },
  {
    id: "demo-math",
    name: "Mathematics",
    description: "Numbers make sense here.",
    sortOrder: 3,
  },
  {
    id: "demo-physics",
    name: "Physics",
    description: "Explore how the universe works.",
    sortOrder: 4,
  },
  {
    id: "demo-business",
    name: "Business",
    description: "Ideas and strategy.",
    sortOrder: 5,
  },
  {
    id: "demo-bio",
    name: "Biology",
    description: "Life is fascinating.",
    sortOrder: 6,
  },
] as Schema["Section"]["type"][];

const DEMO_DOCS = DEMO_SECTIONS.map((s, i) => ({
  id: `demo-doc-${i}`,
  originalName: `${s.name} Sample Notes.pdf`,
  sectionId: s.id,
  size: 2_400_000 + i * 320_000,
  createdAt: "2026-01-01T00:00:00.000Z",
  storagePath: "",
})) as Schema["Document"]["type"][];

const subjectIcon: Record<string, string> = {
  "Computer Science": "/anime/subjects/computer.svg",
  Engineering: "/anime/subjects/engineering.svg",
  Mathematics: "/anime/subjects/mathematics.svg",
  Physics: "/anime/subjects/physics.svg",
  Business: "/anime/subjects/business.svg",
  Biology: "/anime/subjects/biology.svg",
};
const characterImages = [
  "/anime/characters/hero-girl.webp",
  "/anime/characters/hero-boy.webp",
  "/anime/characters/stat-girl.webp",
];

export default function Home() {
  const [sections, setSections] = useState<Schema["Section"]["type"][]>([]);
  const [docs, setDocs] = useState<Schema["Document"]["type"][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [docSearch, setDocSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [file, setFile] = useState<File | null>(null);
  const [sectionId, setSectionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Files remain private until approved.",
  );
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [libraryError, setLibraryError] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("paperdrop-settings");
      if (raw) setSettings({ ...defaultSettings, ...JSON.parse(raw) });
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("paperdrop-settings", JSON.stringify(settings));
    } catch {}
    document.documentElement.dataset.pdMotion = settings.reducedMotion
      ? "reduced"
      : "full";
  }, [settings]);

  const loadLibrary = useCallback(async () => {
    setLoadingLibrary(true);
    setLibraryError("");

    if (LOCAL_DEMO) {
      setSections(DEMO_SECTIONS);
      setDocs(DEMO_DOCS);
      setSectionId((current) => current || DEMO_SECTIONS[0]?.id || "");
      setLoadingLibrary(false);
      return;
    }

    try {
      const [s, d] = await Promise.all([
        client.models.Section.list({ authMode: "identityPool" }),
        client.models.Document.list({ authMode: "identityPool" }),
      ]);

      const sectionError = s.errors?.[0]?.message;
      const documentError = d.errors?.[0]?.message;

      if (sectionError || documentError) {
        throw new Error(
          sectionError || documentError || "The library could not be loaded.",
        );
      }

      const sorted = [...s.data].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
      );

      // Only replace existing data after BOTH requests succeeded.
      // This prevents a temporary AWS/auth failure from making the library disappear.
      setSections(sorted);
      setDocs(d.data);
      setSectionId((current) =>
        current && sorted.some((section) => section.id === current)
          ? current
          : sorted[0]?.id || "",
      );
    } catch (error) {
      console.error("PaperDrop data loading failed:", error);
      setLibraryError(
        error instanceof Error
          ? error.message
          : "Could not load the PaperDrop library.",
      );
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  // Admin → Guest can leave the tab/page with stale Amplify credentials.
  // Reload the public library whenever the page becomes visible again.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") loadLibrary();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [loadLibrary]);

  const visible = useMemo(
    () =>
      sections.filter((s) =>
        (s.name ?? "").toLowerCase().includes(search.toLowerCase()),
      ),
    [sections, search],
  );
  const current = sections.find((s) => s.id === selected);
  const currentDocs = docs.filter(
    (d) =>
      d.sectionId === selected &&
      (d.originalName ?? "").toLowerCase().includes(docSearch.toLowerCase()),
  );

  async function submit() {
    if (!file) return setMessage("Choose a PDF first.");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))
      return setMessage("Only PDF files are accepted.");
    if (file.size > 50 * 1024 * 1024)
      return setMessage("Maximum file size is 50 MB.");
    if (!sectionId) return setMessage("Choose a section.");
    setBusy(true);
    setMessage("Uploading for review…");
    try {
      if (LOCAL_DEMO) {
        await new Promise((r) => setTimeout(r, 900));
        setFile(null);
        setMessage("Demo upload complete — AWS is disabled locally.");
        return;
      }
      const id = crypto.randomUUID();
      const path = `pending/${id}.pdf`;
      await uploadData({
        path,
        data: file,
        options: { contentType: "application/pdf" },
      }).result;
      const result = await client.models.Submission.create(
        {
          originalName: file.name.slice(0, 180),
          storagePath: path,
          size: file.size,
          sectionId,
          status: "pending",
        },
        { authMode: "identityPool" },
      );
      if (result.errors?.length) throw new Error(result.errors[0].message);
      setFile(null);
      setMessage(
        "Submitted successfully. It will appear after admin approval.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  if (selected && current)
    return (
      <DocumentWorld
        current={current}
        docs={currentDocs}
        docSearch={docSearch}
        setDocSearch={setDocSearch}
        onBack={() => {
          setSelected(null);
          setDocSearch("");
        }}
        uploadOpen={uploadOpen}
        setUploadOpen={setUploadOpen}
        file={file}
        setFile={setFile}
        sectionId={sectionId}
        setSectionId={setSectionId}
        sections={sections}
        busy={busy}
        message={message}
        submit={submit}
      />
    );

  return (
    <main
      className={`pd-page ${settings.meteors ? "pd-meteors" : ""} ${settings.comments ? "pd-comments" : ""}`}
    >
      <img className="pd-nightscape" src="/anime/backgrounds/PAPERDROP-main-background.webp" alt="" aria-hidden="true" />
      <AnimatedSky meteors={settings.meteors} />
      <header className="pd-nav">
        <Link href="#top" className="pd-logo">
          <img src="/anime/branding/logo-mark.svg" />
          <span>
            Paper<b>Drop</b>
          </span>
        </Link>
        <nav className={mobileOpen ? "open" : ""}>
          <a href="#top">Home</a>
          <a href="#library">Library</a>
          <a href="#about">About</a>
          <a href="#features">Guide</a>
        </nav>
        <div className="pd-nav-actions">
          <label className="pd-search">
            <img src="/anime/icons/search.svg" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes, subjects, or anything..."
            />
          </label>
          <button
            className="pd-icon-btn"
            onClick={() =>
              setSettings((v) => ({ ...v, reducedMotion: !v.reducedMotion }))
            }
          >
            <img
              src={
                settings.reducedMotion
                  ? "/anime/icons/sun.svg"
                  : "/anime/icons/moon.svg"
              }
            />
          </button>
          <button
            className="pd-settings-btn"
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <img src="/anime/icons/settings.svg" /> <span>Settings</span>
          </button>
          <button
            className="pd-avatar"
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <img src="/anime/characters/stat-girl.webp" />
          </button>
          <button
            className="pd-menu-btn"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <img src="/anime/icons/menu.svg" />
          </button>
        </div>
        {settingsOpen && (
          <SettingsMenu settings={settings} setSettings={setSettings} />
        )}
      </header>

      <section id="top" className="pd-hero">
        <div className="pd-scenery">
          <img className="pd-moon" src="/anime/backgrounds/moon.svg" />
          <img className="pd-cloud" src="/anime/backgrounds/cloud.svg" />
          <img className="pd-city" src="/anime/backgrounds/city.svg" />
          <img className="pd-torii" src="/anime/backgrounds/torii.svg" />
        </div>
        <Character
          className="pd-hero-girl"
          src="/anime/characters/hero-girl.webp"
          alt="Anime guide character"
        />
        <Character
          className="pd-hero-boy"
          src="/anime/characters/hero-boy.webp"
          alt="Anime guide character"
        />
        <Bubble className="pd-bubble-start" src="/anime/bubbles/start.svg" />
        <Bubble className="pd-bubble-upload" src="/anime/bubbles/upload.svg" />
        <div className="pd-hero-center">
          <div className="pd-jp">学びは旅だ</div>
          <div className="pd-journey">Learning is a journey.</div>
          <h1>
            Paper<span>Drop</span>
            <i>✈</i>
          </h1>
          <strong>DROP. DISCOVER. KEEP.</strong>
          <p>
            A student-powered library for notes, guides,
            <br />
            past papers and more. Share knowledge.
            <br />
            Build a brighter tomorrow.
          </p>
          <div className="pd-hero-actions">
            <button
              className="pd-primary"
              onClick={() =>
                document
                  .getElementById("library")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Explore Library <b>→</b>
            </button>
            <a className="pd-secondary" href="#about">
              Learn More
            </a>
          </div>
          <p className="pd-handwrite">
            Small drops of knowledge create big waves.
          </p>
        </div>
        <div className="pd-float-paper p1">
          <img src="/anime/effects/paper.svg" />
        </div>
        <div className="pd-float-paper p2">
          <img src="/anime/effects/paper-small.svg" />
        </div>
        <div className="pd-float-plane">
          <img src="/anime/branding/paper-plane.svg" />
        </div>
      </section>

      <section className="pd-stats">
        <Stat
          icon="file"
          value="Explore"
          label="Collections"
          note="Lots to explore!"
        />
        <Stat icon="users" value="Download" label="PDFs" note="And growing!" />
        <Stat
          icon="globe"
          value="50 MB"
          label="Max file size"
          note="Plenty of space!"
        />
        <Stat
          icon="shield"
          value="100%"
          label="Reviewed"
          note="Safe & clean!"
        />
        <img
          className="pd-stat-character"
          src="/anime/characters/stat-girl.webp"
        />
      </section>

      <section id="library" className="pd-section">
        <div className="pd-section-head">
          <div>
            <span>CHOOSE YOUR WORLD</span>
            <h2>Different subjects. Same dream.</h2>
          </div>
          <button onClick={() => setSearch("")}>View All →</button>
        </div>
        <div className="pd-library-status">
          {loadingLibrary ? (
            <div className="pd-subject-grid" aria-label="Loading library">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="pd-subject-card pd-skeleton-card"
                  aria-hidden="true"
                >
                  <div className="pd-skeleton pd-skeleton-art" />
                  <div className="pd-skeleton pd-skeleton-title" />
                  <div className="pd-skeleton pd-skeleton-meta" />
                  <div className="pd-skeleton pd-skeleton-line" />
                  <div className="pd-skeleton pd-skeleton-line pd-skeleton-line-short" />
                </div>
              ))}
            </div>
          ) : libraryError ? (
            <div className="pd-library-error" role="alert">
              <strong>Library temporarily unavailable</strong>
              <p>{libraryError}</p>
              <button onClick={loadLibrary}>Retry ↻</button>
            </div>
          ) : visible.length ? (
            <div className="pd-subject-grid">
              {visible.slice(0, 6).map((s, i) => (
                <article
                  key={s.id}
                  className="pd-subject-card"
                  style={{ "--delay": `${i * 70}ms` } as CSSVars}
                  onClick={() => setSelected(s.id)}
                >
                  <div className="pd-card-art">
                    <img
                      src={subjectIcon[s.name ?? ""] ?? "/anime/icons/file.svg"}
                    />
                  </div>
                  <h3>{s.name}</h3>
                  <span>
                    {docs.filter((d) => d.sectionId === s.id).length} PDFs
                  </span>
                  <p>{s.description}</p>
                  <img
                    className="pd-card-spark"
                    src="/anime/effects/sparkle-1.svg"
                  />
                </article>
              ))}
            </div>
          ) : (
            <div className="pd-library-error">
              <strong>No sections are available yet.</strong>
              <p>The backend returned successfully, but there are no public sections.</p>
              <button onClick={loadLibrary}>Refresh ↻</button>
            </div>
          )}
        </div>
        <img
          className="pd-subject-guide"
          src="/anime/characters/stat-girl.webp"
        />
        <Bubble
          className="pd-bubble-subject"
          src="/anime/bubbles/subject.svg"
        />
      </section>

      <footer className="pd-footer">
        <div className="pd-footer-brand">
          <img src="/anime/branding/logo-mark.svg" />
          <b>
            Paper<span>Drop</span>
          </b>
          <small>Your universe of useful documents.</small>
        </div>
        <div className="pd-footer-links">
          <a href="#top">Home</a>
          <a href="#library">Library</a>
          <a href="#about">About</a>
          <a href="#features">Guide</a>
          <Link href="/admin">Admin</Link>
        </div>
        <div className="pd-footer-bottom">
          © {new Date().getFullYear()} PaperDrop · Built for learners, by
          learners. <em>Keep Learning ♡</em>
        </div>
      </footer>

      <Upload
        {...{
          uploadOpen,
          setUploadOpen,
          file,
          setFile,
          sectionId,
          setSectionId,
          sections,
          busy,
          message,
          submit,
        }}
      />
    </main>
  );
}

function AnimatedSky({ meteors }: { meteors: boolean }) {
  return (
    <div className="pd-sky-layer" aria-hidden="true">
      {meteors && (
        <>
          <div className="pd-meteor m1" />
          <div className="pd-meteor m2" />
          <div className="pd-meteor m3" />
        </>
      )}
    </div>
  );
}
function Character({
  className,
  src,
  alt,
}: {
  className: string;
  src: string;
  alt: string;
}) {
  return (
    <div className={`pd-character ${className}`}>
      <img src={src} alt={alt} />
      <span className="pd-blink" />
    </div>
  );
}
function Bubble({ className, src }: { className: string; src: string }) {
  return (
    <img
      className={`pd-bubble ${className}`}
      src={src}
      alt=""
      aria-hidden="true"
    />
  );
}
function Stat({
  icon,
  value,
  label,
  note,
}: {
  icon: string;
  value: string;
  label: string;
  note: string;
}) {
  return (
    <div className="pd-stat">
      <img src={`/anime/icons/${icon}.svg`} />
      <div>
        <b>{value}</b>
        <span>{label}</span>
        <small>{note}</small>
      </div>
    </div>
  );
}
function SettingsMenu({
  settings,
  setSettings,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
}) {
  return (
    <div className="pd-settings-menu">
      <h3>PaperDrop settings ✦</h3>
      <button
        onClick={() =>
          setSettings({ ...settings, reducedMotion: !settings.reducedMotion })
        }
      >
        <img
          src={`/anime/icons/${settings.reducedMotion ? "sun" : "moon"}.svg`}
        />
        <span>
          Appearance
          <small>
            {settings.reducedMotion ? "Calm motion" : "Anime night glow"}
          </small>
        </span>
      </button>
      <button
        onClick={() =>
          setSettings({ ...settings, comments: !settings.comments })
        }
      >
        <img src="/anime/icons/comment.svg" />
        <span>
          Guide comments
          <small>
            {settings.comments ? "Characters talk to you" : "Hidden"}
          </small>
        </span>
        <i>{settings.comments ? "ON" : "OFF"}</i>
      </button>
      <button
        onClick={() => setSettings({ ...settings, meteors: !settings.meteors })}
      >
        <img src="/anime/effects/meteor.svg" />
        <span>
          Meteor shower
          <small>{settings.meteors ? "Occasional sky streaks" : "Off"}</small>
        </span>
        <i>{settings.meteors ? "ON" : "OFF"}</i>
      </button>
      <Link href="/admin">Admin panel ↗</Link>
    </div>
  );
}
function Upload(p: any) {
  return (
    <div className={`pd-upload ${p.uploadOpen ? "open" : ""}`}>
      <div className="pd-upload-panel">
        <header>
          <b>SHARE YOUR KNOWLEDGE</b>
          <button onClick={() => p.setUploadOpen(false)}>×</button>
        </header>
        <label className="pd-file-picker">
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e: any) => {
              const selected = e.target.files?.[0] ?? null;
              p.setFile(selected);
            }}
          />

          <img src="/anime/icons/upload.svg" />

          <strong>{p.file ? p.file.name : "Drop a PDF here"}</strong>

          <small>
            {p.file
              ? `${(p.file.size / 1024 / 1024).toFixed(2)} MB`
              : "PDF only · maximum 50 MB"}
          </small>
        </label>
        <select
          value={p.sectionId}
          onChange={(e: any) => p.setSectionId(e.target.value)}
        >
          {p.sections.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button disabled={p.busy} onClick={p.submit}>
          {p.busy ? "Uploading…" : "Submit for review ↗"}
        </button>
        <p>{p.message}</p>
      </div>
      <button
        className="pd-upload-fab"
        onClick={() => p.setUploadOpen(!p.uploadOpen)}
      >
        <img src={`/anime/icons/${p.uploadOpen ? "close" : "upload"}.svg`} />
        <small>{p.uploadOpen ? "Close" : "Upload"}</small>
      </button>
    </div>
  );
}
function DocumentWorld({
  current,
  docs,
  docSearch,
  setDocSearch,
  onBack,
  ...uploadProps
}: any) {
  return (
    <main className="pd-doc-mode">
      <AnimatedSky meteors={true} />
      <header className="pd-doc-nav">
        <button onClick={onBack}>← All worlds</button>
        <Link href="#">
          Paper<span>Drop</span>
        </Link>
        <Link href="/admin">Admin ↗</Link>
      </header>
      <section className="pd-doc-page">
        <span>LIBRARY / WORLD</span>
        <h1>{current.name}</h1>
        <p>{current.description}</p>
        <input
          value={docSearch}
          onChange={(e) => setDocSearch(e.target.value)}
          placeholder="Search PDFs…"
        />
        <div className="pd-doc-grid">
          {docs.length ? (
            docs.map((d: any, i: number) => (
              <article
                key={d.id}
                className="pd-doc-card"
                style={{ "--delay": `${i * 60}ms` } as CSSVars}
              >
                <b>PDF</b>
                <h2>{d.originalName}</h2>
                <p>
                  {formatSize(d.size)} ·{" "}
                  {new Date(d.createdAt).toLocaleDateString()}
                </p>
                {LOCAL_DEMO ? (
                  <button disabled>Demo PDF · AWS disabled</button>
                ) : (
                  <DocumentDownload path={d.storagePath} />
                )}
              </article>
            ))
          ) : (
            <div className="pd-empty">No approved PDFs in this world yet.</div>
          )}
        </div>
      </section>
      <Upload {...uploadProps} />
    </main>
  );
}
function DocumentDownload({ path }: { path: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    import("aws-amplify/storage").then(({ getUrl }) =>
      getUrl({ path })
        .then((r) => setUrl(r.url.toString()))
        .catch(console.error),
    );
  }, [path]);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      Download PDF ↓
    </a>
  ) : (
    <span>Preparing…</span>
  );
}
function formatSize(n: number) {
  return n < 1048576
    ? `${Math.max(1, Math.round(n / 1024))} KB`
    : `${(n / 1048576).toFixed(1)} MB`;
}
