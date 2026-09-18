'use client';

import { Amplify } from 'aws-amplify';
import outputs from '@/amplify_outputs.json';

Amplify.configure(outputs, { ssr: true });

export function AmplifyClient({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
