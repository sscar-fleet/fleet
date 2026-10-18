import { notFound } from 'next/navigation';
import { utilisateurCourant, liensFichiers } from '@/lib/agence';
import {
  statutVehicule, statutLocation, statutEntretien, statutAmende, typeDommage, graviteDommage, carburants, photosGuidees,
  km, date, dateHeure, euros, echeance, joursEntre, JOUR, versJour,
} from '@/lib/format';
import * as A from '../../actions';
import Cadre from '../../_c/Cadre';
import Formulaire from '../../_c/Formulaire';
import Envoyer from '../../_c/Envoyer';
import Fichier from '../../_c/Fichier';
import BoutonPdf from '../../_c/BoutonPdf';
import { donneesAgence } from '@/lib/donnees';

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
    supabase.from('historique').select('action, detail, created_at').eq('vehicule_id', v.id).order('created_at', { ascending: false }).limit(15),
  ]);

  const liens = await liensFichiers(supabase, [v.carte_grise_path, v.assurance_path, v.ct_path, v.photo_path,
    ...(dommages ?? []).flatMap((d: any) => [d.photo_zone_path, d.photo_gros_plan_path]),
    ...(entretiens ?? []).map((e: any) => e.devis_path)]);

  // Rentabilité
  const utiles = (locations ?? []).filter((l: any) => l.statut === 'terminee' || l.statut === 'en_cours');
  const ca = utiles.reduce((s: number, l: any) => s + Number(l.prix_total ?? 0), 0);
  const joursLoues = utiles.reduce((s: number, l: any) => s + joursEntre(l.debut, l.fin_reelle ?? (l.statut === 'en_cours' ? new Date() : l.fin_prevue)), 0);
  const depuis = Date.now() - 90 * JOUR;
  const jours90 = utiles.reduce((s: number, l: any) => {
    const a = Math.max(new Date(l.debut).getTime(), depuis);
    const b = Math.min(new Date(l.fin_reelle ?? l.fin_prevue).getTime(), Date.now());
    return s + Math.max(0, (b - a) / JOUR);
  }, 0);
  const coutEntretien = (entretiens ?? []).reduce((s: number, e: any) => s + Number(e.cout ?? 0), 0);

  const agence = await donneesAgence(supabase, profil.agence_id);
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
      titre={<>{v.immatriculation} <span className="gris" style={{ fontWeight: 400 }}>{[v.marque, v.modele].filter(Boolean).join(' ')}</span></>}
      actions={<>
        <span className={`pastille ${v.statut}`}>{statutVehicule[v.statut]}</span>
        <a className="bouton principal" href={`/locations/nouvelle?vehicule=${v.id}`}>+ Louer</a>
        <a className="bouton" href={`/vehicules/${v.id}/fourriere`}>Attestation fourrière</a>
      </>}>

      <section className="chiffres">
        <div><span>Argent rapporté</span><b>{euros(ca)}</b></div>
        <div><span>Jours loués</span><b>{joursLoues}</b></div>
        <div><span>Occupation (90 jours)</span><b>{Math.round((jours90 / 90) * 100)} %</b></div>
        <div><span>Revenu par jour loué</span><b>{joursLoues ? euros(ca / joursLoues) : '—'}</b></div>
        <div><span>Coût d&apos;entretien</span><b>{euros(coutEntretien)}</b></div>
      </section>

      <div className="colonnes">
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

        <section className="carte">
          <h2>Informations</h2>
          <Formulaire action={A.majVehicule.bind(null, v.id)} className="grille">
            <label>Immatriculation<input name="immatriculation" defaultValue={v.immatriculation} required /></label>
            <label>Marque<input name="marque" defaultValue={v.marque ?? ''} /></label>
            <label>Modèle<input name="modele" defaultValue={v.modele ?? ''} /></label>
            <label>Carburant<select name="carburant" defaultValue={v.carburant ?? ''}><option value="">—</option>
              {Object.entries(carburants).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>
            <label>Kilométrage<input name="km" type="number" min={0} defaultValue={v.km ?? ''} /></label>
            <label>Prix par jour (€)<input name="prix_jour" type="number" step="0.01" min={0} defaultValue={v.prix_jour ?? ''} /></label>
            <label>Fin d&apos;assurance<input name="assurance_echeance" type="date" defaultValue={v.assurance_echeance ?? ''} /></label>
            <label>Prochain CT<input name="ct_echeance" type="date" defaultValue={v.ct_echeance ?? ''} /></label>
            <Envoyer className="bouton">Enregistrer</Envoyer>
          </Formulaire>
          <div className="ligne" style={{ marginTop: 14 }}>
            <span className="gris">Statut :</span>
            {['disponible', 'maintenance', 'hors_service'].map((s) => (
              <Formulaire key={s} action={A.statutVehicule.bind(null, v.id, s)}>
                <Envoyer className={`bouton petit ${v.statut === s ? 'actif' : ''}`}>{statutVehicule[s]}</Envoyer>
              </Formulaire>
            ))}
          </div>
        </section>
      </div>

      <section className="carte" style={{ marginTop: 16 }}>
        <div className="titre" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Dommages {ouverts > 0 && <span className="badge rouge">{ouverts}</span>}</h2>
          <BoutonPdf genre="dommages" nom={`dommages-${v.immatriculation}.pdf`} libelle="Relevé PDF" classe="bouton petit"
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

      <section className="carte">
        <h2>Entretien</h2>
        <details className="formulaire">
          <summary className="bouton petit">+ Mettre en maintenance / prévoir un entretien</summary>
          <Formulaire vider action={A.ajouterEntretien} className="grille">
            <input type="hidden" name="vehicule_id" value={v.id} />
            <label>Raison<input name="raison" placeholder="Vidange, pneus, carrosserie…" required /></label>
            <label>Garage<input name="garage" /></label>
            <label>Retour prévu<input name="retour_prevu" type="datetime-local" /></label>
            <label>Km<input name="km" type="number" defaultValue={v.km ?? ''} /></label>
            <label>Coût (€)<input name="cout" type="number" step="0.01" /></label>
            <label className="pleine">Commentaire<input name="commentaire" /></label>
            <Envoyer name="demarrer" value="oui">Démarrer maintenant</Envoyer>
            <Envoyer className="bouton" name="demarrer" value="non">Prévoir pour plus tard</Envoyer>
          </Formulaire>
        </details>
        {!entretiens?.length && <p className="gris">Aucun entretien enregistré.</p>}
        {entretiens?.map((e: any) => (
          <div key={e.id} className="fichier">
            <span><span className={`pastille ${e.statut}`}>{e.raison}</span>
              <br /><span className="gris">{statutEntretien[e.statut]}{e.garage ? ' · ' + e.garage : ''}{e.retour_prevu ? ' · retour ' + dateHeure(e.retour_prevu) : ''}{e.cout ? ' · ' + euros(e.cout) : ''}</span></span>
            <span className="ligne">
              <Fichier compact agenceId={profil.agence_id} dossier={`entretiens/${e.id}`} nom="devis" libelle="Devis"
                lien={liens[e.devis_path]} action={A.devisEntretien.bind(null, e.id)} />
              {e.statut === 'prevu' && <Formulaire action={A.demarrerEntretien.bind(null, e.id)}><Envoyer className="bouton petit">Démarrer</Envoyer></Formulaire>}
              {e.statut === 'en_cours' && <Formulaire action={A.terminerEntretien.bind(null, e.id)}><Envoyer className="bouton petit">Terminer</Envoyer></Formulaire>}
            </span>
          </div>
        ))}
      </section>

      <div className="colonnes">
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
          {!!historique?.length && <>
            <h3 style={{ marginTop: 18 }}>Historique</h3>
            {historique.map((h: any, i: number) => (
              <div key={i} className="fichier"><span>{h.action}{h.detail ? <span className="gris"> · {h.detail}</span> : null}</span><span className="gris">{dateHeure(h.created_at)}</span></div>
            ))}
          </>}
        </section>
      </div>
    </Cadre>
  );
}
