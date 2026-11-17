import { Suspense } from 'react';
import { StandbyAdmin } from '@/components/pages/StandbyAdmin';

export const metadata = { title: 'Bereitschaft verwalten · DienstPlan Pro' };

export default function Page() {
  return (
    <Suspense>
      <StandbyAdmin />
    </Suspense>
  );
}
