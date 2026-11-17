import { Suspense } from 'react';
import { Contacts } from '@/components/pages/Contacts';

export const metadata = { title: 'Kontakte · DienstPlan Pro' };

export default function Page() {
  return (
    <Suspense>
      <Contacts />
    </Suspense>
  );
}
