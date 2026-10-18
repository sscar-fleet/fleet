'use client';
import { useState } from 'react';
import { logoMarque } from '@/lib/logoMarque';

// Logo de la marque, ou un emplacement vide si la marque n'est pas reconnue
export default function LogoMarque({ marque, modele, className = 'vignette logo-marque' }: { marque?: string | null; modele?: string | null; className?: string }) {
  const [rate, setRate] = useState(false);
  const src = logoMarque(marque, modele);
  if (!src || rate) return <span className={className} />;
  return <img className={className} src={src} alt={marque ?? ''} onError={() => setRate(true)} />;
}
