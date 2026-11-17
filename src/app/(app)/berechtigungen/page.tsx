import { Suspense } from 'react';
import { Roles } from '@/components/pages/Logs';

export const metadata = { title: 'Team Berechtigungen · DienstPlan Pro' };

export default function Page() {
  return (
    <Suspense>
      <Roles />
    </Suspense>
  );
}
