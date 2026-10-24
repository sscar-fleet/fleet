import Historique, { CHAMPS_HISTORIQUE } from '../../_c/Historique';
import LogoMarque, { BadgeSport } from '@/app/_c/LogoMarque';
import { notFound } from 'next/navigation';
import { utilisateurCourant, liensFichiers } from '@/lib/agence';
import {
  statutVehicule, statutLocation, statutEntretien, typesMaintenance, motifsSortie, statutAmende, typeDommage, graviteDommage, carburants, financements, photosGuidees,
  km, date, dateHeure, euros, echeance, joursEntre, JOUR, versJour, categoriesDepense, plaque } from '@/lib/format';
import * as A from '../../actions';
import ProvenanceVehicule from '../../_c/ProvenanceVehicule';
import Cadre from '../../_c/Cadre';
import Formulaire from '../../_c/Formulaire';
import Envoyer from '../../_c/Envoyer';
import Fichier from '../../_c/Fichier';
import Depot from '../../_c/Depot';
import Onglets from '../../_c/Onglets';
import BoutonPdf from '../../_c/BoutonPdf';
import { donneesAgence } from '@/lib/donnees';
import SuiviGps from '../../_c/SuiviGps';
import { suiviAgence, alertesAgence } from '@/lib/telematique';

export const dynamic = 'force-dynamic';

export default async function FicheVehicule({ params }: { params: { id: string } }) {
  const { supabase, profil } = await utilisateurCourant();
  const { data: v } = await supabase.from('vehicules').select('*').eq('id', params.id).maybeSingle();
  if (!v) notFound();

  const [{ data: locations }, { data: entretiens }, { data: dommages }, { data: amendes }, { data: historique }] = await Promise.all([
    supabase.from('locations').select('id, numero, debut, fin_prevue, fin_reelle, statut, prix_total, clients(nom, prenom)')
      .eq('vehicule_id', v.id).order('debut', { ascending: false }),
    supabase.from('entretiens').select('*').eq('vehicule_id', v.id).order('created_at', { ascending: false }),
    supabase.from('dommages').select('*').eq('vehicule_id', v.id).order('created_at', { ascending: false }),
    supabase.from('amendes').select('id, date_infraction, type, montant, statut, echeance').eq('vehicule_id', v.id).order('date_infraction', { ascending: false }),
    supabase.from('historique').select(CHAMPS_HISTORIQUE).eq('vehicule_id', v.id).order('created_at', { ascending: false }).limit(60),
  ]);

  const { data: pieces } = await supabase.from('pieces_jointes').select('id, nom, path, entretien_id, depense_id').eq('vehicule_id', v.id).order('created_at');
  const liens = await liensFichiers(supabase, [v.carte_grise_path, v.assurance_path, v.ct_path, v.photo_path, ...(pieces ?? []).map((x: any) => x.path),
    ...(dommages ?? []).flatMap((d: any) => [d.photo_zone_path, d.photo_gros_plan_path]),
    ...(entretiens ?? []).map((e: any) => e.devis_path)]);

  // Rentabilité
  const utiles = (locations ?? []).filter((l: any) => l.statut === 'terminee' || l.statut === 'en_cours');
  const ca = utiles.reduce((s: number, l: any) => s + Number(l.prix_total ?? 0), 0)
    + (entretiens ?? []).reduce((s: number, e: any) => s + Number(e.montant_recu ?? 0), 0);
  const joursLoues = utiles.reduce((s: number, l: any) => s + joursEntre(l.debut, l.fin_reelle ?? (l.statut === 'en_cours' ? new Date() : l.fin_prevue)), 0);
  const depuis = Date.now() - 90 * JOUR;
  const jours90 = utiles.reduce((s: number, l: any) => {
    const a = Math.max(new Date(l.debut).getTime(), depuis);
    const b = Math.min(new Date(l.fin_reelle ?? l.fin_prevue).getTime(), Date.now());
    return s + Math.max(0, (b - a) / JOUR);
  }, 0);
  const coutEntretien = (entretiens ?? []).reduce((s: number, e: any) => s + Number(e.cout ?? 0), 0);
  const { data: depensesV } = await supabase.from('depenses').select('id, categorie, montant, date, libelle').eq('vehicule_id', v.id).order('date', { ascending: false });
  const totalDepenses = (depensesV ?? []).reduce((s: number, d: any) => s + Number(d.montant), 0);
  const coutDegats = (dommages ?? []).filter((d: any) => d.statut !== 'annule').reduce((s: number, d: any) => s + Number(d.cout ?? 0), 0);
  const finFlotte = v.date_sortie ? new Date(v.date_sortie).getTime() : Date.now();
  const moisDansFlotte = v.date_entree ? Math.max(0, (finFlotte - new Date(v.date_entree).getTime()) / (30.44 * JOUR)) : 0;
  const coutVehicule = Number(v.cout_mensuel ?? 0) * moisDansFlotte;
  const resultat = ca - coutEntretien - totalDepenses - coutDegats - coutVehicule;

  const agence = await donneesAgence(supabase, profil.agence_id);
  const [{ data: traceur }, suivi] = await Promise.all([
    v.traceur_id ? supabase.from('traceurs').select('*').eq('id', v.traceur_id).maybeSingle() : Promise.resolve({ data: null }),
    suiviAgence(supabase),
  ]);
  const dommagesDoc = (dommages ?? []).filter((d: any) => d.statut !== 'annule').map((d: any) => ({
    ...d, photo_zone: liens[d.photo_zone_path] ?? null, photo_gros_plan: liens[d.photo_gros_plan_path] ?? null,
  }));
  const ouverts = (dommages ?? []).filter((d: any) => d.statut === 'ouvert').length;
  const papier = (titre: string, champ: string, ech?: string | null) => (
    <Fichier agenceId={profil.agence_id} dossier={`vehicules/${v.id}`} nom={champ.replace('_path', '')} libelle={titre}
      lien={liens[v[champ]]} action={A.documentVehicule.bind(null, v.id, champ)} camera={false} />
  );

  return (
    <Cadre retour={{ lien: '/vehicules', texte: 'Véhicules' }} tables={['vehicules', 'locations', 'entretiens', 'dommages', 'amendes']}
      titre={<>{plaque(v.immatriculation)} <span className="gris" style={{ fontWeight: 400 }}>{[v.marque, v.modele].filter(Boolean).join(' ')}</span><BadgeSport marque={v.marque} modele={v.modele} />{v.financement === 'pret' && <span className={`pastille ${v.pret_retour && new Date(v.pret_retour).getTime() - Date.now() < 7 * 864e5 ? 'proche' : ''}`} style={{ marginLeft: 10, fontSize: 13 }}>Prêté{v.pret_par ? ` par ${v.pret_par}` : ''}{v.pret_retour ? ` · à rendre le ${date(v.pret_retour)}` : ''}</span>}</>}
      actions={<>
        <span className={`pastille ${v.statut}`}>{statutVehicule[v.statut]}</span>
        {v.statut !== 'sorti' && <a className="bouton principal" href={`/locations/nouvelle?vehicule=${v.id}`}>+ Louer</a>}
        <BoutonPdf genre="bilan" nom={`bilan-${plaque(v.immatriculation)}.pdf`} libelle="Bilan PDF" donnees={{ agence, bilan: {
          vehicule: { immatriculation: v.immatriculation, marque: v.marque, modele: v.modele, financement: v.financement, cout_mensuel: v.cout_mensuel,
            date_entree: v.date_entree, date_sortie: v.date_sortie, motif_sortie: v.motif_sortie, prix_sortie: v.prix_sortie, km: v.km },
          chiffres: [
            ['Entré dans la flotte', date(v.date_entree)], ['Sorti', v.date_sortie ? `${date(v.date_sortie)} · ${motifsSortie[v.motif_sortie] ?? v.motif_sortie ?? ''}` : 'Toujours dans la flotte'],
            ['Prix de vente', euros(v.prix_sortie)], ['Financement', v.financement ? financements[v.financement] : '—'], ['Coût mensuel', euros(v.cout_mensuel)], ['Kilométrage', km(v.km)],
            ['Recettes', euros(ca)], ['Coûts', euros(coutVehicule + coutEntretien + coutDegats + totalDepenses)], ['Résultat', euros(resultat)],
            ['Jours loués', String(joursLoues)], ['Locations', String(utiles.length)], ['Revenu par jour loué', joursLoues ? euros(ca / joursLoues) : '—'],
          ],
          locations: utiles.map((l: any) => [String(l.numero), [l.clients?.prenom, l.clients?.nom].filter(Boolean).join(' '), date(l.debut), date(l.fin_reelle ?? l.fin_prevue), euros(l.prix_total)]),
          maintenances: (entretiens ?? []).map((e: any) => [typesMaintenance[e.type] ?? 'Entretien', [e.raison, e.garage].filter(Boolean).join(' · '), date(e.fin ?? e.debut ?? e.created_at), [e.cout ? 'coût ' + euros(e.cout) : '', e.montant_recu ? 'reçu ' + euros(e.montant_recu) : ''].filter(Boolean).join(' / ') || '—']),
          depenses: (depensesV ?? []).map((x: any) => [categoriesDepense[x.categorie] ?? x.categorie, x.libelle ?? '', date(x.date), euros(x.montant)]),
          dommages: (dommages ?? []).map((x: any) => [typeDommage[x.type], graviteDommage[x.gravite], date(x.created_at), euros(x.cout)]),
          amendes: (amendes ?? []).map((x: any) => [x.type ?? 'Amende', statutAmende[x.statut], date(x.date_infraction), euros(x.montant)]),
        } }} />
        <a className="bouton" href={`/vehicules/${v.id}/fourriere`}>Attestation fourrière</a>
      </>}>

      {v.statut === 'sorti' && <div className="alerte-bandeau">Sorti de la flotte le {date(v.date_sortie)} · {motifsSortie[v.motif_sortie] ?? v.motif_sortie}{v.prix_sortie ? ` · vendu ${euros(v.prix_sortie)}` : ''}</div>}
      <Onglets panneaux={[
        { cle: 'resume', titre: 'Résumé', contenu: <>
          <section className="carte photo-vehicule">
            {liens[v.photo_path]
              ? <img src={liens[v.photo_path]} alt={`${v.marque ?? ''} ${v.modele ?? ''}`} />
              : <div className="logo-fiche"><LogoMarque marque={v.marque} modele={v.modele} className="logo-marque grand" /></div>}
            <span className="gris" style={{ fontSize: 13 }}>{liens[v.photo_path] ? 'Photo du véhicule' : 'Logo de la marque · ajoutez votre propre photo dans Papiers si vous le souhaitez'}</span>
          </section>
          {v.statut !== 'sorti' && <SuiviGps v={v} traceur={traceur} suivi={suivi} alertes={traceur ? (await alertesAgence(supabase, suivi, 72)).filter((a) => a.vehicule_id === v.id) : []} />}
      <section className="chiffres">
        <div><span>Argent rapporté</span><b>{euros(ca)}</b></div>
        <div><span>Jours loués</span><b>{joursLoues}</b></div>
        <div><span>Occupation (90 jours)</span><b>{Math.round((jours90 / 90) * 100)} %</b></div>
        <div><span>Revenu par jour loué</span><b>{joursLoues ? euros(ca / joursLoues) : '—'}</b></div>
        <div><span>Coûts (véhicule, entretien, dégâts, dépenses)</span><b>{euros(coutVehicule + coutEntretien + coutDegats + totalDepenses)}</b></div>
        {v.prix_achat ? <div><span>Prix d&apos;achat · rentabilisé</span><b>{euros(v.prix_achat)} · {Math.round(((resultat + Number(v.prix_sortie ?? 0)) / Number(v.prix_achat)) * 100)} %</b></div> : null}
        <div><span>Résultat depuis l&apos;entrée</span><b style={{ color: resultat >= 0 ? 'var(--vert)' : 'var(--rouge)' }}>{resultat >= 0 ? '+' : ''}{euros(resultat)}</b></div>
      </section>
        <section className="carte">
          <h2>Informations</h2>
          <Formulaire action={A.majVehicule.bind(null, v.id)} className="grille">
            <label>Immatriculation<input name="immatriculation" defaultValue={plaque(v.immatriculation)} required /></label>
            <label>Marque<input name="marque" defaultValue={v.marque ?? ''} required /></label>
            <label>Modèle<input name="modele" defaultValue={v.modele ?? ''} required /></label>
            <label>Carburant<select name="carburant" defaultValue={v.carburant ?? ''}><option value="">—</option>
              {Object.entries(carburants).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>
            <label>Kilométrage<input name="km" type="number" min={0} defaultValue={v.km ?? ''} /></label>
            <label>Prix par jour (€)<input name="prix_jour" type="number" step="0.01" min={0} defaultValue={v.prix_jour ?? ''} /></label>
            <label>Fin d&apos;assurance<input name="assurance_echeance" type="date" defaultValue={v.assurance_echeance ?? ''} /></label>
            <label>Prochain CT<input name="ct_echeance" type="date" defaultValue={v.ct_echeance ?? ''} /></label>
            <ProvenanceVehicule v={v} />
            <label data-cout>Coût mensuel (€)<input name="cout_mensuel" type="number" step="0.01" min={0} defaultValue={v.cout_mensuel ?? ''} placeholder="Loyer, crédit…" /></label>
            <label data-cout>Prix d&apos;achat (€)<input name="prix_achat" type="number" step="0.01" min={0} defaultValue={v.prix_achat ?? ''} placeholder="Si acheté comptant" /></label>
            <label>Entré dans la flotte le<input name="date_entree" type="date" defaultValue={v.date_entree ?? ''} /></label>
            <Envoyer className="bouton">Enregistrer</Envoyer>
          </Formulaire>
          {v.statut !== 'sorti' && <div className="ligne" style={{ marginTop: 14 }}>
            <span className="gris">Statut :</span>
            {['disponible', 'maintenance', 'hors_service'].map((s) => (
              <Formulaire key={s} action={A.statutVehicule.bind(null, v.id, s)}>
                <Envoyer className={`bouton petit ${v.statut === s ? 'actif' : ''}`}>{statutVehicule[s]}</Envoyer>
              </Formulaire>
            ))}
          </div>}
          {v.statut !== 'sorti' ? (
            <details className="formulaire" style={{ marginTop: 14 }}>
              <summary className="bouton petit danger">Sortir de la flotte</summary>
              <Formulaire action={A.sortirVehicule.bind(null, v.id)} className="grille" succes="Véhicule sorti de la flotte" confirmer="Sortir ce véhicule de la flotte ? Il disparaîtra du planning (l'historique est gardé).">
                <label>Motif<select name="motif_sortie">{Object.entries(motifsSortie).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>
                <label>Date de sortie<input name="date_sortie" type="date" defaultValue={versJour(new Date())} /></label>
                <label>Prix de vente (€)<input name="prix_sortie" type="number" step="0.01" min={0} /></label>
                <Envoyer className="bouton danger">Confirmer la sortie</Envoyer>
              </Formulaire>
              <p className="gris" style={{ fontSize: 13, marginBottom: 0 }}>Le véhicule disparaît du planning et des listes, son coût mensuel s&apos;arrête à cette date. Son historique est gardé.</p>
            </details>
          ) : (
            <Formulaire action={A.remettreVehicule.bind(null, v.id)} style={{ marginTop: 14 }}>
              <Envoyer className="bouton petit">Remettre dans la flotte</Envoyer>
            </Formulaire>
          )}
        </section>
        </> },
        { cle: 'papiers', titre: 'Papiers', badge: [v.assurance_echeance, v.ct_echeance].filter((x) => echeance(x)).length, contenu: <>
        <section className="carte">
          <h2>Papiers du véhicule</h2>
          {papier('Carte grise', 'carte_grise_path')}
          {papier('Assurance', 'assurance_path')}
          {papier('Contrôle technique', 'ct_path')}
          {papier('Photo du véhicule', 'photo_path')}
          <div className="infos" style={{ marginTop: 12 }}>
            <div><span>Fin d&apos;assurance</span><b className={`pastille ${echeance(v.assurance_echeance) || (v.assurance_echeance ? 'ok' : 'annulee')}`}>{date(v.assurance_echeance)}</b></div>
            <div><span>Prochain contrôle technique</span><b className={`pastille ${echeance(v.ct_echeance) || (v.ct_echeance ? 'ok' : 'annulee')}`}>{date(v.ct_echeance)}</b></div>
          </div>
        </section>
        </> },
        { cle: 'locations', titre: `Locations (${locations?.length ?? 0})`, contenu: <div className="colonnes">
        <section className="carte">
          <h2>Locations ({locations?.length ?? 0})</h2>
          {!locations?.length && <p className="gris">Jamais loué pour l&apos;instant.</p>}
          {locations?.slice(0, 20).map((l: any) => (
            <a key={l.id} href={`/locations/${l.id}`} className="fichier">
              <span>N° {l.numero} · {[l.clients?.prenom, l.clients?.nom].filter(Boolean).join(' ')}<br /><span className="gris">{date(l.debut)} → {date(l.fin_reelle ?? l.fin_prevue)} · {euros(l.prix_total)}</span></span>
              <span className={`pastille ${l.statut}`}>{statutLocation[l.statut]}</span>
            </a>
          ))}
        </section>
        <section className="carte">
          <h2>Amendes ({amendes?.length ?? 0})</h2>
          {!amendes?.length && <p className="gris">Aucune amende.</p>}
          {amendes?.map((a: any) => (
            <a key={a.id} href="/amendes" className="fichier">
              <span>{a.type ?? 'Amende'} · {euros(a.montant)}<br /><span className="gris">{dateHeure(a.date_infraction)}</span></span>
              <span className={`pastille ${a.statut}`}>{statutAmende[a.statut]}</span>
            </a>
          ))}
          <Historique lignes={historique as any} />
        </section>
        </div> },
        { cle: 'entretien', titre: 'Entretien et dégâts', badge: ouverts, contenu: <>
      <section className="carte">
        <h2>Maintenance et transferts</h2>
        <details className="formulaire">
          <summary className="bouton petit">+ Maintenance, réparation ou transfert</summary>
          <Formulaire vider action={A.ajouterEntretien} className="grille">
            <input type="hidden" name="vehicule_id" value={v.id} />
            <label>Type<select name="type">{Object.entries(typesMaintenance).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>
            <label>Détail<input name="raison" placeholder="Vidange, pneus, prêt à Loc Express…" /></label>
            <label>Garage ou loueur<input name="garage" /></label>
            <label>Retour prévu<input name="retour_prevu" type="datetime-local" /></label>
            <label>Km<input name="km" type="number" defaultValue={v.km ?? ''} /></label>
            <label>Coût pour moi (€)<input name="cout" type="number" step="0.01" /></label>
            <label>Montant reçu (€)<input name="montant_recu" type="number" step="0.01" placeholder="Transfert payé par l'autre loueur" /></label>
            <label className="pleine">Commentaire<input name="commentaire" /></label>
            <Envoyer name="demarrer" value="oui">Démarrer maintenant</Envoyer>
            <Envoyer className="bouton" name="demarrer" value="non">Prévoir pour plus tard</Envoyer>
          </Formulaire>
        </details>
        {!entretiens?.length && <p className="gris">Aucun entretien enregistré.</p>}
        {entretiens?.map((e: any) => (
          <div key={e.id} className="entretien">
            <div className="ligne" style={{ justifyContent: 'space-between' }}>
              <span><a href={`/entretiens/${e.id}`} className={`pastille ${e.statut}`}>{typesMaintenance[e.type] ?? 'Entretien'} · {e.raison} ›</a>
                <br /><span className="gris">{statutEntretien[e.statut]}{e.garage ? ' · ' + e.garage : ''}{e.retour_prevu ? ' · retour ' + dateHeure(e.retour_prevu) : ''}{e.cout ? ' · coût ' + euros(e.cout) : ''}{e.montant_recu ? ' · reçu ' + euros(e.montant_recu) : ''}</span></span>
              <span className="ligne">
                {e.statut === 'prevu' && <Formulaire action={A.demarrerEntretien.bind(null, e.id)}><Envoyer className="bouton petit">Démarrer</Envoyer></Formulaire>}
                {e.statut === 'en_cours' && <Formulaire action={A.terminerEntretien.bind(null, e.id)}><Envoyer className="bouton petit">Terminer</Envoyer></Formulaire>}
              </span>
            </div>
            <Depot agenceId={profil.agence_id} dossier={`entretiens/${e.id}`} action={A.ajouterPiece.bind(null, { entretien_id: e.id, vehicule_id: v.id })}
              pieces={[...(e.devis_path ? [{ id: 'devis', nom: 'Devis', lien: liens[e.devis_path] }] : []),
                ...(pieces ?? []).filter((x: any) => x.entretien_id === e.id).map((x: any) => ({ id: x.id, nom: x.nom, lien: liens[x.path] }))]} />
          </div>
        ))}
      </section>
      <section className="carte">
        <div className="titre" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Dommages {ouverts > 0 && <span className="badge rouge">{ouverts}</span>}</h2>
          <BoutonPdf genre="dommages" nom={`dommages-${plaque(v.immatriculation)}.pdf`} libelle="Relevé PDF" classe="bouton petit"
            donnees={{ agence, vehicule: { immatriculation: v.immatriculation, marque: v.marque, modele: v.modele }, dommages: dommagesDoc }} />
        </div>
        <details className="formulaire">
          <summary className="bouton petit">+ Signaler un dommage</summary>
          <Formulaire vider action={A.ajouterDommage} className="grille">
            <input type="hidden" name="vehicule_id" value={v.id} />
            <label>Type<select name="type">{Object.entries(typeDommage).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>
            <label>Gravité<select name="gravite">{Object.entries(graviteDommage).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>
            <label>Zone<select name="zone"><option value="">—</option>{photosGuidees.filter((p) => p.position !== 'compteur').map((p) => <option key={p.position} value={p.position}>{p.libelle}</option>)}</select></label>
            <label>Coût estimé (€)<input name="cout" type="number" step="0.01" min={0} /></label>
            <Envoyer className="bouton">Enregistrer</Envoyer>
          </Formulaire>
        </details>
        {!dommages?.length && <p className="gris">Aucun dommage.</p>}
        {dommages?.map((d: any) => (
          <div key={d.id} className="fichier">
            <span><span className={`pastille ${d.statut === 'ouvert' ? d.gravite : d.statut}`}>{typeDommage[d.type]} · {graviteDommage[d.gravite]}</span>
              <br /><span className="gris">{d.zone ? photosGuidees.find((p) => p.position === d.zone)?.libelle : 'Zone non précisée'} · {date(d.created_at)}{d.cout ? ' · ' + euros(d.cout) : ''}</span></span>
            <span className="ligne">
              <Fichier compact agenceId={profil.agence_id} dossier={`dommages/${d.id}`} nom="zone" libelle="Zone" camera accept="image/*"
                lien={liens[d.photo_zone_path]} action={A.photoDommage.bind(null, d.id, 'photo_zone_path')} />
              <Fichier compact agenceId={profil.agence_id} dossier={`dommages/${d.id}`} nom="gros-plan" libelle="Gros plan" camera accept="image/*"
                lien={liens[d.photo_gros_plan_path]} action={A.photoDommage.bind(null, d.id, 'photo_gros_plan_path')} />
              {d.statut === 'ouvert'
                ? <Formulaire action={A.statutDommage.bind(null, d.id, 'repare')}><Envoyer className="bouton petit">Réparé</Envoyer></Formulaire>
                : <Formulaire action={A.statutDommage.bind(null, d.id, 'ouvert')}><Envoyer className="bouton petit">Rouvrir</Envoyer></Formulaire>}
            </span>
          </div>
        ))}
      </section>
        </> },
        { cle: 'argent', titre: 'Argent', contenu: <>
      <section className="chiffres">
        <div><span>Argent rapporté</span><b>{euros(ca)}</b></div>
        <div><span>Jours loués</span><b>{joursLoues}</b></div>
        <div><span>Occupation (90 jours)</span><b>{Math.round((jours90 / 90) * 100)} %</b></div>
        <div><span>Revenu par jour loué</span><b>{joursLoues ? euros(ca / joursLoues) : '—'}</b></div>
        <div><span>Coûts (véhicule, entretien, dégâts, dépenses)</span><b>{euros(coutVehicule + coutEntretien + coutDegats + totalDepenses)}</b></div>
        {v.prix_achat ? <div><span>Prix d&apos;achat · rentabilisé</span><b>{euros(v.prix_achat)} · {Math.round(((resultat + Number(v.prix_sortie ?? 0)) / Number(v.prix_achat)) * 100)} %</b></div> : null}
        <div><span>Résultat depuis l&apos;entrée</span><b style={{ color: resultat >= 0 ? 'var(--vert)' : 'var(--rouge)' }}>{resultat >= 0 ? '+' : ''}{euros(resultat)}</b></div>
      </section>
      <section className="carte">
        <h2>Dépenses {totalDepenses > 0 && <span className="gris" style={{ fontWeight: 400 }}>· {euros(totalDepenses)}</span>}</h2>
        <details className="formulaire">
          <summary className="bouton petit">+ Ajouter une dépense (fourrière, réparation…)</summary>
          <Formulaire vider action={A.ajouterDepense} className="grille">
            <input type="hidden" name="vehicule_id" value={v.id} />
            <label>Type<select name="categorie">{Object.entries(categoriesDepense).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>
            <label>Montant (€) *<input name="montant" type="number" step="0.01" min={0} required /></label>
            <label>Date<input name="date" type="date" defaultValue={versJour(new Date())} /></label>
            <label>Détail<input name="libelle" /></label>
            <Envoyer className="bouton">Enregistrer</Envoyer>
          </Formulaire>
        </details>
        {!depensesV?.length && <p className="gris">Aucune dépense.</p>}
        {depensesV?.map((d: any) => (
          <div key={d.id} className="entretien">
            <div className="ligne" style={{ justifyContent: 'space-between' }}><span>{categoriesDepense[d.categorie] ?? d.categorie} · <b>{euros(d.montant)}</b>{d.libelle ? <span className="gris"> · {d.libelle}</span> : null}</span><span className="gris">{date(d.date)}</span></div>
            <Depot agenceId={profil.agence_id} dossier={`depenses/${d.id}`} libelle="Justificatifs" action={A.ajouterPiece.bind(null, { depense_id: d.id, vehicule_id: v.id })}
              pieces={(pieces ?? []).filter((x: any) => x.depense_id === d.id).map((x: any) => ({ id: x.id, nom: x.nom, lien: liens[x.path] }))} />
          </div>
        ))}
      </section>
        </> },
      ]} />
    </Cadre>
  );
}
