'use client';
import { useEffect, useRef, useState } from 'react';
import { logoMarque } from '@/lib/logoMarque';

// Affiche le logo de la marque dès qu'elle est saisie (ou lue sur la carte grise)
export default function ApercuModele() {
  const ici = useRef<HTMLDivElement>(null);
  const [marque, setMarque] = useState('');
  const [rate, setRate] = useState(false);

  useEffect(() => {
    const form = ici.current?.closest('form');
    if (!form) return;
    const lire = () => {
      const m = form.querySelector<HTMLInputElement>('[name="marque"]')?.value.trim() ?? '';
      setMarque((avant) => { if (avant !== m) setRate(false); return m; });
    };
    form.addEventListener('input', lire);
    const veille = setInterval(lire, 1000); // la carte grise remplit les champs sans saisie
    return () => { form.removeEventListener('input', lire); clearInterval(veille); };
  }, []);

  const src = logoMarque(marque);
  return (
    <div ref={ici} className="pleine apercu-modele">
      {src && !rate ? <img src={src} alt={marque} onError={() => setRate(true)} /> : <div className="apercu-vide">🚗</div>}
      <span className="gris">{!marque ? 'Tapez la marque : son logo apparaît ici.' : src && !rate ? 'Logo de la marque' : 'Marque non reconnue, vérifiez l’orthographe.'}</span>
    </div>
  );
}
