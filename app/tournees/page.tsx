import { utilisateurCourant } from '@/lib/agence';
import { euros, plaque } from '@/lib/format';
import { controler, reglesDe } from '@/lib/planning';
import { chargerSemaine, lundiDe, lundiValide, ajouterJours, JOURS_COURTS, heureCourte, nomChauffeur, tarifDe } from '@/lib/transport';
import * as T from './actions';
import Cadre from '../_c/Cadre';
import Formulaire from '../_c/Formulaire';
import Envoyer from '../_c/Envoyer';
import ChoixTournee from '../_c/ChoixTournee';
import ImportPlanning from '../_c/ImportPlanning';

export const dynamic = 'force-dynamic';
const jourLong = (j: string) => new Date(j + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const jourCourt = (j: string) => new Date(j + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// Planning des tournées de la semaine : un clic remplit tout selon les règles, on ajuste à la main ensuite
export default async function Tournees({ searchParams }: { searchParams: { semaine?: string; depot?: string } }) {
  const { supabase, profil } = await utilisateurCourant();
  const aujourdhui = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const lundi = lundiValide(searchParams.semaine) ?? lundiDe(aujourdhui);
  const depotFiltre = searchParams.depot && /^[0-9a-f-]{36}$/.test(searchParams.depot) ? searchParams.depot : null;
  const [s, { data: depots }, { data: donneurs }, { data: tarifs }] = await Promise.all([
    chargerSemaine(supabase, lundi),
    supabase.from('depots').select('*').eq('actif', true).order('nom'),
    supabase.from('donneurs_ordre').select('*').order('nom'),
    supabase.from('tarifs_tournee').select('*'),
  ]);
  const regles = reglesDe(profil.agences?.regles_transport);
  const tournees = s.tournees.filter((t: any) => !depotFiltre || t.depot_id === depotFiltre);
  const alertes = controler({ tournees: s.tournees, chauffeurs: s.chauffeurs, regles });
  const chauffeur = (id?: string | null) => s.chauffeurs.find((c: any) => c.id === id);
  const donneur = (id?: string | null) => (donneurs ?? []).find((d: any) => d.id === id);
  const depot = (id?: string | null) => (depots ?? []).find((d: any) => d.id === id);
  const absent = (cid: string, j: string) => s.indispos.some((i: any) => i.chauffeur_id === cid && i.du <= j && j <= i.au);

  const sansChauffeur = tournees.filter((t: any) => !t.chauffeur_id).length;
  const sansCamion = tournees.filter((t: any) => t.chauffeur_id && !t.vehicule_id).length;
  const chiffre = tournees.reduce((x: number, t: any) => x + (tarifDe(t, donneurs ?? [], tarifs ?? []) ?? 0), 0);
  const lien = (l: string, d = depotFiltre) => `/tournees?semaine=${l}${d ? `&depot=${d}` : ''}`;

  // Équité : tournées et jours travaillés par chauffeur sur la semaine affichée
  type Repartition = { c: any; n: number; jours: number; absences: number };
  const parChauffeur: Repartition[] = s.chauffeurs.filter((c: any) => !depotFiltre || c.depot_id === depotFiltre).map((c: any): Repartition => {
    const ts = s.tournees.filter((t: any) => t.chauffeur_id === c.id);
    const jours = new Set(ts.map((t: any) => t.jour));
    return { c, n: ts.length, jours: jours.size, absences: s.jours.filter((j) => absent(c.id, j)).length };
  });
  // Moyenne par dépôt : on compare chaque chauffeur à ceux de son dépôt (les volumes diffèrent d'un dépôt à l'autre)
  const moyenneDepot = (depotId?: string | null) => { const l = parChauffeur.filter((p) => p.c.depot_id === depotId); return l.length ? l.reduce((x, p) => x + p.n, 0) / l.length : 0; };

  const optionsChauffeurs = (t: any) => s.chauffeurs
    .filter((c: any) => !absent(c.id, t.jour) || c.id === t.chauffeur_id)
    .map((c: any) => ({ id: c.id, libelle: nomChauffeur(c) + (c.ville ? ` · ${c.ville}` : ''), groupe: t.depot_id && c.depot_id && c.depot_id !== t.depot_id ? 'Autres dépôts' : 'Son dépôt' }));
  const optionsCamions = (t: any) => s.vehicules.map((v: any) => ({ id: v.id, libelle: `${plaque(v.immatriculation)} · ${[v.marque, v.modele].filter(Boolean).join(' ')}${['maintenance', 'hors_service'].includes(v.statut) ? ' (atelier)' : ''}`, groupe: t.depot_id && v.depot_id && v.depot_id !== t.depot_id ? 'Autres dépôts' : 'Camions' }));

  const pasEncore = !(donneurs ?? []).length || !(depots ?? []).length || !s.chauffeurs.length;

  return (
    <Cadre titre="Planning des tournées" tables={['tournees', 'chauffeurs']}
      actions={<>
        <a className="bouton petit" href={lien(ajouterJours(lundi, -7))} aria-label="Semaine précédente">←</a>
        <a className="bouton petit" href={lien(lundiDe(aujourdhui))}>Cette semaine</a>
        <a className="bouton petit" href={lien(ajouterJours(lundi, 7))} aria-label="Semaine suivante">→</a>
        <a className="bouton petit" href="/tournees/rapport">Rapport d&apos;hier</a>
        <a className="bouton petit" href="/tournees/reglages">Réglages transport</a>
      </>}>
      {pasEncore && (
        <section className="carte mise-en-route">
          <h2 style={{ marginTop: 0 }}>Mise en route, en 4 étapes</h2>
          <ol>
            <li className={(depots ?? []).length ? 'fait' : ''}><a href="/tournees/reglages#depots">Vos dépôts</a></li>
            <li className={(donneurs ?? []).length ? 'fait' : ''}><a href="/tournees/reglages#donneurs">Vos donneurs d&apos;ordre et leur tarif par tournée</a></li>
            <li className={s.chauffeurs.length ? 'fait' : ''}><a href="/chauffeurs">Vos chauffeurs</a> (vous pouvez coller toute votre liste d&apos;un coup)</li>
            <li><a href="/tournees/reglages#regles">Vos règles de planning</a> (déjà réglées sur 2 jours de repos, 2 créneaux par jour)</li>
          </ol>
          {profil.role === 'gerant' && !s.chauffeurs.length && (
            <Formulaire action={T.chargerExemple.bind(null, lundi)} succes="Exemple chargé" style={{ marginTop: 12 }}>
              <p className="gris" style={{ fontSize: 13.5, margin: '0 0 8px' }}>Pour découvrir ou faire une démonstration : un exemple complet (chauffeurs, dépôts et tournées fictifs), effaçable en un clic.</p>
              <Envoyer className="bouton">Voir avec un exemple</Envoyer>
            </Formulaire>
          )}
        </section>
      )}

      <section className="compteurs deux">
        <div className="compteur"><span>Semaine du {jourCourt(lundi)}</span><b>{tournees.length} tournée{tournees.length > 1 ? 's' : ''}</b></div>
        <div className="compteur"><span>Sans chauffeur</span><b style={{ color: sansChauffeur ? 'var(--rouge)' : 'var(--vert)' }}>{sansChauffeur}</b></div>
        <div className="compteur"><span>Sans camion</span><b style={{ color: sansCamion ? 'var(--orange)' : 'var(--vert)' }}>{sansCamion}</b></div>
        <div className="compteur"><span>Chiffre de la semaine</span><b>{euros(chiffre)}</b></div>
      </section>

      <div className="ligne" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <Formulaire action={T.remplir.bind(null, lundi, depotFiltre)} succes="Planning rempli">
          <Envoyer className="bouton principal">Remplir la semaine</Envoyer>
        </Formulaire>
        <details className="formulaire">
          <summary className="bouton">+ Ajouter des tournées</summary>
          <div className="carte" style={{ marginTop: 8 }}>
            <Formulaire action={T.ajouterTournees} className="grille" succes="Tournées ajoutées">
              <fieldset className="pleine jours-coches"><legend>Jours</legend>
                {s.jours.map((j, i) => <label key={j}><input type="checkbox" name="jours" value={j} defaultChecked={i < 5 && j >= aujourdhui} /> {JOURS_COURTS[i]} {jourCourt(j)}</label>)}
              </fieldset>
              <label>Début *<input name="debut" type="time" required defaultValue="07:00" /></label>
              <label>Fin *<input name="fin" type="time" required defaultValue="12:00" /></label>
              <label>Nombre par jour<input name="nombre" type="number" min={1} max={50} defaultValue={1} /></label>
              <label>Donneur d&apos;ordre<select name="donneur_id"><option value="">—</option>{(donneurs ?? []).filter((d: any) => d.actif).map((d: any) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select></label>
              <label>Dépôt<select name="depot_id" defaultValue={depotFiltre ?? ''}><option value="">—</option>{(depots ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select></label>
              <label>Nom (facultatif)<input name="libelle" placeholder="Ex. vague 1" /></label>
              <label>Tarif (si différent)<input name="tarif" type="number" step="0.01" min={0} placeholder="€" /></label>
              <Envoyer>Ajouter</Envoyer>
            </Formulaire>
          </div>
        </details>
        <details className="formulaire">
          <summary className="bouton">Coller un planning (IA)</summary>
          <div className="carte" style={{ marginTop: 8, maxWidth: 640 }}><ImportPlanning lundi={lundi} lire={T.lirePlanningSemaine} creer={T.creerTourneesLues} /></div>
        </details>
        <Formulaire action={T.creerFixesSemaine.bind(null, lundi)} succes="Tournées fixes ajoutées"><Envoyer className="bouton">Ajouter les tournées fixes</Envoyer></Formulaire>
        {s.chauffeurs.some((c: any) => c.note === 'Exemple Fleet') && profil.role === 'gerant' && (
          <Formulaire action={T.effacerExemple} confirmer="Effacer tout l'exemple (chauffeurs, dépôts, tournées fictifs) ?" succes="Exemple effacé"><Envoyer className="bouton">Effacer l&apos;exemple</Envoyer></Formulaire>
        )}
        <Formulaire action={T.viderAffectations.bind(null, lundi)} confirmer="Effacer les chauffeurs et camions des tournées à venir de cette semaine ?" succes="Affectations effacées"><Envoyer className="bouton">Tout effacer</Envoyer></Formulaire>
        {(depots ?? []).length > 1 && (
          <span className="ligne" style={{ gap: 6, marginLeft: 'auto' }}>
            <a className={`bouton petit${!depotFiltre ? ' principal' : ''}`} href={lien(lundi, null)}>Tous les dépôts</a>
            {(depots ?? []).map((d: any) => <a key={d.id} className={`bouton petit${depotFiltre === d.id ? ' principal' : ''}`} href={lien(lundi, d.id)}>{d.nom}</a>)}
          </span>
        )}
      </div>

      <div className="semaine-tournees">
        {s.jours.map((j, i) => {
          const duJour = tournees.filter((t: any) => t.jour === j);
          return (
            <section key={j} className={`jour-tournees${j === aujourdhui ? ' aujourdhui' : ''}${j < aujourdhui ? ' passe' : ''}`}>
              <h3 title={jourLong(j)}>{JOURS_COURTS[i]} <span className="gris">{jourCourt(j)}</span> <b className="gris" style={{ float: 'right', fontWeight: 600 }}>{duJour.length || ''}</b></h3>
              {!duJour.length && <p className="gris" style={{ fontSize: 13 }}>Aucune tournée</p>}
              {duJour.map((t: any) => {
                const d = donneur(t.donneur_id); const al = alertes[t.id] ?? [];
                const etat = t.statut === 'faite' ? 'faite' : !t.chauffeur_id ? 'manque' : !t.vehicule_id ? 'partiel' : al.length ? 'alerte' : '';
                return (
                  <article key={t.id} className={`tournee ${etat}`} style={d?.couleur ? { borderLeftColor: d.couleur } : undefined}>
                    <div className="tournee-tete">
                      <b>{heureCourte(t.debut)}–{heureCourte(t.fin)}</b>
                      <span className="gris">{d?.nom ?? t.libelle ?? 'Tournée'}{depot(t.depot_id) && (depots ?? []).length > 1 ? ` · ${depot(t.depot_id).nom}` : ''}</span>
                      {t.verrouillee && t.statut === 'prevue' && (
                        <Formulaire action={T.deverrouiller.bind(null, t.id)} succes={false}><button className="cadenas" title="Choisi à la main : « Remplir la semaine » n'y touche pas. Cliquer pour libérer." aria-label="Libérer la tournée">🔒</button></Formulaire>
                      )}
                    </div>
                    {t.statut === 'faite' ? (
                      <p className="tournee-faite">Faite · {nomChauffeur(chauffeur(t.chauffeur_id)) || '—'}{t.livres != null ? ` · ${t.livres} livré${t.livres > 1 ? "s" : ""}` : ''}{t.absents ? `, ${t.absents} absent${t.absents > 1 ? "s" : ""}` : ''}</p>
                    ) : <>
                      <ChoixTournee libelle="Chauffeur" vide="Sans chauffeur" valeur={t.chauffeur_id} options={optionsChauffeurs(t)} action={T.affecter.bind(null, t.id, 'chauffeur_id')} />
                      <ChoixTournee libelle="Camion" vide="Sans camion" valeur={t.vehicule_id} options={optionsCamions(t)} action={T.affecter.bind(null, t.id, 'vehicule_id')} />
                    </>}
                    {al.map((a) => <p key={a} className="tournee-alerte">{a}</p>)}
                    {t.statut === 'prevue' && j >= aujourdhui && (
                      <Formulaire action={T.supprimerTournee.bind(null, t.id)} confirmer="Supprimer cette tournée ?" succes="Tournée supprimée"><button className="tournee-suppr" aria-label="Supprimer la tournée">Supprimer</button></Formulaire>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>

      <section className="carte" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>Répartition de la semaine</h2>
        <p className="gris" style={{ marginTop: 0, fontSize: 13.5 }}>Même nombre de tournées pour tout le monde (donc même paie) et au moins {regles.joursReposMin} jour{regles.joursReposMin > 1 ? 's' : ''} de repos chacun.</p>
        {!parChauffeur.length && <p className="gris">Ajoutez vos chauffeurs pour voir la répartition.</p>}
        <div className="repartition">
          {parChauffeur.sort((a, b) => String(depot(a.c.depot_id)?.nom ?? '').localeCompare(String(depot(b.c.depot_id)?.nom ?? '')) || b.n - a.n).map((p) => (
            <div key={p.c.id} className="repartition-ligne">
              <span><b>{nomChauffeur(p.c)}</b>{p.c.ville ? <span className="gris"> · {p.c.ville}</span> : null}{(depots ?? []).length > 1 && depot(p.c.depot_id) ? <span className="gris"> · {depot(p.c.depot_id).nom}</span> : null}</span>
              <span className="barre"><i style={{ width: `${Math.min(100, (p.n / Math.max(1, ...parChauffeur.map((x) => x.n))) * 100)}%`, background: Math.abs(p.n - moyenneDepot(p.c.depot_id)) > 2 ? 'var(--orange)' : undefined }} /></span>
              <span>{p.n} tournée{p.n > 1 ? 's' : ''}</span>
              <span className="gris">{p.jours} j · repos {7 - p.jours - p.absences}{p.absences ? ` · absent ${p.absences} j` : ''}</span>
            </div>
          ))}
        </div>
      </section>
    </Cadre>
  );
}
