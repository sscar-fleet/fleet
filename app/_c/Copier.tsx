'use client';
import { useState } from 'react';

// Bouton qui copie un texte (un lien) dans le presse-papiers
export default function Copier({ texte, libelle = 'Copier le lien' }: { texte: string; libelle?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="bouton petit" onClick={async () => {
      try { await navigator.clipboard.writeText(texte); setOk(true); setTimeout(() => setOk(false), 2000); }
      catch { window.prompt('Copiez ce lien :', texte); }
    }}>{ok ? 'Copié' : libelle}</button>
  );
}
