import { Suspense } from 'react';
import { ShiftTimes } from '@/components/pages/ShiftTimes';

export const metadata = { title: 'Dienstzeiten · DienstPlan Pro' };

export default function Page() {
  return (
    <Suspense>
      <ShiftTimes />
    </Suspense>
  );
}
