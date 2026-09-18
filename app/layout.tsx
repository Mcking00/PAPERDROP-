import './globals.css';
import { AmplifyClient } from '@/components/amplify-client';

export const metadata = {
  title: 'PaperDrop — PDF Library',
  description: 'A moderated public PDF library',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><AmplifyClient>{children}</AmplifyClient></body>
    </html>
  );
}
