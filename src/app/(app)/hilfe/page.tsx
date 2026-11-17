import { Suspense } from 'react';
import { Help } from '@/components/pages/Logs';

export const metadata = { title: 'Hilfe · DienstPlan Pro' };

export default function Page() {
  return (
    <Suspense>
      <Help />
    </Suspense>
  );
}
