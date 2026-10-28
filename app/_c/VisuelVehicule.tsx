'use client';
// Photo « catalogue » du modèle (de profil, fond détouré, même angle pour toute la flotte) quand elle existe,
// sinon le logo de la marque. La photo n’est proposée que si la clé CAR_IMAGE_API_KEY est en place (voir lib/visuel).
import { useState } from 'react';
import LogoMarque from './LogoMarque';

export default function VisuelVehicule({ src, marque, modele, grand }: { src: string | null; marque?: string | null; modele?: string | null; grand?: boolean }) {
  const [rate, setRate] = useState(false);
  if (src && !rate) return <img className={grand ? 'visuel-catalogue grand' : 'vignette visuel-catalogue'} src={src} alt={`${marque ?? ''} ${modele ?? ''}`.trim()} loading="lazy" onError={() => setRate(true)} />;
  return <LogoMarque marque={marque} modele={modele} className={grand ? 'logo-marque grand' : 'vignette logo-marque'} />;
}
