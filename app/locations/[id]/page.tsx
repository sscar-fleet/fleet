import { notFound } from 'next/navigation';
import { utilisateurCourant } from '@/lib/agence';
import { chargerLocation } from '@/lib/location';
import { kmSupplementaires } from '@/lib/documents-pdf';
import { statutLocation, statutCaution, statutEdl, typeDommage, graviteDommage, dateHeure, date, euros, km, joursEntre, versLocal } from '@/lib/format';
import * as A from '../../actions';
import Cadre from '../../_c/Cadre';
import Formulaire from '../../_c/Formulaire';
import Envoyer from '../../_c/Envoyer';
import Fichier from '../../_c/Fichier';
import Signature from '../../_c/Signature';
import BoutonPdf from '../../_c/BoutonPdf';

export const dynamic = 'force-dynamic';

export default async function FicheLocation({ params }: { params: { id: string } }) {
  const { supabase, profil } = await utilisateurCourant();
  const d = await chargerLocation(supabase, profil.agence_id, params.id);
  if (!d) notFound();
  const l = d.brut; const v = l.vehicules; const c = l.clients;
  const [{ data: autres }, { data: historique }] = await Promise.all([
    supabase.from('vehicules').select('id, immatriculation, marque, modele').neq('statut', 'hors_service').neq('id', v.id).order('immatriculation'),
    supabase.from('historique').select('action, detail, created_at').eq('location_id', l.id).order('created_at', { ascending: false }),
  ]);
  const retard = l.statut === 'en_cours' && new Date(l.fin_prevue) < new Date();
  const sup = kmSupplementaires(l);
  const jours = joursEntre(l.debut, l.fin_reelle ?? l.fin_prevue);
  const ouverts = d.dommages.filter((x: any) => x.statut === 'ouvert').length;
  const base = { agence: d.agence, location: d.location, vehicule: d.vehicule, client: d.client };
  const nomFichier = (t: string) => `${t}-${String(l.numero).padStart(5, '0')}-${v.immatriculation}.pdf`;
  const kmParcourus = l.km_retour != null && l.km_depart != null ? l.km_retour - l.km_depart : null;

  const edlBloc = (type: 'depart' | 'retour', e: any) => (
    <div className="fichier">
      <span><b>{type === 'depart' ? 'Départ' : 'Retour'}</b><br />
        <span className="gris">{e ? `${statutEdl[e.statut]} · ${e.photos.length}/11 photos${e.km != null ? ' · ' + km(e.km) : ''}` : 'Pas encore fait'}</span></span>
      <span className="ligne">
        {e && <BoutonPdf genre="edl" nom={nomFichier('etat-des-lieux-' + type)} libelle="PDF" classe="bouton petit" donnees={{ ...base, edl: e, dommages: d.dommages }} />}
        {(e || (type === 'depart' ? l.statut === 'reservee' : l.statut === 'en_cours')) && (
          <Formulaire action={A.ouvrirEdl.bind(null, l.id, type)}><Envoyer className={`bouton petit ${!e ? 'principal' : ''}`}>{e ? 'Ouvrir' : 'Commencer'}</Envoyer></Formulaire>
        )}
      </span>
    </div>
  );

  return (
    <Cadre retour={{ lien: '/locations', texte: 'Locations' }} tables={['locations', 'etats_des_lieux', 'photos_edl', 'dommages', 'clients']}
      titre={<>Location N° {l.numero} {ouverts > 0 && <span className="badge rouge" title="Dommages ouverts">{ouverts}</span>}</>}
      actions={<span className={`pastille ${retard ? 'retard' : l.statut}`}>{retard ? 'En retard' : statutLocation[l.statut]}</span>}>

      {c.liste_noire && <div className="alerte-bandeau">Attention : ce client est en liste noire. {c.note}</div>}
      {retard && <div className="alerte-bandeau">Retour prévu le {dateHeure(l.fin_prevue)}. {c.telephone && <a className="lien" href={`tel:${c.telephone}`}>Appeler {c.telephone}</a>}</div>}

      {l.statut === 'reservee' && <div className="info-bandeau ligne" style={{ justifyContent: 'space-between' }}>
        <span>Prochaine étape : l&apos;état des lieux de départ (photos, km, carburant, signature).</span>
        <Formulaire action={A.ouvrirEdl.bind(null, l.id, 'depart')}><Envoyer>Faire le départ</Envoyer></Formulaire></div>}
      {l.statut === 'en_cours' && <div className="info-bandeau ligne" style={{ justifyContent: 'space-between' }}>
        <span>Au retour du véhicule : état des lieux de retour.</span>
        <Formulaire action={A.ouvrirEdl.bind(null, l.id, 'retour')}><Envoyer>Faire le retour</Envoyer></Formulaire></div>}
      {l.statut === 'terminee' && d.retour?.statut === 'a_comparer' && <div className="info-bandeau ligne" style={{ justifyContent: 'space-between' }}>
        <span>Comparez les photos du départ et du retour, puis rendez ou retenez la caution.</span>
        <a className="bouton principal" href={`/locations/${l.id}/comparaison`}>Comparer</a></div>}

      <div className="colonnes">
        <section className="carte">
          <h2>{v.immatriculation} · {[v.marque, v.modele].filter(Boolean).join(' ')}</h2>
          <div className="infos">
            <div><span>Départ</span><b>{dateHeure(l.debut)}</b></div>
            <div><span>{l.fin_reelle ? 'Rendu le' : 'Retour prévu'}</span><b>{dateHeure(l.fin_reelle ?? l.fin_prevue)}</b></div>
            <div><span>Durée</span><b>{jours} jour{jours > 1 ? 's' : ''}</b></div>
            <div><span>Prix</span><b>{euros(l.prix_total)}</b></div>
            <div><span>Km départ</span><b>{km(l.km_depart)}</b></div>
            <div><span>Km retour</span><b>{km(l.km_retour)}</b></div>
            <div><span>Km inclus</span><b>{l.km_inclus != null ? km(l.km_inclus) : 'Illimité'}</b></div>
            <div><span>{kmParcourus != null ? 'Parcourus' : 'Carburant départ'}</span><b>{kmParcourus != null ? km(kmParcourus) : l.carburant_depart != null ? l.carburant_depart + ' %' : '—'}</b></div>
            {sup.enTrop > 0 && <div><span>Km en trop</span><b className="retard">{km(sup.enTrop)} · {euros(sup.montant)}</b></div>}
            {l.carburant_retour != null && <div><span>Carburant départ → retour</span><b>{l.carburant_depart ?? '—'} % → {l.carburant_retour} %</b></div>}
          </div>
          <div className="ligne" style={{ marginTop: 14 }}>
            <a className="bouton petit" href={`/vehicules/${v.id}`}>Fiche véhicule</a>
          </div>
        </section>

        <section className="carte">
          <h2><a href={`/clients/${c.id}`}>{c.nom} {c.prenom}</a></h2>
          <div className="infos" style={{ marginBottom: 10 }}>
            <div><span>Téléphone</span><b>{c.telephone ? <a className="lien" href={`tel:${c.telephone}`}>{c.telephone}</a> : '—'}</b></div>
            <div><span>Permis du</span><b>{date(c.date_permis)}</b></div>
          </div>
          <Fichier agenceId={profil.agence_id} dossier={`clients/${c.id}`} nom="permis" libelle="Permis de conduire" camera
            lien={d.liens[c.permis_path]} action={A.documentClient.bind(null, c.id, 'permis_path')} />
          <Fichier agenceId={profil.agence_id} dossier={`clients/${c.id}`} nom="identite" libelle="Pièce d'identité" camera
            lien={d.liens[c.piece_identite_path]} action={A.documentClient.bind(null, c.id, 'piece_identite_path')} />
        </section>
      </div>

      <div className="colonnes" style={{ marginTop: 16 }}>
        <section className="carte">
          <h2>Contrat et facture</h2>
          <Signature agenceId={profil.agence_id} dossier={`locations/${l.id}`} lien={d.location.signature} libelle="Signature du contrat par le client"
            action={A.signatureContrat.bind(null, l.id)} />
          <div className="ligne" style={{ marginTop: 14 }}>
            <BoutonPdf genre="contrat" nom={nomFichier('contrat')} libelle="Contrat PDF" donnees={base} />
            <BoutonPdf genre="facture" nom={nomFichier('facture')} libelle="Facture PDF" donnees={base} />
          </div>
          <p className="gris" style={{ fontSize: 13, marginBottom: 0 }}>Sur téléphone, le PDF s&apos;ouvre dans le partage (WhatsApp, e-mail…).</p>
        </section>

        <section className="carte">
          <h2>Caution</h2>
          <Formulaire action={A.cautionLocation.bind(null, l.id)} className="grille">
            <label>Montant (€)<input name="caution_montant" type="number" step="0.01" min={0} defaultValue={l.caution_montant ?? ''} /></label>
            <label>Statut<select name="caution_statut" defaultValue={l.caution_statut}>
              {Object.entries(statutCaution).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>
            <label>Retenue (€)<input name="caution_retenue" type="number" step="0.01" min={0} defaultValue={l.caution_retenue ?? ''} /></label>
            <label className="pleine">Motif de la retenue<input name="caution_motif" defaultValue={l.caution_motif ?? ''} placeholder="Rayure portière, carburant manquant…" /></label>
            <Envoyer className="bouton">Enregistrer</Envoyer>
          </Formulaire>
          <p style={{ marginBottom: 0 }}><span className={`pastille ${l.caution_statut}`}>{statutCaution[l.caution_statut]}</span>
            {l.caution_retenue ? <span className="gris"> · {euros(l.caution_retenue)} retenus{l.caution_motif ? ' : ' + l.caution_motif : ''}</span> : null}</p>
        </section>
      </div>

      <div className="colonnes" style={{ marginTop: 16 }}>
        <section className="carte">
          <h2>États des lieux</h2>
          {edlBloc('depart', d.depart)}
          {edlBloc('retour', d.retour)}
          {d.depart && d.retour && <a className="bouton petit" style={{ marginTop: 10 }} href={`/locations/${l.id}/comparaison`}>Comparer départ et retour</a>}
          {d.dommages.length > 0 && <>
            <h3 style={{ marginTop: 16 }}>Dommages relevés</h3>
            {d.dommages.map((x: any) => (
              <div key={x.id} className="fichier"><span className={`pastille ${x.statut === 'ouvert' ? x.gravite : x.statut}`}>{typeDommage[x.type]} · {graviteDommage[x.gravite]}</span><span className="gris">{date(x.created_at)}</span></div>
            ))}
            <BoutonPdf genre="dommages" nom={nomFichier('dommages')} libelle="Relevé de dommages PDF" classe="bouton petit" donnees={{ ...base, dommages: d.dommages }} />
          </>}
        </section>

        <section className="carte">
          <h2>Actions rapides</h2>
          {(l.statut === 'reservee' || l.statut === 'en_cours') && <>
            <details className="formulaire">
              <summary className="bouton petit">Prolonger</summary>
              <Formulaire action={A.prolonger.bind(null, l.id)} className="grille">
                <label>Nouveau retour<input name="fin_prevue" type="datetime-local" defaultValue={versLocal(l.fin_prevue)} required /></label>
                <label>Nouveau prix total (€)<input name="prix_total" type="number" step="0.01" defaultValue={l.prix_total ?? ''} /></label>
                <Envoyer className="bouton">Prolonger</Envoyer>
              </Formulaire>
            </details>
            <details className="formulaire">
              <summary className="bouton petit">Changer de voiture</summary>
              <Formulaire action={A.changerVoiture.bind(null, l.id)} className="grille">
                <label>Nouveau véhicule<select name="vehicule_id" required><option value="">Choisir…</option>
                  {autres?.map((x: any) => <option key={x.id} value={x.id}>{x.immatriculation} · {[x.marque, x.modele].filter(Boolean).join(' ')}</option>)}</select></label>
                <Envoyer className="bouton">Changer</Envoyer>
              </Formulaire>
            </details>
            {l.statut === 'reservee' && <Formulaire action={A.annulerLocation.bind(null, l.id)}><Envoyer className="bouton petit danger">Annuler la réservation</Envoyer></Formulaire>}
            <p className="gris" style={{ fontSize: 13 }}>Blocage / déblocage du moteur : disponible quand le véhicule aura un traceur relié.</p>
          </>}
          <Formulaire action={A.noteLocation.bind(null, l.id)} className="grille" style={{ marginTop: 8 }}>
            <label className="pleine">Note<input name="note" defaultValue={l.note ?? ''} /></label>
            <Envoyer className="bouton petit">Enregistrer la note</Envoyer>
          </Formulaire>
          <h3 style={{ marginTop: 16 }}>Historique</h3>
          {!historique?.length && <p className="gris">Rien pour l&apos;instant.</p>}
          {historique?.map((h: any, i: number) => (
            <div key={i} className="fichier"><span>{h.action}{h.detail ? <span className="gris"> · {h.detail}</span> : null}</span><span className="gris">{dateHeure(h.created_at)}</span></div>
          ))}
        </section>
      </div>
    </Cadre>
  );
}
