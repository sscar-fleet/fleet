'use client';
import { useState } from 'react';
import { badgeSport, logoMarque } from '@/lib/logoMarque';

// Logo de la marque posé directement sur le fond (sans pastille ni contour) ; rien si la marque n'est pas reconnue
export default function LogoMarque({ marque, modele, className = 'vignette logo-marque' }: { marque?: string | null; modele?: string | null; className?: string }) {
  const [rate, setRate] = useState(false);
  const src = logoMarque(marque, modele);
  if (!src || rate) return <span className={className} />;
  return <img className={className} src={src} alt={marque ?? ''} onError={() => setRate(true)} loading="lazy" />;
}

// Badge sport (RS, AMG, M, GTI…) déduit de la marque et du modèle
export function BadgeSport({ marque, modele, petit }: { marque?: string | null; modele?: string | null; petit?: boolean }) {
  const b = badgeSport(marque, modele);
  if (!b) return null;
  return <span className={`badge-sport${petit ? ' petit' : ''}`} style={{ background: b.fond, color: b.encre }}>{b.texte}</span>;
}

// Version texte pour les cartes (repères en HTML)
export function badgeSportHtml(marque?: string | null, modele?: string | null, petit = true) {
  const b = badgeSport(marque, modele);
  return b ? `<span class="badge-sport${petit ? ' petit' : ''}" style="background:${b.fond};color:${b.encre}">${b.texte}</span>` : '';
}
