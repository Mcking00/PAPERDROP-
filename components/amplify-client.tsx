'use client';

import { Amplify } from 'aws-amplify';
import outputs from '@/amplify_outputs.json';

// In local UI development, the generated Amplify outputs file is not available.
// Amplify Hosting generates the real file during the backend deployment, so the
// production build automatically replaces this empty local placeholder.
if (Object.keys(outputs).length > 0) {
  Amplify.configure(outputs, { ssr: true });
}

export function AmplifyClient({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
