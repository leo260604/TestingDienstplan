import { Suspense } from 'react';
import { Reports } from '@/components/pages/Reports';

export const metadata = { title: 'Berichte / Export · DienstPlan Pro' };

export default function Page() {
  return (
    <Suspense>
      <Reports />
    </Suspense>
  );
}
