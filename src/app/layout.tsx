import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { IconSprite } from '@/components/IconSprite';
import '@/styles/app.css';
import '@/styles/react.css';

export const metadata: Metadata = {
  title: 'DienstPlan Pro',
  description: 'Dienst- und Bereitschaftsplanung',
  manifest: '/icons/manifest.webmanifest',
  icons: { icon: '/icons/logo-mark.svg', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'DienstPlan', statusBarStyle: 'default' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#14A1A9' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Dunkelmodus schon serverseitig setzen (kein Aufblitzen beim Laden)
  const dark = (await cookies()).get('dp-theme')?.value === 'dark';
  return (
    <html lang="de" suppressHydrationWarning>
      <body className={dark ? 'dark-mode' : undefined} suppressHydrationWarning>
        <IconSprite />
        {children}
      </body>
    </html>
  );
}
