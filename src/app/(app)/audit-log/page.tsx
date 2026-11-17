import { Suspense } from 'react';
import { AuditLog } from '@/components/pages/Logs';

export const metadata = { title: 'Audit Log · DienstPlan Pro' };

export default function Page() {
  return (
    <Suspense>
      <AuditLog />
    </Suspense>
  );
}
