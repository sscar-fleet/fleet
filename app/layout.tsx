import './globals.css';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import Toast from './_c/Toast';

export const metadata: Metadata = {
  title: 'SS CAR FLEET',
  description: 'Gestion de flotte pour loueurs',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function Layout({ children }: { children: React.ReactNode }) {
  const theme = cookies().get('theme')?.value === 'clair' ? 'clair' : 'sombre';
  return (
    <html lang="fr" data-theme={theme}>
      <body>
        {children}
        <Toast />
      </body>
    </html>
  );
}
