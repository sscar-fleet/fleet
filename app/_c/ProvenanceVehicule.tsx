'use client';
// Notre véhicule ou véhicule prêté par un confrère : dans le second cas, pas de financement ni de prix d'achat
import { useEffect, useRef, useState } from 'react';
import { financements } from '@/lib/format';

export default function ProvenanceVehicule({ v = {} as any }: { v?: any }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pret, setPret] = useState(v.financement === 'pret');
  useEffect(() => {
    // Les champs de coût (financement, coût mensuel, prix d'achat) disparaissent pour un prêt
    ref.current?.closest('form')?.querySelectorAll<HTMLElement>('[data-cout]').forEach((el) => {
      el.style.display = pret ? 'none' : '';
      el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((c) => { c.disabled = pret; });
    });
  }, [pret]);
  return (
    <div ref={ref} className="pleine provenance">
      <span className="champ-titre">Provenance</span>
      <div className="choix-provenance">
        <label className={!pret ? 'actif' : ''}><input type="radio" name="_provenance" checked={!pret} onChange={() => setPret(false)} /> Notre véhicule</label>
        <label className={pret ? 'actif' : ''}><input type="radio" name="_provenance" checked={pret} onChange={() => setPret(true)} /> Prêté par un confrère</label>
      </div>
      {pret ? (
        <div className="grille">
          <input type="hidden" name="financement" value="pret" />
          <label>Loueur qui prête le véhicule<input name="pret_par" defaultValue={v.pret_par ?? ''} placeholder="Nom de l'agence" autoComplete="off" /></label>
          <label>À lui rendre le<input name="pret_retour" type="date" defaultValue={v.pret_retour ?? ''} /></label>
          <p className="gris pleine" style={{ margin: 0, fontSize: 13.5 }}>Pas de prix d&apos;achat ni de leasing : le véhicule ne compte pas dans vos coûts de flotte.</p>
        </div>
      ) : (
        <label data-cout-select>Financement<select name="financement" defaultValue={v.financement && v.financement !== 'pret' ? v.financement : ''}><option value="">—</option>
          {Object.entries(financements).filter(([k]) => k !== 'pret').map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>
      )}
    </div>
  );
}
