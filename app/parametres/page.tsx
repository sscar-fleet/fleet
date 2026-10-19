import { headers } from 'next/headers';
import { utilisateurCourant, liensFichiers } from '@/lib/agence';
import { lienWhatsApp } from '@/lib/whatsapp';
import * as A from '../actions';
import Cadre from '../_c/Cadre';
import Formulaire from '../_c/Formulaire';
import Envoyer from '../_c/Envoyer';
import Fichier from '../_c/Fichier';
import Signature from '../_c/Signature';
import Deconnexion from './Deconnexion';
import ChampAdresse from '../_c/ChampAdresse';

export const dynamic = 'force-dynamic';

export default async function Parametres() {
  const { supabase, profil } = await utilisateurCourant();
  const [{ data: a }, { data: utilisateurs }, { data: invitations }] = await Promise.all([
    supabase.from('agences').select('*').eq('id', profil.agence_id).single(),
    supabase.from('utilisateurs').select('id, nom, role, email').order('created_at'),
    supabase.from('invitations').select('id, nom, email, jeton').eq('utilisee', false).order('created_at'),
  ]);
  const h = headers();
  const origine = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  const liens = await liensFichiers(supabase, [a.logo_path, a.signature_path, a.tampon_path, a.kbis_path, a.gerant_piece_identite_path]);
  const gerant = profil.role === 'gerant';
  const doc = (titre: string, champ: string, accept?: string) => (
    <Fichier agenceId={profil.agence_id} dossier="agence" nom={champ.replace('_path', '')} libelle={titre} lien={liens[a[champ]]}
      action={A.documentAgence.bind(null, champ)} accept={accept} />
  );

  return (
    <Cadre titre="Réglages" actions={<Deconnexion />}>
      <div className="colonnes">
        <section className="carte">
          <h2>Identité de l&apos;agence</h2>
          <p className="gris" style={{ fontSize: 13.5, marginTop: 0 }}>Ces informations et votre logo apparaissent sur tous les documents : contrat, facture, devis, état des lieux, bon de pouvoir fourrière.</p>
          <Formulaire action={A.majAgence} className="grille">
            <label>Nom de l&apos;agence<input name="nom" defaultValue={a.nom} required disabled={!gerant} /></label>
            <label>SIRET<input name="siret" defaultValue={a.siret ?? ''} disabled={!gerant} /></label>
            <label>Forme juridique<input name="forme_juridique" defaultValue={a.forme_juridique ?? ''} placeholder="SAS, SARL, EI…" disabled={!gerant} /></label>
            <label>RCS<input name="rcs" defaultValue={a.rcs ?? ''} placeholder="RCS Paris 123 456 789" disabled={!gerant} /></label>
            <ChampAdresse defaut={a.adresse ?? ''} disabled={!gerant} />
            <label>Téléphone<input name="telephone" defaultValue={a.telephone ?? ''} disabled={!gerant} /></label>
            <label>E-mail<input name="email" type="email" defaultValue={a.email ?? ''} disabled={!gerant} /></label>
            <label>Nom du gérant<input name="gerant_nom" defaultValue={a.gerant_nom ?? ''} disabled={!gerant} /></label>
            <label>TVA (%)<input name="tva_taux" type="number" step="0.1" min={0} defaultValue={a.tva_taux ?? 20} disabled={!gerant} /></label>
            <label>N° de TVA intracommunautaire<input name="tva_intra" defaultValue={a.tva_intra ?? ''} disabled={!gerant} /></label>
            <label>Site internet<input name="site" defaultValue={a.site ?? ''} disabled={!gerant} /></label>
            <label className="pleine">IBAN (imprimé sur les factures)<input name="iban" defaultValue={a.iban ?? ''} placeholder="FR76 …" disabled={!gerant} /></label>
            <label>Couleur des documents<input name="couleur" type="color" defaultValue={a.couleur ?? '#19F7D6'} disabled={!gerant} style={{ height: 46, padding: 4 }} /></label>
            <label className="case pleine"><input type="checkbox" name="envoi_contrat" defaultChecked={a.envoi_contrat ?? true} disabled={!gerant} />Proposer l&apos;envoi du contrat au client dès le départ</label>
            <label className="case pleine"><input type="checkbox" name="facture_auto" defaultChecked={a.facture_auto ?? true} disabled={!gerant} />Proposer la facture au retour du véhicule</label>
            <label className="pleine">Conditions générales (imprimées sur le contrat)<textarea name="conditions" defaultValue={a.conditions ?? ''} disabled={!gerant}
              placeholder="Franchise, carburant, retard, amendes, interdiction de sous-louer…" /></label>
            {gerant && <Envoyer className="bouton">Enregistrer</Envoyer>}
          </Formulaire>
          <p className="gris" style={{ fontSize: 13, marginBottom: 0 }}>TVA à 0 : la facture indique « TVA non applicable, article 293 B du CGI ».</p>
        </section>
        <section className="carte">
          <h2>Documents saisis une seule fois</h2>
          <p className="gris" style={{ fontSize: 13, marginTop: 0 }}>Ils servent aux contrats, factures et attestations fourrière.</p>
          {doc('Logo de l’agence (PNG ou JPG)', 'logo_path', 'image/png,image/jpeg')}
          {doc('Tampon de la société (PNG ou JPG)', 'tampon_path', 'image/png,image/jpeg')}
          {doc('Extrait Kbis', 'kbis_path')}
          {doc('Pièce d’identité du gérant', 'gerant_piece_identite_path')}
          <div style={{ marginTop: 14 }}>
            <Signature agenceId={profil.agence_id} dossier="agence" lien={liens[a.signature_path]} libelle="Signature du gérant"
              action={A.documentAgence.bind(null, 'signature_path')} />
          </div>
        </section>
      </div>
      <section className="carte" style={{ marginTop: 16 }}>
        <h2>Accès ({utilisateurs?.length ?? 0}) <span className="gris" style={{ fontWeight: 400, fontSize: 14 }}>· illimités</span></h2>
        {utilisateurs?.map((u: any) => (
          <div key={u.id} className="fichier">
            <span>{u.nom}{u.email ? <span className="gris"> · {u.email}</span> : null}</span>
            <span className="ligne"><span className="gris">{u.role === 'gerant' ? 'Gérant' : 'Employé'}</span>
              {gerant && u.role !== 'gerant' && <Formulaire action={A.retirerAcces.bind(null, u.id)} succes="Accès retiré" confirmer={`Retirer l'accès de ${u.nom} ?`}><Envoyer className="bouton petit danger">Retirer l&apos;accès</Envoyer></Formulaire>}</span>
          </div>
        ))}
        {gerant && invitations?.map((i: any) => {
          const lien = `${origine}/invitation/${i.jeton}`;
          const message = `Bonjour ${i.nom}, voici ton accès à SS CAR FLEET pour ${a.nom} : ${lien}`;
          return (
            <div key={i.id} className="fichier">
              <span>{i.nom} <span className="gris">· {i.email} · invitation en attente</span><br /><span className="gris" style={{ fontSize: 12.5, wordBreak: 'break-all' }}>{lien}</span></span>
              <span className="ligne">
                <a className="bouton petit" href={lienWhatsApp(null, message)} target="_blank" rel="noreferrer">WhatsApp</a>
                <a className="bouton petit" href={`mailto:${i.email}?subject=${encodeURIComponent('Ton accès SS CAR FLEET')}&body=${encodeURIComponent(message)}`}>E-mail</a>
                <Formulaire action={A.annulerInvitation.bind(null, i.id)} succes="Invitation annulée"><Envoyer className="bouton petit">Annuler</Envoyer></Formulaire>
              </span>
            </div>
          );
        })}
        {gerant && (
          <details className="formulaire" style={{ marginTop: 12 }}>
            <summary className="bouton petit principal">+ Ajouter un employé</summary>
            <Formulaire vider action={A.inviterEmploye} className="grille" succes="Invitation créée : envoyez le lien">
              <label>Prénom et nom<input name="nom" required /></label>
              <label>E-mail<input name="email" type="email" required /></label>
              <Envoyer className="bouton">Créer l&apos;invitation</Envoyer>
            </Formulaire>
            <p className="gris" style={{ fontSize: 13, marginBottom: 0 }}>Fleet crée un lien personnel à envoyer par WhatsApp ou e-mail. L&apos;employé choisit son mot de passe. Il voit les locations, véhicules, clients et états des lieux, mais pas le pilotage ni les réglages.</p>
          </details>
        )}
        <p className="gris" style={{ fontSize: 12.5, marginBottom: 0, marginTop: 12 }}><a href="/confidentialite">Confidentialité</a> · <a href="/conditions">Conditions d&apos;utilisation</a></p>
      </section>
    </Cadre>
  );
}
