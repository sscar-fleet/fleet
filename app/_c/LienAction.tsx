'use client';
// Lien qui ouvre WhatsApp (ou un site) et note l'action dans Fleet en même temps : un seul geste
import { useState, useTransition } from 'react';

export default function LienAction({ href, action, children, className = 'bouton petit', copier }: {
  href: string; action?: () => Promise<any>; children: React.ReactNode; className?: string; copier?: string;
}) {
  const [, demarrer] = useTransition();
  const [ok, setOk] = useState(false);
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer" onClick={() => {
      if (copier) navigator.clipboard?.writeText(copier).catch(() => {});
      if (action) demarrer(async () => { await action(); setOk(true); });
    }}>{children}{ok ? ' ✓' : ''}</a>
  );
}
