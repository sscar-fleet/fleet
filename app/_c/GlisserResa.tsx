'use client';
// Planning : on attrape une réservation (barre turquoise clair) et on la lâche sur la ligne d'une autre voiture.
// Une confirmation s'affiche, puis la réservation change de voiture (si celle-ci est libre sur ces dates).
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deplacerReservation } from '@/app/actions';

type Projet = { loc: string; libelle: string; vehicule: string; plaque: string };

export default function GlisserResa() {
  const ancre = useRef<HTMLSpanElement>(null);
  const router = useRouter();
  const [projet, setProjet] = useState<Projet | null>(null);
  const [etat, setEtat] = useState<'' | 'envoi' | 'ok'>('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const zone = ancre.current?.closest('[data-glisser]') as HTMLElement | null;
    if (!zone) return;
    let enMain: { loc: string; libelle: string; depuis: string } | null = null;
    let survol: HTMLElement | null = null;
    const ligne = (e: Event) => (e.target as HTMLElement)?.closest?.('tr[data-vehicule]') as HTMLElement | null;
    const nettoyer = () => { survol?.classList.remove('cible', 'interdit'); survol = null; zone.classList.remove('glisse'); };
    const debut = (e: DragEvent) => {
      const b = (e.target as HTMLElement)?.closest?.('[data-resa]') as HTMLElement | null;
      if (!b) return;
      enMain = { loc: b.dataset.resa!, libelle: b.dataset.libelle ?? '', depuis: b.dataset.vehiculeActuel ?? '' };
      e.dataTransfer?.setData('text/plain', enMain.loc);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      zone.classList.add('glisse');
    };
    const dessus = (e: DragEvent) => {
      if (!enMain) return;
      const tr = ligne(e);
      if (tr !== survol) { survol?.classList.remove('cible', 'interdit'); survol = tr; }
      if (!tr) return;
      const interdit = tr.dataset.vehicule === enMain.depuis || tr.dataset.statut === 'maintenance';
      tr.classList.toggle('interdit', interdit); tr.classList.toggle('cible', !interdit);
      if (!interdit) e.preventDefault();
    };
    const lacher = (e: DragEvent) => {
      const tr = ligne(e);
      e.preventDefault();
      if (enMain && tr && tr.dataset.vehicule !== enMain.depuis) {
        setProjet({ loc: enMain.loc, libelle: enMain.libelle, vehicule: tr.dataset.vehicule!, plaque: tr.dataset.plaque ?? '' });
        setEtat(''); setMessage('');
      }
      enMain = null; nettoyer();
    };
    const fin = () => { enMain = null; nettoyer(); };
    zone.addEventListener('dragstart', debut); zone.addEventListener('dragover', dessus);
    zone.addEventListener('drop', lacher); zone.addEventListener('dragend', fin);
    return () => { zone.removeEventListener('dragstart', debut); zone.removeEventListener('dragover', dessus); zone.removeEventListener('drop', lacher); zone.removeEventListener('dragend', fin); };
  }, []);

  useEffect(() => {
    if (!projet) return;
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setProjet(null); };
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [projet]);

  async function confirmer() {
    if (!projet) return;
    setEtat('envoi');
    const r = await deplacerReservation(projet.loc, projet.vehicule);
    if (r?.erreur) { setEtat(''); setMessage(r.erreur); return; }
    setEtat('ok'); router.refresh();
    setTimeout(() => setProjet(null), 1200);
  }

  return (
    <span ref={ancre}>
      {projet && (
        <div className="glisser-confirme" role="dialog" aria-live="polite">
          <div>
            <b>{etat === 'ok' ? 'Réservation déplacée' : 'Changer de voiture ?'}</b>
            <span>Réservation {projet.libelle} → <b>{projet.plaque}</b></span>
            {message && <span className="erreur">{message}</span>}
          </div>
          {etat !== 'ok' && <div className="ligne">
            <button type="button" className="bouton" onClick={() => setProjet(null)}>Annuler</button>
            <button type="button" className="bouton principal" disabled={etat === 'envoi'} onClick={confirmer}>{etat === 'envoi' ? 'Changement…' : 'Confirmer'}</button>
          </div>}
        </div>
      )}
    </span>
  );
}
