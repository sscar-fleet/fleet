'use client';
import { useEffect, useState } from 'react';

// Fiche découpée en onglets : on touche l'onglet voulu au lieu de faire défiler une longue page.
// L'onglet ouvert est gardé dans l'adresse (#papiers…) pour revenir au même endroit.
export default function Onglets({ panneaux }: { panneaux: { cle: string; titre: string; badge?: number; contenu: React.ReactNode }[] }) {
  const [actif, setActif] = useState(panneaux[0]?.cle);
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (panneaux.some((p) => p.cle === h)) setActif(h);
  }, [panneaux]);
  const choisir = (cle: string) => { setActif(cle); history.replaceState(null, '', '#' + cle); };
  return (
    <>
      <div className="onglets" role="tablist">
        {panneaux.map((p) => (
          <button key={p.cle} role="tab" aria-selected={actif === p.cle} className={actif === p.cle ? 'actif' : ''} onClick={() => choisir(p.cle)}>
            {p.titre}{p.badge ? <span className="badge rouge">{p.badge}</span> : null}
          </button>
        ))}
      </div>
      {panneaux.map((p) => <div key={p.cle} hidden={actif !== p.cle}>{p.contenu}</div>)}
    </>
  );
}
