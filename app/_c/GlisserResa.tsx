'use client';
// Planning : on attrape une réservation (barre turquoise clair) et on la lâche sur la ligne d'une autre voiture.
// Une confirmation s'affiche, puis la réservation change de voiture (si celle-ci est libre sur ces dates).
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ajusterPlanning } from '@/app/actions';

type Info = { genre: string; numero?: number; client?: string; tel?: string | null; debut?: string | null; fin?: string | null; statut?: string; prix?: number | null;
  caution?: { montant: number; statut: string } | null; voiture: string; garage?: string | null; raison?: string | null };
const quand = (d?: string | null) => (d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const dureeTexte = (a?: string | null, b?: string | null) => {
  if (!a || !b) return null;
  const h = Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 36e5);
  const j = Math.floor(h / 24), r = Math.round(h - j * 24);
  return j ? `${j} jour${j > 1 ? 's' : ''}${r ? ` ${r} h` : ''}` : `${r} h`;
};
const STATUTS: Record<string, string> = { reservee: 'Réservée', en_cours: 'En cours', terminee: 'Terminée' };
const CAUTION: Record<string, string> = { a_prendre: 'à prendre', prise: 'prise', rendue: 'rendue', encaissee: 'encaissée', litige: 'en litige' };
type Projet = { loc: string; libelle: string; vehicule: string | null; plaque: string; decalage: number; finJour: string | null };
const J = 86_400_000;
const ajouterJours = (jour: string, n: number) => new Date(Date.parse(jour + 'T12:00:00Z') + n * J).toISOString().slice(0, 10);
const ecart = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / J);
const jolieDate = (jour: string) => new Date(jour + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

export default function GlisserResa() {
  const ancre = useRef<HTMLSpanElement>(null);
  const router = useRouter();
  const [projet, setProjet] = useState<Projet | null>(null);
  const [etat, setEtat] = useState<'' | 'envoi' | 'ok'>('');
  const [message, setMessage] = useState('');
  const [info, setInfo] = useState<{ i: Info; x: number; y: number } | null>(null);

  useEffect(() => {
    const zone = ancre.current?.closest('[data-glisser]') as HTMLElement | null;
    if (!zone) return;
    let enMain: { loc: string; libelle: string; depuis: string; jourPris: string | null; etirer: boolean } | null = null;
    let survol: HTMLElement | null = null;
    const ligne = (e: Event) => (e.target as HTMLElement)?.closest?.('tr[data-vehicule]') as HTMLElement | null;
    // Jour sous le pointeur : case libre (data-jour) ou position dans une barre (premier jour visible + rang de la colonne)
    const jourSous = (e: DragEvent): string | null => {
      const td = (e.target as HTMLElement)?.closest?.('td') as HTMLElement | null;
      if (!td) return null;
      if (td.dataset.jour) return td.dataset.jour;
      if (td.dataset.jour0 && td.dataset.n) {
        const r = td.getBoundingClientRect(); const n = Number(td.dataset.n);
        return ajouterJours(td.dataset.jour0, Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n))));
      }
      return null;
    };
    const nettoyer = () => { survol?.classList.remove('cible', 'interdit'); survol = null; zone.classList.remove('glisse'); };
    const debut = (e: DragEvent) => {
      const poignee = (e.target as HTMLElement)?.closest?.('[data-etirer]') as HTMLElement | null;
      const b = poignee ?? (e.target as HTMLElement)?.closest?.('[data-resa]') as HTMLElement | null;
      if (!b) return;
      const barre = b.closest('a') as HTMLElement;
      enMain = { loc: poignee ? poignee.dataset.etirer! : b.dataset.resa!, libelle: b.dataset.libelle ?? '', depuis: barre?.dataset.vehiculeActuel ?? '', jourPris: poignee ? null : jourSous(e), etirer: !!poignee };
      e.dataTransfer?.setData('text/plain', enMain.loc);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      zone.classList.add('glisse');
      if (poignee) e.stopPropagation();
    };
    const dessus = (e: DragEvent) => {
      if (!enMain) return;
      const tr = ligne(e);
      if (tr !== survol) { survol?.classList.remove('cible', 'interdit'); survol = tr; }
      if (!tr) return;
      const interdit = enMain.etirer ? tr.dataset.vehicule !== enMain.depuis : tr.dataset.statut === 'maintenance';
      tr.classList.toggle('interdit', interdit); tr.classList.toggle('cible', !interdit);
      if (!interdit) e.preventDefault();
    };
    const lacher = (e: DragEvent) => {
      const tr = ligne(e);
      e.preventDefault();
      const jour = jourSous(e);
      if (enMain && tr && jour) {
        if (enMain.etirer) {
          if (tr.dataset.vehicule === enMain.depuis) { setProjet({ loc: enMain.loc, libelle: enMain.libelle, vehicule: null, plaque: '', decalage: 0, finJour: jour }); setEtat(''); setMessage(''); }
        } else {
          const decalage = enMain.jourPris ? ecart(enMain.jourPris, jour) : 0;
          const autre = tr.dataset.vehicule !== enMain.depuis;
          if (autre || decalage) { setProjet({ loc: enMain.loc, libelle: enMain.libelle, vehicule: autre ? tr.dataset.vehicule! : null, plaque: autre ? tr.dataset.plaque ?? '' : '', decalage, finJour: null }); setEtat(''); setMessage(''); }
        }
      }
      enMain = null; nettoyer();
    };
    const fin = () => { enMain = null; nettoyer(); };
    // Infobulle au survol : client, dates, durée, prix, caution
    const survole = (e: MouseEvent) => {
      const b = (e.target as HTMLElement)?.closest?.('[data-info]') as HTMLElement | null;
      if (!b || enMain) { setInfo(null); return; }
      try {
        const r = b.getBoundingClientRect();
        setInfo({ i: JSON.parse(b.dataset.info!), x: Math.min(Math.max(12, e.clientX - 140), window.innerWidth - 300), y: r.bottom + 8 > window.innerHeight - 200 ? r.top - 8 : r.bottom + 8 });
      } catch { setInfo(null); }
    };
    const sort = (e: MouseEvent) => { if (!(e.relatedTarget as HTMLElement)?.closest?.('[data-info]')) setInfo(null); };
    zone.addEventListener('mouseover', survole); zone.addEventListener('mouseout', sort);
    zone.addEventListener('dragstart', () => setInfo(null));
    zone.addEventListener('dragstart', debut); zone.addEventListener('dragover', dessus);
    zone.addEventListener('drop', lacher); zone.addEventListener('dragend', fin);
    return () => { zone.removeEventListener('mouseover', survole); zone.removeEventListener('mouseout', sort); zone.removeEventListener('dragstart', debut); zone.removeEventListener('dragover', dessus); zone.removeEventListener('drop', lacher); zone.removeEventListener('dragend', fin); };
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
    const r = await ajusterPlanning(projet.loc, { decalageJours: projet.decalage, vehicule_id: projet.vehicule, nouvelleFinJour: projet.finJour });
    if (r?.erreur) { setEtat(''); setMessage(r.erreur); return; }
    setEtat('ok'); router.refresh();
    setTimeout(() => setProjet(null), 1200);
  }

  return (
    <span ref={ancre}>
      {info && (
        <div className={`infobulle-resa ${info.i.genre}`} style={{ left: info.x, top: info.y, transform: info.y < (typeof window !== 'undefined' ? window.innerHeight / 2 : 0) ? undefined : 'translateY(-100%)' }}>
          {info.i.genre === 'loc' ? <>
            <div className="ib-haut"><b>{info.i.client || 'Client'}</b><span className={`ib-statut ${info.i.statut}`}>{STATUTS[info.i.statut ?? ''] ?? info.i.statut}</span></div>
            <div className="gris">N° {info.i.numero} · {info.i.voiture}</div>
            <div className="ib-dates"><span>Départ</span><b>{quand(info.i.debut)}</b><span>{info.i.statut === 'terminee' ? 'Rendue' : 'Retour'}</span><b>{quand(info.i.fin)}</b><span>Durée</span><b>{dureeTexte(info.i.debut, info.i.fin)}</b>
              {info.i.prix != null && <><span>Prix</span><b>{Number(info.i.prix).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</b></>}
              {info.i.caution && <><span>Caution</span><b>{Number(info.i.caution.montant).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} · {CAUTION[info.i.caution.statut] ?? info.i.caution.statut}</b></>}
              {info.i.tel && <><span>Téléphone</span><b>{info.i.tel}</b></>}</div>
            <div className="ib-pied">{info.i.statut === 'en_cours' ? 'Tirez le bord droit de la barre pour prolonger · clic pour ouvrir' : info.i.statut === 'reservee' ? 'Glissez la barre vers un autre jour ou une autre voiture · tirez son bord droit pour changer le retour · clic pour ouvrir' : 'Clic pour ouvrir la location'}</div>
          </> : <>
            <div className="ib-haut"><b>{info.i.genre === 'transfert' ? 'Transfert' : 'Maintenance'}</b><span className="ib-statut maintenance">{info.i.garage || 'Garage'}</span></div>
            <div className="gris">{info.i.voiture}{info.i.raison ? ' · ' + info.i.raison : ''}</div>
            <div className="ib-dates"><span>Entrée</span><b>{quand(info.i.debut)}</b><span>Sortie prévue</span><b>{quand(info.i.fin)}</b>
              {info.i.debut && <><span>Immobilisée</span><b>{dureeTexte(info.i.debut, new Date().toISOString())}</b></>}</div>
            <div className="ib-pied">Clic pour ouvrir la fiche maintenance</div>
          </>}
        </div>
      )}
      {projet && (
        <div className="glisser-confirme" role="dialog" aria-live="polite">
          <div>
            <b>{etat === 'ok' ? (projet.finJour ? 'Date de retour modifiée' : 'Réservation déplacée') : projet.finJour ? 'Changer la date de retour ?' : 'Déplacer la réservation ?'}</b>
            <span>Location {projet.libelle}
              {projet.finJour && <> · retour le <b>{jolieDate(projet.finJour)}</b> (même heure)</>}
              {projet.decalage !== 0 && <> · {projet.decalage > 0 ? 'décalée de' : 'avancée de'} <b>{Math.abs(projet.decalage)} jour{Math.abs(projet.decalage) > 1 ? 's' : ''}</b></>}
              {projet.vehicule && <> · sur <b>{projet.plaque}</b></>}
            </span>
            <span className="gris" style={{ fontSize: 13 }}>Le prix suit la nouvelle durée au tarif journalier de la voiture.</span>
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
