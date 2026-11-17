import { Suspense } from 'react';
import { Calendar } from '@/components/calendar/Calendar';

export const metadata = { title: 'Dienstplan · DienstPlan Pro' };

export default function Page() {
  return (
    <Suspense>
      <Calendar area="Dienstplan" />
    </Suspense>
  );
}
