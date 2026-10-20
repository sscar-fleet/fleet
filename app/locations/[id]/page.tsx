import ScanOrdinateur from '@/app/_c/ScanOrdinateur';
import PapiersClient, { cheminsPapiers } from '@/app/_c/PapiersClient';
import { notFound } from 'next/navigation';
import { utilisateurCourant } from '@/lib/agence';
import { chargerLocation } from '@/lib/location';
import { lienWhatsApp, messageDepart, messageRetour, messageRetard } from '@/lib/whatsapp';
import { kmSupplementaires } from '@/lib/documents-pdf';
import { statutLocation, statutCaution, statutEdl, typeDommage, graviteDommage, dateHeure, date, euros, km, joursEntre, versLocal, plaque, tel } from '@/lib/format';
import * as A from '../../actions';
import Cadre from '../../_c/Cadre';
import Formulaire from '../../_c/Formulaire';
import Envoyer from '../../_c/Envoyer';
import Fichier from '../../_c/Fichier';
import Signature from '../../_c/Signature';
import BoutonPdf from '../../_c/BoutonPdf';
import Copier from '../../_c/Copier';
import { headers } from 'next/headers';
import Onglets from '../../_c/Onglets';

export const dynamic = 'force-dynamic';

export default async function FicheLocation({ params }: { params: { id: string } }) {
  const { supabase, profil } = await utilisateurCourant();
  const d = await chargerLocation(supabase, profil.agence_id, params.id);
  if (!d) notFound();
  const l = d.brut; const v = l.vehicules; const c = l.clients;
  const [{ data: autres }, { data: historique }, { data: fpsDus }] = await Promise.all([
    supabase.from('vehicules').select('id, immatriculation, marque, modele').not('statut', 'in', '(hors_service,sorti)').neq('id', v.id).order('immatriculation'),
    supabase.from('historique').select('action, detail, created_at').eq('location_id', l.id).order('created_at', { ascending: false }),
    supabase.from('fps').select('montant, frais_gestion').eq('client_id', c.id).in('statut', ['a_refacturer', 'refacture']),
  ]);
  const detteFps = (fpsDus ?? []).reduce((t: number, f: any) => t + Number(f.montant ?? 0) + Number(f.frais_gestion ?? 0), 0);
  const retard = l.statut === 'en_cours' && new Date(l.fin_prevue) < new Date();
  const sup = kmSupplementaires(l);
  const jours = joursEntre(l.debut, l.fin_reelle ?? l.fin_prevue);
  const ouverts = d.dommages.filter((x: any) => x.statut === 'ouvert').length;
  const base = { agence: d.agence, location: d.location, vehicule: d.vehicule, client: d.client };
  // Lien de signature à distance, envoyé au client par WhatsApp ou e-mail
  const hd = headers();
  const lienSignature = l.jeton_signature ? `${hd.get('x-forwarded-proto') ?? 'https'}://${hd.get('host')}/signer/${l.jeton_signature}` : null;
  const signe = !!(l.signature_contrat_path || l.signature_distance);
  const msgSignature = `Bonjour ${c.prenom ?? ''}, voici votre contrat de location ${d.agence.nom} à vérifier et signer depuis votre téléphone : ${lienSignature}`;
  const nomFichier = (t: string) => `${t}-${String(l.numero).padStart(5, '0')}-${plaque(v.immatriculation)}.pdf`;
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

  const voiture = [v.marque, v.modele].filter(Boolean).join(' ') || v.immatriculation;
  const wa = c.telephone && (l.statut === 'reservee' || l.statut === 'en_cours')
    ? lienWhatsApp(c.telephone, l.statut === 'reservee' ? messageDepart(c.prenom, voiture, l.debut, d.agence.nom) : retard ? messageRetard(c.prenom, voiture, l.fin_prevue) : messageRetour(c.prenom, voiture, l.fin_prevue))
    : null;

  // Le grand bouton : l'action à faire maintenant sur cette location
  const action = l.statut === 'reservee'
    ? { texte: 'Prochaine étape : l\u2019état des lieux de départ (photos, kilomètres, carburant, signature).', bouton: <Formulaire succes={false} action={A.ouvrirEdl.bind(null, l.id, 'depart')}><Envoyer>Faire le départ</Envoyer></Formulaire> }
    : l.statut === 'en_cours'
    ? { texte: retard ? `En retard depuis le ${dateHeure(l.fin_prevue)}. Au retour du véhicule : état des lieux de retour.` : `Retour prévu le ${dateHeure(l.fin_prevue)}.`, bouton: <Formulaire succes={false} action={A.ouvrirEdl.bind(null, l.id, 'retour')}><Envoyer>Faire le retour</Envoyer></Formulaire> }
    : l.statut === 'terminee' && d.retour?.statut === 'a_comparer'
    ? { texte: 'Véhicule rendu. Comparez les photos du départ et du retour, puis décidez pour la caution.', bouton: <a className="bouton principal" href={`/locations/${l.id}/comparaison`}>Comparer et rendre la caution</a> }
    : l.statut === 'terminee' && d.agence.facture_auto
    ? { texte: 'Véhicule rendu. La facture est prête.', bouton: <BoutonPdf genre="facture" nom={nomFichier('facture')} libelle="Facture PDF" classe="bouton principal" donnees={base} /> }
    : null;
  const cautionAPrendre = (l.statut === 'reservee' || l.statut === 'en_cours') && Number(l.caution_montant) > 0 && l.caution_statut === 'a_prendre';
  const mailContrat = c.email ? `mailto:${c.email}?subject=${encodeURIComponent(`Votre contrat de location n° ${l.numero} · ${d.agence.nom}`)}&body=${encodeURIComponent(`Bonjour ${c.prenom ?? ''},\n\nVous trouverez ci-joint votre contrat de location pour la ${voiture}, du ${dateHeure(l.debut)} au ${dateHeure(l.fin_prevue)}.\n\nBonne route,\n${d.agence.nom}`)}` : null;

  const resume = (
    <div className="colonnes">
      <section className="carte">
        <h2>{plaque(v.immatriculation)} · {[v.marque, v.modele].filter(Boolean).join(' ')}</h2>
        <div className="infos">
          <div><span>Départ</span><b>{dateHeure(l.debut)}</b></div>
          <div><span>{l.fin_reelle ? 'Rendue le' : 'Retour prévu'}</span><b>{dateHeure(l.fin_reelle ?? l.fin_prevue)}</b></div>
          <div><span>Durée</span><b>{jours} jour{jours > 1 ? 's' : ''}</b></div>
          <div><span>Prix</span><b>{euros(l.prix_total)}</b></div>
          <div><span>Km au départ</span><b>{km(l.km_depart)}</b></div>
          <div><span>Km au retour</span><b>{km(l.km_retour)}</b></div>
          <div><span>Km inclus</span><b>{l.km_inclus != null ? km(l.km_inclus) : 'Illimités'}</b></div>
          {kmParcourus != null && <div><span>Parcourus</span><b>{km(kmParcourus)}</b></div>}
          {sup.enTrop > 0 && <div><span>Km en trop</span><b className="retard">{km(sup.enTrop)} · {euros(sup.montant)}</b></div>}
          {(l.carburant_depart != null || l.carburant_retour != null) && <div><span>Carburant</span><b>{l.carburant_depart ?? '—'} %{l.carburant_retour != null ? ` → ${l.carburant_retour} %` : ''}</b></div>}
        </div>
        <div className="ligne" style={{ marginTop: 14 }}>
          <a className="bouton petit" href={`/vehicules/${v.id}`}>Fiche du véhicule</a>
          {v.traceur_id && (l.statut === 'en_cours' || l.statut === 'reservee') && <a className="bouton petit" href={`/carte?vehicule=${v.id}`}>Où est la voiture ?</a>}
        </div>
      </section>
      <section className="carte">
        <h2>Caution</h2>
        <p style={{ marginTop: 0 }}><span className={`pastille ${l.caution_statut}`}>{statutCaution[l.caution_statut]}</span>
          {l.caution_montant ? <span className="gris"> · {euros(l.caution_montant)}</span> : null}
          {l.caution_retenue ? <span className="gris"> · {euros(l.caution_retenue)} retenus{l.caution_motif ? ' : ' + l.caution_motif : ''}</span> : null}</p>
        <Formulaire action={A.cautionLocation.bind(null, l.id)} className="grille" succes="Caution enregistrée">
          <label>Montant (€)<input name="caution_montant" type="number" step="0.01" min={0} defaultValue={l.caution_montant ?? ''} /></label>
          <label>Statut<select name="caution_statut" defaultValue={l.caution_statut}>
            {Object.entries(statutCaution).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>
          <details className="options pleine">
            <summary>+ Retenue sur la caution</summary>
            <div className="grille">
              <label>Retenue (€)<input name="caution_retenue" type="number" step="0.01" min={0} defaultValue={l.caution_retenue ?? ''} /></label>
              <label className="pleine">Motif<input name="caution_motif" defaultValue={l.caution_motif ?? ''} placeholder="Rayure portière, carburant manquant…" /></label>
            </div>
          </details>
          <Envoyer className="bouton">Enregistrer</Envoyer>
        </Formulaire>
      </section>
    </div>
  );

  const client = (
    <section className="carte">
      <h2><a href={`/clients/${c.id}`}>{c.nom} {c.prenom}</a> {c.liste_noire && <span className="pastille depasse" style={{ fontSize: 14 }}>Liste noire</span>}</h2>
      <div className="infos" style={{ marginBottom: 12 }}>
        <div><span>Téléphone</span><b>{c.telephone ? <a className="lien" href={`tel:${c.telephone}`}>{tel(c.telephone)}</a> : '—'}</b></div>
        <div><span>E-mail</span><b>{c.email ?? '—'}</b></div>
        <div><span>Permis du</span><b>{date(c.date_permis)}</b></div>
        <div><span>Né(e) le</span><b>{date(c.date_naissance)}</b></div>
      </div>
      {wa && <a className="bouton" style={{ marginBottom: 10 }} target="_blank" rel="noreferrer" href={wa}>WhatsApp : {l.statut === 'reservee' ? 'confirmer le départ' : retard ? 'relancer le retard' : 'rappel du retour'}</a>}
      <ScanOrdinateur clientId={c.id} />
      <PapiersClient c={c} agenceId={profil.agence_id} liens={d.liens} />
    </section>
  );

  const etats = (
    <section className="carte">
      <h2>États des lieux</h2>
      {edlBloc('depart', d.depart)}
      {edlBloc('retour', d.retour)}
      {d.depart && d.retour && <a className="bouton" style={{ marginTop: 10 }} href={`/locations/${l.id}/comparaison`}>Comparer départ et retour</a>}
      <h3 style={{ marginTop: 18 }}>Dommages relevés</h3>
      {!d.dommages.length && <p className="gris">Aucun dommage.</p>}
      {d.dommages.map((x: any) => (
        <div key={x.id} className="fichier"><span className={`pastille ${x.statut === 'ouvert' ? x.gravite : x.statut}`}>{typeDommage[x.type]} · {graviteDommage[x.gravite]}</span><span className="gris">{date(x.created_at)}</span></div>
      ))}
      {d.dommages.length > 0 && <BoutonPdf genre="dommages" nom={nomFichier('dommages')} libelle="Relevé de dommages PDF" classe="bouton petit" donnees={{ ...base, dommages: d.dommages }} />}
    </section>
  );

  const documents = (
    <section className="carte">
      <h2>Contrat et facture</h2>
      {l.signature_distance && !l.signature_contrat_path
        ? <div className="fichier"><span>Contrat signé à distance{l.signe_distance_le ? ` le ${dateHeure(l.signe_distance_le)}` : ''}</span><img src={l.signature_distance} alt="Signature du client" style={{ height: 48, background: '#fff', borderRadius: 6 }} /></div>
        : <Signature agenceId={profil.agence_id} dossier={`locations/${l.id}`} lien={d.location.signature} libelle="Le client signe le contrat ici"
            action={A.signatureContrat.bind(null, l.id)} />}
      {!signe && lienSignature && (l.statut === 'reservee' || l.statut === 'en_cours') && (
        <div className="signature-distance">
          <b>Ou faites-le signer à distance</b>
          <span className="gris">Le client reçoit un lien, vérifie sa location et signe sur son téléphone.</span>
          <div className="ligne" style={{ flexWrap: 'wrap' }}>
            {c.telephone && <a className="bouton petit principal" target="_blank" rel="noreferrer" href={lienWhatsApp(c.telephone, msgSignature)}>Envoyer par WhatsApp</a>}
            {c.email && <a className="bouton petit" href={`mailto:${c.email}?subject=${encodeURIComponent(`Votre contrat de location ${d.agence.nom}`)}&body=${encodeURIComponent(msgSignature)}`}>Envoyer par e-mail</a>}
            <Copier texte={lienSignature} />
          </div>
        </div>
      )}
      <div className="ligne" style={{ marginTop: 14 }}>
        <BoutonPdf genre="contrat" nom={nomFichier('contrat')} libelle="Contrat PDF" donnees={base} />
        {d.agence.facture_auto ? <BoutonPdf genre="facture" nom={nomFichier('facture')} libelle="Facture PDF" donnees={base} /> : <span className="gris">Facture désactivée dans Réglages</span>}
      </div>
      <p className="gris" style={{ fontSize: 13.5, marginBottom: 0 }}>Sur téléphone, le PDF s&apos;ouvre dans le partage : WhatsApp, e-mail…</p>
    </section>
  );

  const plus = (
    <section className="carte">
      <h2>Modifier la location</h2>
      {(l.statut === 'reservee' || l.statut === 'en_cours') ? <>
        <details className="formulaire">
          <summary className="bouton">Prolonger</summary>
          <Formulaire action={A.prolonger.bind(null, l.id)} className="grille" succes="Location prolongée">
            <label>Nouveau retour<input name="fin_prevue" type="datetime-local" defaultValue={versLocal(l.fin_prevue)} required /></label>
            <label>Nouveau prix total (€)<input name="prix_total" type="number" step="0.01" defaultValue={l.prix_total ?? ''} /></label>
            <Envoyer className="bouton principal">Prolonger</Envoyer>
          </Formulaire>
        </details>
        <details className="formulaire">
          <summary className="bouton">Changer de voiture</summary>
          <Formulaire action={A.changerVoiture.bind(null, l.id)} className="grille" succes="Voiture changée">
            <label>Nouveau véhicule<select name="vehicule_id" required><option value="">Choisir…</option>
              {autres?.map((x: any) => <option key={x.id} value={x.id}>{plaque(x.immatriculation)} · {[x.marque, x.modele].filter(Boolean).join(' ')}</option>)}</select></label>
            <Envoyer className="bouton principal">Changer</Envoyer>
          </Formulaire>
        </details>
        {l.statut === 'reservee' && <Formulaire action={A.annulerLocation.bind(null, l.id)} succes="Réservation annulée" confirmer="Annuler cette réservation ?">
          <Envoyer className="bouton danger">Annuler la réservation</Envoyer></Formulaire>}
        {v.traceur_id ? <div className="ligne" style={{ flexWrap: 'wrap' }}>
          <Formulaire action={A.moteur.bind(null, v.id, true)} succes="Coupure envoyée"
            confirmer={`Couper le moteur de ${plaque(v.immatriculation)} ? Le véhicule ne pourra plus redémarrer.`}>
            <Envoyer className="bouton danger">Couper le moteur</Envoyer>
          </Formulaire>
          <Formulaire action={A.moteur.bind(null, v.id, false)} succes="Moteur remis en route" confirmer={`Remettre en route le moteur de ${plaque(v.immatriculation)} ?`}>
            <Envoyer className="bouton">Remettre en route</Envoyer>
          </Formulaire>
          <a className="bouton" href={`/vehicules/${v.id}`}>Voir sur la carte</a>
        </div> : <p className="gris" style={{ fontSize: 13.5 }}>Blocage du moteur : reliez un traceur GPS depuis la fiche du véhicule.</p>}
      </> : <p className="gris">Location {statutLocation[l.statut].toLowerCase()} : plus rien à modifier.</p>}
      <Formulaire action={A.noteLocation.bind(null, l.id)} className="grille" style={{ marginTop: 8 }} succes="Note enregistrée">
        <label className="pleine">Note<input name="note" defaultValue={l.note ?? ''} /></label>
        <Envoyer className="bouton petit">Enregistrer la note</Envoyer>
      </Formulaire>
      <h3 style={{ marginTop: 18 }}>Historique</h3>
      {!historique?.length && <p className="gris">Rien pour l&apos;instant.</p>}
      {historique?.map((h: any, i: number) => (
        <div key={i} className="fichier"><span>{h.action}{h.detail ? <span className="gris"> · {h.detail}</span> : null}</span><span className="gris">{dateHeure(h.created_at)}</span></div>
      ))}
    </section>
  );

  return (
    <Cadre retour={{ lien: '/locations', texte: 'Locations' }} tables={['locations', 'etats_des_lieux', 'photos_edl', 'dommages', 'clients']}
      titre={<>N° {l.numero} · {c.prenom} {c.nom}</>}
      actions={<span className={`pastille ${retard ? 'retard' : l.statut}`} style={{ fontSize: 16 }}>{retard ? 'En retard' : statutLocation[l.statut]}</span>}>
      {c.liste_noire && <div className="alerte-bandeau">Attention : ce client est en liste noire. {c.note}</div>}
      {detteFps > 0 && (l.statut === 'reservee' || l.statut === 'en_cours') && (
        <div className="alerte-caution"><span>{c.prenom} {c.nom} doit encore <b>{euros(detteFps)}</b> de FPS (forfait de stationnement refacturé) : pensez à l’encaisser.</span><a className="bouton petit" href="/fps">Voir les FPS</a></div>
      )}
      {cautionAPrendre && (
        <div className="alerte-caution">
          <span>Caution de <b>{euros(l.caution_montant)}</b> {l.statut === 'en_cours' ? 'pas encore prise, alors que la voiture est partie.' : 'à prendre avant le départ.'}</span>
          <Formulaire action={A.cautionLocation.bind(null, l.id)} succes="Caution notée comme prise">
            <input type="hidden" name="caution_statut" value="prise" /><input type="hidden" name="caution_montant" value={l.caution_montant ?? ''} />
            <Envoyer className="bouton petit principal">Caution prise</Envoyer>
          </Formulaire>
        </div>
      )}
      {(action || c.telephone) && (
        <div className="action-principale">
          <span>{action?.texte ?? `${statutLocation[l.statut]}.`}</span>
          <span className="ligne action-boutons">
            {c.telephone && <a className="bouton petit" href={`tel:${c.telephone}`}>Appeler</a>}
            {wa && <a className="bouton petit" target="_blank" rel="noreferrer" href={wa}>WhatsApp</a>}
            {d.agence.envoi_contrat && l.statut === 'en_cours' && <BoutonPdf genre="contrat" nom={nomFichier('contrat')} libelle="Contrat PDF" classe="bouton petit" donnees={base} />}
            {d.agence.envoi_contrat && l.statut === 'en_cours' && mailContrat && <a className="bouton petit" href={mailContrat}>Contrat par e-mail</a>}
            {action?.bouton}
          </span>
        </div>
      )}
      <Onglets panneaux={[
        { cle: 'resume', titre: 'Résumé', contenu: resume },
        { cle: 'client', titre: 'Client', contenu: client },
        { cle: 'etats', titre: 'États des lieux', badge: ouverts, contenu: etats },
        { cle: 'documents', titre: 'Contrat et facture', contenu: documents },
        { cle: 'modifier', titre: 'Modifier', contenu: plus },
      ]} />
    </Cadre>
  );
}
