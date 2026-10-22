'use client';
// Actions groupées : cocher plusieurs lignes (cases .selection[data-sel]) puis agir d'un coup depuis la barre du bas.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { annoncer } from './Toast';
import { statutAmendes } from '../actions';

const ACTIONS: Record<string, { statut: string; libelle: string; principal?: boolean }[]> = {
  amendes: [{ statut: 'designee', libelle: 'Marquer désignées', principal: true }, { statut: 'payee', libelle: 'Payées par l’agence' }],
};

export default function BarreSelection({ genre }: { genre: keyof typeof ACTIONS }) {
  const [ids, setIds] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const lire = () => setIds([...document.querySelectorAll<HTMLInputElement>('input.selection[data-sel]:checked')].map((x) => x.dataset.sel!));
    document.addEventListener('change', lire);
    return () => document.removeEventListener('change', lire);
  }, []);
  const toutes = () => { const cases = [...document.querySelectorAll<HTMLInputElement>('input.selection[data-sel]')]; const tout = cases.some((c) => !c.checked); cases.forEach((c) => { c.checked = tout; }); setIds(tout ? cases.map((c) => c.dataset.sel!) : []); };
  async function agir(statut: string, libelle: string) {
    setEnvoi(true);
    const r = await statutAmendes(ids, statut);
    setEnvoi(false);
    if (r?.erreur) { annoncer(r.erreur, true); return; }
    annoncer(`${libelle} : ${ids.length} amende${ids.length > 1 ? 's' : ''}${statut === 'designee' ? ' (celles sans conducteur sont laissées de côté)' : ''}`);
    document.querySelectorAll<HTMLInputElement>('input.selection[data-sel]').forEach((c) => { c.checked = false; });
    setIds([]); router.refresh();
  }
  return (
    <>
      <button type="button" className="bouton petit" onClick={toutes}>Tout sélectionner</button>
      {ids.length > 0 && (
        <div className="barre-selection" role="region" aria-label="Actions groupées">
          <b>{ids.length} sélectionnée{ids.length > 1 ? 's' : ''}</b>
          <span className="ligne">
            {ACTIONS[genre].map((a) => <button key={a.statut} type="button" disabled={envoi} className={`bouton ${a.principal ? 'principal' : ''}`} onClick={() => agir(a.statut, a.libelle)}>{a.libelle}</button>)}
            <button type="button" className="bouton" onClick={() => { document.querySelectorAll<HTMLInputElement>('input.selection[data-sel]').forEach((c) => { c.checked = false; }); setIds([]); }}>Annuler</button>
          </span>
        </div>
      )}
    </>
  );
}
