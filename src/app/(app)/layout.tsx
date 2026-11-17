import { demoLoginEnabled } from '@/auth';
import { AppProvider } from '@/components/AppProvider';
import { AppShell } from '@/components/shell/AppShell';
import { DomTranslator } from '@/components/DomTranslator';
import { loadAppData, loadPrefs } from '@/server/data';
import { requireUser } from '@/server/session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [data, prefs] = await Promise.all([loadAppData(user), loadPrefs(user.id)]);
  return (
    <AppProvider data={data} user={user} prefs={prefs} demoLogin={demoLoginEnabled()}>
      <AppShell>{children}</AppShell>
      <DomTranslator lang={prefs.lang} />
    </AppProvider>
  );
}
