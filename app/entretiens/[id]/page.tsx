import { notFound } from 'next/navigation';
import LogoMarque from '@/app/_c/LogoMarque';
import { utilisateurCourant, liensFichiers } from '@/lib/agence';
import { typesMaintenance, statutEntretien, dateHeure, euros, plaque, versJour } from '@/lib/format';
import * as A from '../../actions';
import Cadre from '../../_c/Cadre';
import Formulaire from '../../_c/Formulaire';
import Envoyer from '../../_c/Envoyer';
import Depot from '../../_c/Depot';

export const dynamic = 'force-dynamic';
const JOUR = 864e5;
const GENRES: Record<string, string> = { note: 'Note', appel: 'Appel au garage', date: 'Nouvelle date' };

// Fiche maintenance : où en est la voiture, ce que ça coûte, ce qu'elle ne rapporte pas, et le suivi au fil des jours
export default async function FicheMaintenance({ params }: { params: { id: string } }) {
  const { supabase, profil } = await utilisateurCourant();
  const { data: e } = await supabase.from('entretiens').select('*, vehicules(id, immatriculation, marque, modele, prix_jour, km, statut)').eq('id', params.id).maybeSingle();
  if (!e) notFound();
  const v = (e as any).vehicules;
  const [{ data: suivi }, { data: pieces }, { data: equipe }, { data: resas }] = await Promise.all([
    supabase.from('entretien_suivi').select('*').eq('entretien_id', e.id).order('created_at', { ascending: false }),
    supabase.from('pieces_jointes').select('id, nom, path, created_at').eq('entretien_id', e.id).order('created_at'),
    supabase.from('utilisateurs').select('id, nom'),
    v ? supabase.from('locations').select('id, numero, debut, clients(nom)').eq('vehicule_id', v.id).eq('statut', 'reservee').order('debut').limit(5) : Promise.resolve({ data: [] as any[] }),
  ]);
  const liens = await liensFichiers(supabase, [e.devis_path, ...(pieces ?? []).map((p: any) => p.path)]);
  const nom = (id: string | null) => (equipe ?? []).find((u: any) => u.id === id)?.nom ?? '';

  // Immobilisation et manque à gagner
  const depuis = new Date(e.debut ?? e.created_at).getTime();
  const jusqua = e.fin ? new Date(e.fin).getTime() : Date.now();
  const jours = Math.max(1, Math.ceil((jusqua - depuis) / JOUR));
  const joursPrevus = e.retour_prevu && !e.fin ? Math.max(0, Math.ceil((new Date(e.retour_prevu).getTime() - Date.now()) / JOUR)) : 0;
  const prixJour = Number(v?.prix_jour ?? 0);
  const perdu = prixJour * jours;
  const retard = e.statut === 'en_cours' && e.retour_prevu && new Date(e.retour_prevu).getTime() < Date.now();
  const coutFactures = Number(e.cout ?? 0);
  const voiture = [v?.marque, v?.modele].filter(Boolean).join(' ');
  const touchees = (resas ?? []).filter((r: any) => e.statut !== 'termine' && e.retour_prevu && new Date(r.debut) < new Date(e.retour_prevu));

  return (
    <Cadre retour={{ lien: '/entretiens', texte: 'Maintenance' }} tables={['entretiens', 'entretien_suivi', 'pieces_jointes']}
      titre={<span className="ligne" style={{ gap: 12 }}><LogoMarque marque={v?.marque} modele={v?.modele} />{plaque(v?.immatriculation)} · {typesMaintenance[e.type] ?? 'Entretien'}</span>}
      actions={<>
        {v && <a className="bouton" href={`/vehicules/${v.id}`}>Fiche du véhicule</a>}
        {e.garage_tel && <a className="bouton" href={`tel:${String(e.garage_tel).replace(/\s/g, '')}`}>Appeler le garage</a>}
        {e.statut === 'prevu' && <Formulaire action={A.demarrerEntretien.bind(null, e.id)}><Envoyer>Démarrer la maintenance</Envoyer></Formulaire>}
      </>}>

      <section className="chiffres">
        <div><span>Statut</span><b><span className={`pastille ${retard ? 'retard' : e.statut}`}>{retard ? 'Sortie en retard' : statutEntretien[e.statut]}</span></b></div>
        <div><span>{e.fin ? 'Immobilisée' : 'Immobilisée depuis'}</span><b>{jours} jour{jours > 1 ? 's' : ''}</b>{joursPrevus > 0 && <small className="gris">encore {joursPrevus} j prévus</small>}</div>
        <div><span>Sortie prévue</span><b>{e.fin ? 'Sortie le ' + dateHeure(e.fin) : e.retour_prevu ? dateHeure(e.retour_prevu) : '—'}</b></div>
        <div><span>Réparations</span><b>{coutFactures ? euros(coutFactures) : '—'}</b></div>
        <div title="Jours immobilisés × prix par jour du véhicule"><span>Manque à gagner</span><b className={perdu ? 'rouge' : ''}>{prixJour ? euros(perdu) : '—'}</b>{prixJour ? <small className="gris">{euros(prixJour)} / jour{joursPrevus ? ` · +${euros(prixJour * joursPrevus)} d’ici la sortie` : ''}</small> : <small className="gris">prix/jour non renseigné</small>}</div>
      </section>

      {touchees.length > 0 && (
        <div className="alerte-caution" style={{ display: "block" }}>
          <b>{touchees.length} réservation{touchees.length > 1 ? 's' : ''} sur cette voiture avant la sortie prévue.</b>
          {touchees.map((r: any) => <span key={r.id}> <a className="lien" href={`/locations/${r.id}`}>N° {r.numero} · {r.clients?.nom} · {dateHeure(r.debut)}</a></span>)}
          <span className="gris"> Changez-les de voiture depuis le planning (glisser la barre) ou la fiche de la location.</span>
        </div>
      )}

      <div className="deux-colonnes">
        <section className="carte">
          <h2>Suivi</h2>
          <Formulaire vider action={A.noteEntretien.bind(null, e.id)} className="grille" succes="Ajouté au suivi">
            <label>Quoi<select name="genre" defaultValue="appel"><option value="appel">Appel au garage</option><option value="note">Note</option></select></label>
            <label>Nouvelle date de sortie<input name="retour_prevu" type="datetime-local" min={versJour(new Date()) + 'T00:00'} /></label>
            <label className="pleine">Note<textarea name="texte" rows={2} placeholder="Appelé le garage : pièce commandée, sortie prévue la semaine prochaine." /></label>
            <Envoyer>Ajouter au suivi</Envoyer>
          </Formulaire>
          <ol className="fil-suivi">
            {(suivi ?? []).map((s: any) => (
              <li key={s.id} className={s.genre}>
                <div className="gris" style={{ fontSize: 12.5 }}>{dateHeure(s.created_at)} · {GENRES[s.genre] ?? 'Note'}{nom(s.auteur) ? ' · ' + nom(s.auteur) : ''}</div>
                {s.texte && <div>{s.texte}</div>}
                {s.retour_prevu && <div><b>Sortie prévue : {dateHeure(s.retour_prevu)}</b></div>}
              </li>
            ))}
            <li className="debut">
              <div className="gris" style={{ fontSize: 12.5 }}>{dateHeure(e.debut ?? e.created_at)} · {e.statut === 'prevu' ? 'Prévue' : 'Entrée en maintenance'}</div>
              <div>{e.raison}{e.garage ? ' · ' + e.garage : ''}{e.commentaire ? ' · ' + e.commentaire : ''}</div>
            </li>
          </ol>
        </section>

        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <section className="carte">
            <h2>Factures et devis du réparateur</h2>
            <Depot agenceId={profil.agence_id} dossier={`entretiens/${e.id}`} libelle="Factures et devis" action={A.ajouterPiece.bind(null, { entretien_id: e.id, vehicule_id: v?.id })}
              pieces={[...(e.devis_path ? [{ id: 'devis', nom: 'Devis', lien: liens[e.devis_path] }] : []), ...(pieces ?? []).map((p: any) => ({ id: p.id, nom: p.nom, lien: liens[p.path] }))]} />
          </section>

          <section className="carte">
            <h2>Détails</h2>
            <Formulaire action={A.majEntretien.bind(null, e.id)} className="grille" succes="Enregistré">
              <label>Type<select name="type" defaultValue={e.type}>{Object.entries(typesMaintenance).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>
              <label>Travaux<input name="raison" defaultValue={e.raison ?? ''} /></label>
              <label>Garage<input name="garage" defaultValue={e.garage ?? ''} /></label>
              <label>Téléphone du garage<input name="garage_tel" type="tel" defaultValue={e.garage_tel ?? ''} /></label>
              <label>Coût total (€)<input name="cout" type="number" step="0.01" defaultValue={e.cout ?? ''} /></label>
              <label>Km à l’entrée<input name="km" type="number" defaultValue={e.km ?? v?.km ?? ''} /></label>
              <label className="pleine">Commentaire<input name="commentaire" defaultValue={e.commentaire ?? ''} /></label>
              <Envoyer className="bouton">Enregistrer</Envoyer>
            </Formulaire>
          </section>

          {e.statut === 'en_cours' && (
            <section className="carte">
              <h2>La voiture est sortie ?</h2>
              <Formulaire action={A.terminerEntretien.bind(null, e.id)} className="grille" succes="Maintenance terminée : la voiture est disponible" confirmer="Terminer la maintenance et remettre la voiture disponible ?">
                <label>Coût final (€)<input name="cout" type="number" step="0.01" defaultValue={e.cout ?? ''} /></label>
                <Envoyer>Terminer : voiture disponible</Envoyer>
              </Formulaire>
            </section>
          )}
        </div>
      </div>
    </Cadre>
  );
}
