import { utilisateurCourant, liensFichiers } from '@/lib/agence';
import * as A from '../actions';
import Cadre from '../_c/Cadre';
import Formulaire from '../_c/Formulaire';
import Envoyer from '../_c/Envoyer';
import Fichier from '../_c/Fichier';
import Signature from '../_c/Signature';
import Deconnexion from './Deconnexion';

export const dynamic = 'force-dynamic';

export default async function Parametres() {
  const { supabase, profil } = await utilisateurCourant();
  const [{ data: a }, { data: utilisateurs }] = await Promise.all([
    supabase.from('agences').select('*').eq('id', profil.agence_id).single(),
    supabase.from('utilisateurs').select('nom, role').order('created_at'),
  ]);
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
          <h2>Société</h2>
          <Formulaire action={A.majAgence} className="grille">
            <label>Nom de l&apos;agence<input name="nom" defaultValue={a.nom} required disabled={!gerant} /></label>
            <label>SIRET<input name="siret" defaultValue={a.siret ?? ''} disabled={!gerant} /></label>
            <label className="pleine">Adresse<input name="adresse" defaultValue={a.adresse ?? ''} disabled={!gerant} /></label>
            <label>Téléphone<input name="telephone" defaultValue={a.telephone ?? ''} disabled={!gerant} /></label>
            <label>E-mail<input name="email" type="email" defaultValue={a.email ?? ''} disabled={!gerant} /></label>
            <label>Nom du gérant<input name="gerant_nom" defaultValue={a.gerant_nom ?? ''} disabled={!gerant} /></label>
            <label>TVA (%)<input name="tva_taux" type="number" step="0.1" min={0} defaultValue={a.tva_taux ?? 20} disabled={!gerant} /></label>
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
        <h2>Accès</h2>
        {utilisateurs?.map((u: any, i: number) => (
          <div key={i} className="fichier"><span>{u.nom}</span><span className="gris">{u.role === 'gerant' ? 'Gérant' : 'Employé'}</span></div>
        ))}
        <p className="gris" style={{ fontSize: 13, marginBottom: 0 }}>{a.acces_inclus} accès inclus. L&apos;ajout d&apos;un employé arrive dans une prochaine version.</p>
      </section>
    </Cadre>
  );
}
