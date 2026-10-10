"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type Settings = {
  theme: "dark" | "amoled" | "light";
  accent: "violet" | "cyan" | "rose" | "green";
  animeBackground: boolean;
  animatedBackground: boolean;
  motion: "full" | "reduced" | "off";
  smoothScroll: boolean;
  performance: boolean;
  bottomNav: boolean;
  navLabels: boolean;
  libraryView: "grid" | "list";
  cardDensity: "comfortable" | "compact";
  sort: "relevance" | "newest" | "az";
  descriptions: boolean;
  pdfNewTab: boolean;
  downloadConfirm: boolean;
  restoreDrafts: boolean;
  uploadNotifications: boolean;
  textSize: "normal" | "large" | "xlarge";
};

const KEY = "paperdrop-settings-v1";

const UPDATE_LOG = [
  { date: "Oct 7, 2026", tag: "NEW", tone: "new", title: "What’s New is here", text: "You can now see recent PAPERDROPL changes directly from Settings." },
  { date: "Oct 6, 2026", tag: "IMPROVED", tone: "improved", title: "Smoother interactions", text: "Tap, focus, and mobile interactions were refined for a cleaner feel." },
  { date: "Oct 5, 2026", tag: "IMPROVED", tone: "improved", title: "Settings got more control", text: "Appearance, motion, navigation, library, PDF, upload, and accessibility preferences are easier to manage." },
  { date: "Oct 4, 2026", tag: "FIXED", tone: "fixed", title: "Mobile polish", text: "Several small mobile layout and interaction details were tightened up." },
];

const defaults: Settings = {
  theme: "dark",
  accent: "violet",
  animeBackground: true,
  animatedBackground: true,
  motion: "full",
  smoothScroll: true,
  performance: false,
  bottomNav: true,
  navLabels: true,
  libraryView: "grid",
  cardDensity: "comfortable",
  sort: "relevance",
  descriptions: true,
  pdfNewTab: true,
  downloadConfirm: false,
  restoreDrafts: true,
  uploadNotifications: true,
  textSize: "normal",
};

const settingOptions: Partial<Record<keyof Settings, readonly string[]>> = {
  theme: ["dark", "amoled", "light"],
  accent: ["violet", "cyan", "rose", "green"],
  motion: ["full", "reduced", "off"],
  libraryView: ["grid", "list"],
  cardDensity: ["comfortable", "compact"],
  sort: ["relevance", "newest", "az"],
  textSize: ["normal", "large", "xlarge"],
};

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaults;
    const saved = parsed as Record<string, unknown>;
    const result = { ...defaults };
    for (const key of Object.keys(defaults) as Array<keyof Settings>) {
      const value = saved[key];
      const fallback = defaults[key];
      if (typeof value !== typeof fallback) continue;
      const options = settingOptions[key];
      if (typeof value === "string" && options && !options.includes(value)) continue;
      Object.assign(result, { [key]: value });
    }
    return result;
  } catch {
    return defaults;
  }
}

function applySettings(s: Settings) {
  const root = document.documentElement;
  root.dataset.pdTheme = s.theme;
  root.dataset.pdAccent = s.accent;
  root.dataset.pdMotion = s.motion;
  root.dataset.pdTextSize = s.textSize;
  root.dataset.pdNav = String(s.bottomNav);
  root.dataset.pdNavLabels = String(s.navLabels);
  root.dataset.pdLibraryView = s.libraryView;
  root.dataset.pdCardDensity = s.cardDensity;
  root.dataset.pdDescriptions = String(s.descriptions);
  root.dataset.pdPdfNewTab = String(s.pdfNewTab);
  root.dataset.pdDownloadConfirm = String(s.downloadConfirm);
  root.dataset.pdRestoreDrafts = String(s.restoreDrafts);
  root.dataset.pdUploadNotifications = String(s.uploadNotifications);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("paperdrop-settings-change", { detail: s }));
  root.classList.toggle("pd-anime-background", s.animeBackground);
  root.classList.toggle("pd-animated-background", s.animatedBackground && !s.performance);
  root.classList.toggle("pd-smooth-scroll", s.smoothScroll && s.motion !== "off");
  root.classList.toggle("pd-performance-mode", s.performance);
}

function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <div className="pd-setting-row"><div className="pd-setting-copy"><strong>{title}</strong>{description && <span>{description}</span>}</div><div className="pd-setting-control">{children}</div></div>;
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" className={"pd-setting-toggle "+(value ? "is-on" : "")} onClick={() => onChange(!value)} role="switch" aria-checked={value} aria-label={label}><span /></button>;
}

function Segmented({ value, options, onChange }: { value: string; options: Array<[string, string]>; onChange: (v: string) => void }) {
  return <div className="pd-segmented">{options.map(([id, label]) => <button key={id} type="button" className={value === id ? "is-active" : ""} aria-pressed={value === id} onClick={() => onChange(id)}>{label}</button>)}</div>;
}

export default function SettingsPanel({ onClose, onToast }: { onClose: () => void; onToast?: (message: string) => void }) {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [settingsReady, setSettingsReady] = useState(false);
  const [persistSettings, setPersistSettings] = useState(true);
  const [open, setOpen] = useState<string | null>("appearance");
  const panelRef = useRef<HTMLElementTagNameMap["aside"]>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const panel = panelRef.current;
    const selector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    document.body.style.overflow = "hidden";
    const focusable = Array.from(panel?.querySelectorAll<HTMLElement>(selector) ?? []);
    (focusable[0] ?? panel)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(selector));
      if (!items.length) {
        event.preventDefault();
        panel.focus();
      } else if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items[items.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
        event.preventDefault();
        items[0].focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const saved = readSettings();
    setSettings(saved);
    applySettings(saved);
    setSettingsReady(true);
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    if (persistSettings) {
      try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
    }
    applySettings(settings);
  }, [settings, settingsReady, persistSettings]);

  function patch<K extends keyof Settings>(key: K, value: Settings[K]) {
    setPersistSettings(true);
    setSettings(s => ({ ...s, [key]: value }));
  }

  function reset() {
    setPersistSettings(true);
    setSettings(defaults);
    onToast?.("Settings restored to defaults");
  }

  function clearLocalData() {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem("paperdropl-search-history");
    } catch {}
    setPersistSettings(false);
    setSettings(defaults);
    onToast?.("Local preferences cleared");
  }

  const section = (id: string, title: string, icon: string, body: ReactNode) => (
    <section className={"pd-settings-section "+(open === id ? "is-open" : "")}>
      <button type="button" className="pd-settings-section-head" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}>
        <span className="pd-settings-section-icon">{icon}</span><span>{title}</span><b>⌄</b>
      </button>
      {open === id && <div className="pd-settings-section-body">{body}</div>}
    </section>
  );

  return <div className="pd-settings-shell" role="dialog" aria-modal="true" aria-labelledby="pd-settings-title">
    <div className="pd-settings-backdrop" onClick={onClose} />
    <aside ref={panelRef} tabIndex={-1} className="pd-settings-panel">
      <header className="pd-settings-titlebar">
        <div><span className="pd-kicker">PERSONALIZE</span><h2 id="pd-settings-title">PAPERDROP settings</h2><p>Your preferences stay on this device.</p></div>
        <button type="button" className="pd-settings-close" onClick={onClose} aria-label="Close settings">×</button>
      </header>

      <div className="pd-settings-scroll">
        {section("appearance", "Appearance", "✦", <>
          <SettingRow title="Theme" description="Choose the base surface."><Segmented value={settings.theme} options={[["dark","Default"],["amoled","Dark"],["light","Light"]]} onChange={v => patch("theme", v as Settings["theme"])} /></SettingRow>
          <SettingRow title="Accent" description="The color used for highlights and actions."><Segmented value={settings.accent} options={[["violet","Violet"],["cyan","Cyan"],["rose","Rose"],["green","Green"]]} onChange={v => patch("accent", v as Settings["accent"])} /></SettingRow>
          <SettingRow title="Anime atmosphere" description="Keep PAPERDROP's illustrated background."><Toggle value={settings.animeBackground} onChange={v => patch("animeBackground", v)} label="Anime atmosphere" /></SettingRow>
          <SettingRow title="Animated background" description="Ambient particles and movement."><Toggle value={settings.animatedBackground} onChange={v => patch("animatedBackground", v)} label="Animated background" /></SettingRow>
        </>)}

        {section("motion", "Motion & performance", "◌", <>
          <SettingRow title="Animation" description="How much interface motion is used."><Segmented value={settings.motion} options={[["full","Full"],["reduced","Reduced"],["off","Off"]]} onChange={v => patch("motion", v as Settings["motion"])} /></SettingRow>
          <SettingRow title="Smooth scrolling"><Toggle value={settings.smoothScroll} onChange={v => patch("smoothScroll", v)} label="Smooth scrolling" /></SettingRow>
          <SettingRow title="Performance mode" description="Reduces decorative effects on slower devices."><Toggle value={settings.performance} onChange={v => patch("performance", v)} label="Performance mode" /></SettingRow>
        </>)}

        {section("navigation", "Navigation", "⌘", <>
          <SettingRow title="Bottom navigation" description="Show the mobile navigation bar."><Toggle value={settings.bottomNav} onChange={v => patch("bottomNav", v)} label="Bottom navigation" /></SettingRow>
          <SettingRow title="Navigation labels"><Toggle value={settings.navLabels} onChange={v => patch("navLabels", v)} label="Navigation labels" /></SettingRow>
        </>)}

        {section("library", "Library", "▦", <>
          <SettingRow title="Default view"><Segmented value={settings.libraryView} options={[["grid","Grid"],["list","List"]]} onChange={v => patch("libraryView", v as Settings["libraryView"])} /></SettingRow>
          <SettingRow title="Card density"><Segmented value={settings.cardDensity} options={[["comfortable","Comfort"],["compact","Compact"]]} onChange={v => patch("cardDensity", v as Settings["cardDensity"])} /></SettingRow>
          <SettingRow title="Default sorting"><Segmented value={settings.sort} options={[["relevance","Best"],["newest","New"],["az","A–Z"]]} onChange={v => patch("sort", v as Settings["sort"])} /></SettingRow>
          <SettingRow title="Descriptions"><Toggle value={settings.descriptions} onChange={v => patch("descriptions", v)} label="Show descriptions" /></SettingRow>
        </>)}

        {section("pdf", "PDF experience", "▤", <>
          <SettingRow title="Open PDFs in a new tab" description="Keeps your library page available."><Toggle value={settings.pdfNewTab} onChange={v => patch("pdfNewTab", v)} label="Open PDFs in new tab" /></SettingRow>
          <SettingRow title="Confirm downloads"><Toggle value={settings.downloadConfirm} onChange={v => patch("downloadConfirm", v)} label="Confirm downloads" /></SettingRow>
        </>)}

        {section("upload", "Upload", "＋", <>
          <SettingRow title="Restore unfinished uploads" description="Offer saved upload drafts when you return."><Toggle value={settings.restoreDrafts} onChange={v => patch("restoreDrafts", v)} label="Restore unfinished uploads" /></SettingRow>
          <SettingRow title="Upload notifications"><Toggle value={settings.uploadNotifications} onChange={v => patch("uploadNotifications", v)} label="Upload notifications" /></SettingRow>
        </>)}

        {section("accessibility", "Accessibility", "◉", <>
          <SettingRow title="Text size"><Segmented value={settings.textSize} options={[["normal","Normal"],["large","Large"],["xlarge","XL"]]} onChange={v => patch("textSize", v as Settings["textSize"])} /></SettingRow>
        </>)}

        {section("data", "Privacy & local data", "⌁", <>
          <SettingRow title="Clear local preferences" description="Remove PAPERDROP settings stored on this device."><button className="pd-setting-action" type="button" onClick={clearLocalData}>Clear</button></SettingRow>
          <SettingRow title="Reset settings" description="Return every PAPERDROP preference to its default."><button className="pd-setting-action is-danger" type="button" onClick={reset}>Reset</button></SettingRow>
        </>)}


        {section("updates", "What’s New", "✦", <div className="pd-update-log">
          <div className="pd-update-intro"><span className="pd-update-orb">✦</span><div><strong>Recent changes</strong><p>See what has changed in PAPERDROPL lately.</p></div></div>
          <div className="pd-update-timeline">{UPDATE_LOG.map((item, index) => <article className="pd-update-item" key={item.date + item.title}>
            <div className="pd-update-marker"><span /></div>
            <div className="pd-update-card">
              <div className="pd-update-meta"><span>{item.date}</span><b className={item.tone}>{item.tag}</b></div>
              <h3>{item.title}{index === 0 && <span className="pd-update-spark">✦</span>}</h3>
              <p>{item.text}</p>
            </div>
          </article>)}</div>
        </div>)}

        {section("about", "About PAPERDROP", "i", <>
          <div className="pd-settings-about"><b>PAPERDROP</b><span>Student-powered document library</span><small>Preferences are stored locally in your browser. They do not change your account, documents, or admin data.</small></div>
        </>)}
      </div>
    </aside>
  </div>;
}
