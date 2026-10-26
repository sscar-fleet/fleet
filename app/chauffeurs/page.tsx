import { utilisateurCourant } from '@/lib/agence';
import { date, tel } from '@/lib/format';
import { nomChauffeur, lundiDe, semaineDe } from '@/lib/transport';
import * as T from '../tournees/actions';
import Cadre from '../_c/Cadre';
import Formulaire from '../_c/Formulaire';
import Envoyer from '../_c/Envoyer';

export const dynamic = 'force-dynamic';
const JOUR = 864e5;

// Chauffeurs : liste, ajout un par un ou toute la liste d'un coup, dépôt, ville (pour les camions partagés), absences
export default async function Chauffeurs() {
  const { supabase } = await utilisateurCourant();
  const aujourdhui = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const semaine = semaineDe(lundiDe(aujourdhui));
  const [{ data: chauffeurs }, { data: depots }, { data: indispos }, { data: tournees }] = await Promise.all([
    supabase.from('chauffeurs').select('*').eq('actif', true).order('prenom').order('nom'),
    supabase.from('depots').select('*').eq('actif', true).order('nom'),
    supabase.from('indispos_chauffeurs').select('*').gte('au', aujourdhui).order('du'),
    supabase.from('tournees').select('chauffeur_id, jour').gte('jour', semaine[0]).lte('jour', semaine[6]).neq('statut', 'annulee'),
  ]);
  const depot = (id?: string | null) => (depots ?? []).find((d: any) => d.id === id);
  const permisAVerifier = (c: any) => !c.permis_valide_le || Date.now() - new Date(c.permis_valide_le).getTime() > 90 * JOUR;
  const choixDepot = (valeur?: string | null) => (
    <select name="depot_id" defaultValue={valeur ?? ''}><option value="">—</option>{(depots ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select>
  );

  return (
    <Cadre titre={`Chauffeurs (${chauffeurs?.length ?? 0})`} tables={['chauffeurs']} actions={<a className="bouton petit" href="/tournees">Planning des tournées</a>}>
      <div className="deux-colonnes">
        <section className="carte">
          <h2 style={{ marginTop: 0 }}>Ajouter un chauffeur</h2>
          <Formulaire action={T.ajouterChauffeur} className="grille" vider succes="Chauffeur ajouté">
            <label>Prénom<input name="prenom" /></label>
            <label>Nom *<input name="nom" required /></label>
            <label>Téléphone<input name="telephone" type="tel" /></label>
            <label>Ville<input name="ville" placeholder="Pour partager les camions entre voisins" /></label>
            <label>Dépôt{choixDepot()}</label>
            <Envoyer>Ajouter</Envoyer>
          </Formulaire>
        </section>
        <section className="carte">
          <h2 style={{ marginTop: 0 }}>Ajouter toute la liste d&apos;un coup</h2>
          <p className="gris" style={{ marginTop: 0, fontSize: 13.5 }}>Une ligne par chauffeur : <b>Prénom Nom ; téléphone ; ville ; dépôt</b>. Vous pouvez coller directement depuis Excel.</p>
          <Formulaire action={T.importerChauffeurs} vider succes="Chauffeurs ajoutés">
            <textarea name="liste" rows={6} placeholder={'Karim Benali ; 06 12 34 56 78 ; Brétigny ; Wissous\nYanis Laurent ; 07 98 76 54 32 ; Évry ; Wissous'} style={{ width: '100%' }} />
            <div className="ligne" style={{ marginTop: 8 }}><label>Dépôt par défaut {choixDepot()}</label><Envoyer>Ajouter la liste</Envoyer></div>
          </Formulaire>
        </section>
      </div>

      <section className="carte">
        <h2 style={{ marginTop: 0 }}>Absences à venir</h2>
        <Formulaire action={T.ajouterIndispo} className="grille" vider succes="Absence enregistrée">
          <label>Chauffeur *<select name="chauffeur_id" required><option value="">Choisir…</option>{(chauffeurs ?? []).map((c: any) => <option key={c.id} value={c.id}>{nomChauffeur(c)}</option>)}</select></label>
          <label>Du *<input name="du" type="date" required min={aujourdhui} /></label>
          <label>Au<input name="au" type="date" min={aujourdhui} /></label>
          <label>Motif<input name="motif" placeholder="Congés, maladie…" /></label>
          <Envoyer>Enregistrer</Envoyer>
        </Formulaire>
        {(indispos ?? []).map((i: any) => {
          const c = (chauffeurs ?? []).find((x: any) => x.id === i.chauffeur_id);
          return (
            <div key={i.id} className="fichier">
              <span><b>{nomChauffeur(c) || 'Chauffeur'}</b> · {i.du === i.au ? `le ${date(i.du)}` : `du ${date(i.du)} au ${date(i.au)}`}{i.motif ? <span className="gris"> · {i.motif}</span> : null}</span>
              <Formulaire action={T.supprimerIndispo.bind(null, i.id)} succes="Absence retirée"><Envoyer className="bouton petit">Retirer</Envoyer></Formulaire>
            </div>
          );
        })}
      </section>

      <section className="carte">
        <h2 style={{ marginTop: 0 }}>Tous les chauffeurs</h2>
        {!(chauffeurs ?? []).length && <p className="gris">Aucun chauffeur pour l&apos;instant.</p>}
        {(chauffeurs ?? []).map((c: any) => {
          const n = (tournees ?? []).filter((t: any) => t.chauffeur_id === c.id).length;
          return (
            <details key={c.id} className="ligne-chauffeur">
              <summary>
                <span><b>{nomChauffeur(c)}</b>{c.ville ? <span className="gris"> · {c.ville}</span> : null}{depot(c.depot_id) ? <span className="gris"> · {depot(c.depot_id).nom}</span> : null}</span>
                <span className="ligne" style={{ gap: 8 }}>
                  {permisAVerifier(c) && <span className="pastille proche" title="Pas de preuve de validité du permis depuis 3 mois">Permis à vérifier</span>}
                  <span className="gris">{n} tournée{n > 1 ? 's' : ''} cette semaine</span>
                  {c.telephone && <a className="bouton petit" href={`tel:${String(c.telephone).replace(/\s/g, '')}`}>Appeler</a>}
                </span>
              </summary>
              <Formulaire action={T.modifierChauffeur.bind(null, c.id)} className="grille" succes="Chauffeur modifié">
                <label>Prénom<input name="prenom" defaultValue={c.prenom ?? ''} /></label>
                <label>Nom *<input name="nom" required defaultValue={c.nom} /></label>
                <label>Téléphone<input name="telephone" type="tel" defaultValue={c.telephone ? tel(c.telephone) : ''} /></label>
                <label>Ville<input name="ville" defaultValue={c.ville ?? ''} /></label>
                <label>Dépôt{choixDepot(c.depot_id)}</label>
                <label>Permis vérifié le<input name="permis_valide_le" type="date" defaultValue={c.permis_valide_le ?? ''} max={aujourdhui} /></label>
                <label className="pleine">Note<input name="note" defaultValue={c.note ?? ''} /></label>
                <Envoyer>Enregistrer</Envoyer>
              </Formulaire>
              <Formulaire action={T.archiverChauffeur.bind(null, c.id)} confirmer={`Retirer ${nomChauffeur(c)} ? Il sort des plannings à venir (l'historique est gardé).`} succes="Chauffeur retiré">
                <Envoyer className="bouton petit">Retirer ce chauffeur</Envoyer>
              </Formulaire>
            </details>
          );
        })}
      </section>
    </Cadre>
  );
}
