import { Suspense } from 'react';
import { Settings } from '@/components/pages/Settings';

export const metadata = { title: 'Einstellungen · DienstPlan Pro' };

export default function Page() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}
