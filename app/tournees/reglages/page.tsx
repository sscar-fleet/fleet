import { utilisateurCourant } from '@/lib/agence';
import { euros, plaque } from '@/lib/format';
import { reglesDe } from '@/lib/planning';
import { JOURS_COURTS, heureCourte } from '@/lib/transport';
import * as T from '../actions';
import Cadre from '../../_c/Cadre';
import Formulaire from '../../_c/Formulaire';
import Envoyer from '../../_c/Envoyer';

export const dynamic = 'force-dynamic';
const COULEURS: [string, string][] = [['#f59e0b', 'Orange'], ['#3b82f6', 'Bleu'], ['#22c55e', 'Vert'], ['#a855f7', 'Violet'], ['#ef4444', 'Rouge'], ['#14b8a6', 'Turquoise'], ['#64748b', 'Gris']];

// Réglages de la version transport : dépôts, donneurs d'ordre et tarifs, tournées fixes, règles de planning
export default async function ReglagesTransport() {
  const { supabase, profil } = await utilisateurCourant();
  const gerant = profil.role === 'gerant';
  const [{ data: depots }, { data: donneurs }, { data: tarifs }, { data: fixes }, { data: vehicules }] = await Promise.all([
    supabase.from('depots').select('*').eq('actif', true).order('nom'),
    supabase.from('donneurs_ordre').select('*').eq('actif', true).order('nom'),
    supabase.from('tarifs_tournee').select('*'),
    supabase.from('tournees_fixes').select('*').eq('actif', true).order('debut'),
    supabase.from('vehicules').select('id, immatriculation, marque, modele, depot_id').neq('statut', 'sorti').order('immatriculation'),
  ]);
  const R = reglesDe(profil.agences?.regles_transport);
  const nomDe = (liste: any[] | null, id?: string | null) => (liste ?? []).find((x: any) => x.id === id)?.nom;
  const choix = (nom: string, liste: any[] | null, valeur?: string | null) => (
    <select name={nom} defaultValue={valeur ?? ''}><option value="">—</option>{(liste ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.nom}</option>)}</select>
  );

  return (
    <Cadre titre="Réglages transport" retour={{ lien: '/tournees', texte: 'Planning des tournées' }}>
      <section className="carte" id="regles">
        <h2 style={{ marginTop: 0 }}>Règles du planning automatique</h2>
        <p className="gris" style={{ marginTop: 0, fontSize: 13.5 }}>« Remplir la semaine » les respecte toutes. Vous pouvez toujours corriger une tournée à la main ensuite.</p>
        <Formulaire action={T.enregistrerRegles} className="grille" succes="Règles enregistrées">
          <label>Jours de repos minimum par semaine<input name="joursReposMin" type="number" min={0} max={6} defaultValue={R.joursReposMin} disabled={!gerant} /></label>
          <label>Jours travaillés d&apos;affilée au maximum<input name="joursConsecutifsMax" type="number" min={1} max={7} defaultValue={R.joursConsecutifsMax} disabled={!gerant} /></label>
          <label>Tournées par chauffeur et par jour<input name="creneauxMaxJour" type="number" min={1} max={6} defaultValue={R.creneauxMaxJour} disabled={!gerant} /></label>
          <label>Battement entre deux tournées (minutes)<input name="pauseMinutes" type="number" min={0} max={240} step={5} defaultValue={R.pauseMinutes} disabled={!gerant} /></label>
          <label>Alerte « pas encore parti » (minutes avant la tournée)<input name="prisePosteMinutes" type="number" min={0} max={240} step={5} defaultValue={R.prisePosteMinutes} disabled={!gerant} /></label>
          <label className="pleine case"><input type="checkbox" name="memeDepot" defaultChecked={R.memeDepot} disabled={!gerant} /> Un chauffeur ne tourne que sur son dépôt</label>
          <label className="pleine case"><input type="checkbox" name="partageCamion" defaultChecked={R.partageCamion} disabled={!gerant} /> Un camion peut servir à deux chauffeurs dans la journée (créneaux différents)</label>
          <label className="pleine case"><input type="checkbox" name="partageMemeVille" defaultChecked={R.partageMemeVille} disabled={!gerant} /> Partager un camion d&apos;abord entre chauffeurs de la même ville</label>
          <label className="pleine case"><input type="checkbox" name="regrouperCreneaux" defaultChecked={R.regrouperCreneaux} disabled={!gerant} /> Donner deux créneaux le même jour à un chauffeur plutôt que d&apos;appeler quelqu&apos;un de plus</label>
          {gerant && <Envoyer>Enregistrer les règles</Envoyer>}
        </Formulaire>
      </section>

      <div className="deux-colonnes">
        <section className="carte" id="depots">
          <h2 style={{ marginTop: 0 }}>Dépôts</h2>
          <Formulaire action={T.ajouterDepot} className="grille" vider succes="Dépôt ajouté">
            <label>Nom *<input name="nom" required placeholder="Ex. Wissous" /></label>
            <label>Adresse<input name="adresse" /></label>
            <Envoyer>Ajouter</Envoyer>
          </Formulaire>
          {(depots ?? []).map((d: any) => (
            <details key={d.id} className="ligne-chauffeur">
              <summary><span><b>{d.nom}</b>{d.adresse ? <span className="gris"> · {d.adresse}</span> : null}</span><span className="gris">{(vehicules ?? []).filter((v: any) => v.depot_id === d.id).length} camion(s)</span></summary>
              <Formulaire action={T.modifierDepot.bind(null, d.id)} className="grille" succes="Dépôt modifié">
                <label>Nom *<input name="nom" required defaultValue={d.nom} /></label>
                <label>Adresse<input name="adresse" defaultValue={d.adresse ?? ''} /></label>
                <Envoyer>Enregistrer</Envoyer>
              </Formulaire>
              <Formulaire action={T.archiverDepot.bind(null, d.id)} confirmer={`Retirer le dépôt ${d.nom} ?`} succes="Dépôt retiré"><Envoyer className="bouton petit">Retirer</Envoyer></Formulaire>
            </details>
          ))}
          {(depots ?? []).length > 0 && (vehicules ?? []).length > 0 && <>
            <h3>Camion de chaque dépôt</h3>
            {(vehicules ?? []).map((v: any) => (
              <Formulaire key={v.id} action={T.depotCamion.bind(null, v.id)} className="ligne" style={{ gap: 8, padding: '4px 0' }} succes="Dépôt du camion enregistré">
                <span style={{ minWidth: 150 }}><b>{plaque(v.immatriculation)}</b> <span className="gris">{[v.marque, v.modele].filter(Boolean).join(' ')}</span></span>
                <select name="valeur" defaultValue={v.depot_id ?? ''}><option value="">Tous dépôts</option>{(depots ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select>
                <Envoyer className="bouton petit">OK</Envoyer>
              </Formulaire>
            ))}
          </>}
        </section>

        <section className="carte" id="donneurs">
          <h2 style={{ marginTop: 0 }}>Donneurs d&apos;ordre</h2>
          <Formulaire action={T.ajouterDonneur} className="grille" vider succes="Donneur d'ordre ajouté">
            <label>Nom *<input name="nom" required placeholder="Ex. Amazon" /></label>
            <label>Tarif par tournée (€)<input name="tarif_tournee" type="number" step="0.01" min={0} /></label>
            <label>Couleur<select name="couleur">{COULEURS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
            <Envoyer>Ajouter</Envoyer>
          </Formulaire>
          {(donneurs ?? []).map((d: any) => (
            <details key={d.id} className="ligne-chauffeur">
              <summary><span><i className="puce-couleur" style={{ background: d.couleur ?? 'var(--gris)' }} /><b>{d.nom}</b></span><span>{d.tarif_tournee != null ? `${euros(d.tarif_tournee)} / tournée` : <span className="gris">Tarif à indiquer</span>}</span></summary>
              <Formulaire action={T.modifierDonneur.bind(null, d.id)} className="grille" succes="Donneur d'ordre modifié">
                <label>Nom *<input name="nom" required defaultValue={d.nom} /></label>
                <label>Tarif par tournée (€)<input name="tarif_tournee" type="number" step="0.01" min={0} defaultValue={d.tarif_tournee ?? ''} /></label>
                <label>Couleur<select name="couleur" defaultValue={d.couleur ?? ''}>{COULEURS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
                <Envoyer>Enregistrer</Envoyer>
              </Formulaire>
              {(depots ?? []).length > 1 && <>
                <p className="gris" style={{ fontSize: 13 }}>Tarif différent selon le dépôt (laisser vide pour le tarif général) :</p>
                {(depots ?? []).map((dep: any) => {
                  const t = (tarifs ?? []).find((x: any) => x.donneur_id === d.id && x.depot_id === dep.id);
                  return (
                    <Formulaire key={dep.id} action={T.tarifDepot} className="ligne" style={{ gap: 8, padding: '3px 0' }} succes="Tarif enregistré">
                      <input type="hidden" name="donneur_id" value={d.id} /><input type="hidden" name="depot_id" value={dep.id} />
                      <span style={{ minWidth: 120 }}>{dep.nom}</span>
                      <input name="tarif" type="number" step="0.01" min={0} defaultValue={t?.tarif ?? ''} placeholder={d.tarif_tournee ?? '€'} style={{ width: 110 }} />
                      <Envoyer className="bouton petit">OK</Envoyer>
                    </Formulaire>
                  );
                })}
              </>}
              <Formulaire action={T.archiverDonneur.bind(null, d.id)} confirmer={`Retirer ${d.nom} ?`} succes="Donneur d'ordre retiré"><Envoyer className="bouton petit">Retirer</Envoyer></Formulaire>
            </details>
          ))}
        </section>
      </div>

      <section className="carte" id="fixes">
        <h2 style={{ marginTop: 0 }}>Tournées fixes</h2>
        <p className="gris" style={{ marginTop: 0, fontSize: 13.5 }}>Les tournées qui reviennent chaque semaine (mêmes clients, mêmes horaires) : elles sont créées toutes seules dans le planning.</p>
        <Formulaire action={T.ajouterTourneeFixe} className="grille" vider succes="Tournée fixe ajoutée">
          <fieldset className="pleine jours-coches"><legend>Jours</legend>
            {JOURS_COURTS.map((j, i) => <label key={j}><input type="checkbox" name="jours" value={i + 1} defaultChecked={i < 5} /> {j}</label>)}
          </fieldset>
          <label>Début *<input name="debut" type="time" required defaultValue="07:00" /></label>
          <label>Fin *<input name="fin" type="time" required defaultValue="15:00" /></label>
          <label>Nombre par jour<input name="nombre" type="number" min={1} max={50} defaultValue={1} /></label>
          <label>Donneur d&apos;ordre{choix('donneur_id', donneurs)}</label>
          <label>Dépôt{choix('depot_id', depots)}</label>
          <label>Nom (facultatif)<input name="libelle" /></label>
          <label>Tarif (si différent)<input name="tarif" type="number" step="0.01" min={0} /></label>
          <Envoyer>Ajouter</Envoyer>
        </Formulaire>
        {(fixes ?? []).map((f: any) => (
          <div key={f.id} className="fichier">
            <span><b>{heureCourte(f.debut)}–{heureCourte(f.fin)}</b> · {nomDe(donneurs, f.donneur_id) ?? f.libelle ?? 'Tournée'}{nomDe(depots, f.depot_id) ? ` · ${nomDe(depots, f.depot_id)}` : ''}
              <span className="gris"> · {(f.jours ?? []).map((n: number) => JOURS_COURTS[n - 1]).join(', ')}{f.nombre > 1 ? ` · ×${f.nombre}` : ''}</span></span>
            <Formulaire action={T.archiverTourneeFixe.bind(null, f.id)} confirmer="Arrêter cette tournée fixe ? (les tournées déjà créées restent)" succes="Tournée fixe arrêtée"><Envoyer className="bouton petit">Arrêter</Envoyer></Formulaire>
          </div>
        ))}
      </section>
    </Cadre>
  );
}
