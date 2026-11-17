import { Suspense } from 'react';
import { Administration } from '@/components/pages/Administration';

export const metadata = { title: 'Administration · DienstPlan Pro' };

export default function Page() {
  return (
    <Suspense>
      <Administration />
    </Suspense>
  );
}
