import { Suspense } from 'react';
import { Calendar } from '@/components/calendar/Calendar';

export const metadata = { title: 'Bereitschaft · DienstPlan Pro' };

export default function Page() {
  return (
    <Suspense>
      <Calendar area="Bereitschaft" />
    </Suspense>
  );
}
