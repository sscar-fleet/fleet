import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SS CAR FLEET',
  description: 'Gestion de flotte pour loueurs',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
