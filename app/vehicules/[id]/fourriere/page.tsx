import { notFound } from 'next/navigation';
import { utilisateurCourant, liensFichiers } from '@/lib/agence';
import { dateHeure, plaque } from '@/lib/format';
import { donneesAgence } from '@/lib/donnees';
import { enregistrerAttestation } from '../../../actions';
import Cadre from '../../../_c/Cadre';
import FormulaireFourriere from './Formulaire';

export const dynamic = 'force-dynamic';

export default async function Fourriere({ params }: { params: { id: string } }) {
  const { supabase, profil } = await utilisateurCourant();
  const { data: v } = await supabase.from('vehicules').select('id, immatriculation, marque, modele, carte_grise_path, assurance_path').eq('id', params.id).maybeSingle();
  if (!v) notFound();
  const agence = await donneesAgence(supabase, profil.agence_id);
  const liens = await liensFichiers(supabase, [v.carte_grise_path, v.assurance_path]);
  const { data: anciennes } = await supabase.from('attestations_fourriere').select('personne_autorisee, fourriere, created_at')
    .eq('vehicule_id', v.id).order('created_at', { ascending: false }).limit(10);

  const pieces = [
    ['Nom du gérant', !!agence.gerant_nom, '/parametres'],
    ['Signature du gérant', !!agence.signature, '/parametres'],
    ['Tampon de la société', !!agence.tampon, '/parametres'],
    ['Extrait Kbis', !!agence.kbis, '/parametres'],
    ['Pièce d’identité du gérant', !!agence.piece_gerant, '/parametres'],
    ['Carte grise', !!v.carte_grise_path, `/vehicules/${v.id}`],
    ['Assurance', !!v.assurance_path, `/vehicules/${v.id}`],
  ] as const;
  const manque = pieces.filter((p) => !p[1]);

  return (
    <Cadre retour={{ lien: `/vehicules/${v.id}`, texte: v.immatriculation }} titre="Attestation fourrière">
      <div className="colonnes">
        <section className="carte">
          <h2>Bon de pouvoir pour {plaque(v.immatriculation)}</h2>
          <FormulaireFourriere
            action={enregistrerAttestation.bind(null, v.id)}
            agence={agence}
            vehicule={{ immatriculation: v.immatriculation, marque: v.marque, modele: v.modele,
              carte_grise: liens[v.carte_grise_path] ?? null, assurance: liens[v.assurance_path] ?? null }} />
        </section>
        <section className="carte">
          <h2>Pièces jointes au PDF</h2>
          {pieces.map(([titre, ok, lien]) => (
            <a key={titre} href={ok ? undefined : lien} className="fichier">
              <span className={`pastille ${ok ? 'ok' : 'depasse'}`}>{titre}</span>
              {!ok && <span className="lien">Ajouter</span>}
            </a>
          ))}
          {manque.length > 0 && <p className="gris" style={{ fontSize: 13 }}>Ce qui manque ne sera pas dans le PDF. Gérant, signature, tampon, Kbis et pièce d&apos;identité se saisissent une seule fois dans Réglages.</p>}
          <p className="gris" style={{ fontSize: 13 }}>Au guichet : le bon de pouvoir, la photocopie de la pièce d&apos;identité du gérant, la mainlevée s&apos;il y en a une, la carte grise et l&apos;assurance.</p>
          {!!anciennes?.length && <>
            <h3 style={{ marginTop: 16 }}>Déjà faites</h3>
            {anciennes.map((a: any, i: number) => (
              <div key={i} className="fichier"><span>{a.personne_autorisee}{a.fourriere ? <span className="gris"> · {a.fourriere}</span> : null}</span><span className="gris">{dateHeure(a.created_at)}</span></div>
            ))}
          </>}
        </section>
      </div>
    </Cadre>
  );
}
