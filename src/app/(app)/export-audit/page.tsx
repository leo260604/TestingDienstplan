import { Suspense } from 'react';
import { ExportAudit } from '@/components/pages/Logs';

export const metadata = { title: 'Export Audit · DienstPlan Pro' };

export default function Page() {
  return (
    <Suspense>
      <ExportAudit />
    </Suspense>
  );
}
