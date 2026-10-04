import type { Metadata } from 'next';
import './globals.css';
import { AmplifyClient } from '@/components/amplify-client';
import Script from 'next/script';

export const metadata: Metadata = {
  title: 'PaperDrop — Your PDF Universe',
  description:
    'A cinematic document sharing and discovery platform.',
  keywords: [
    'PaperDrop',
    'PDF',
    'documents',
    'file sharing',
    'document library',
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="paperdrop-settings-bootstrap" strategy="beforeInteractive">
          {`(() => {
            try {
              const raw = localStorage.getItem('paperdrop-settings-v1');
              const s = raw ? JSON.parse(raw) : {};
              const root = document.documentElement;
              root.classList.toggle('pd-anime-background', s.animeBackground !== false);
              root.classList.toggle('pd-performance-mode', s.performance === true);
              root.classList.toggle('pd-animated-background', s.animatedBackground !== false && s.performance !== true);
              root.classList.toggle('pd-smooth-scroll', s.smoothScroll !== false && s.motion !== 'off');
              root.classList.toggle('pd-high-contrast', s.highContrast === true);
              root.dataset.pdTheme = s.theme || 'dark';
              root.dataset.pdAccent = s.accent || 'violet';
              root.dataset.pdMotion = s.motion || 'full';
              root.dataset.pdTextSize = s.textSize || 'normal';
              root.dataset.pdNav = String(s.bottomNav !== false);
              root.dataset.pdNavLabels = String(s.navLabels !== false);
              root.dataset.pdLibraryView = s.libraryView || 'grid';
              root.dataset.pdCardDensity = s.cardDensity || 'comfortable';
              root.dataset.pdDescriptions = String(s.descriptions !== false);
              root.lang = s.language === 'hinglish' ? 'en-IN' : 'en';
            } catch {
              document.documentElement.classList.add('pd-anime-background', 'pd-animated-background');
            }
          })()`}
        </Script>
        <AmplifyClient>{children}</AmplifyClient>
      </body>
    </html>
  );
}