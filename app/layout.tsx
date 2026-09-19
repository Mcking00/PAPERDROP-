import type { Metadata } from 'next';
import 'app/globals-mobile-fixed.css';
import { AmplifyClient } from '@/components/amplify-client';

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
    <html lang="en">
      <body>
        <AmplifyClient />
        {children}
      </body>
    </html>
  );
}