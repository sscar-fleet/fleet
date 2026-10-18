// Les papiers d'un client : permis et pièce d'identité recto verso, justificatif de domicile
import Fichier from './Fichier';
import * as A from '@/app/actions';

export const papiers = [
  { champ: 'permis_path', nom: 'permis', libelle: 'Permis de conduire (recto)' },
  { champ: 'permis_verso_path', nom: 'permis-verso', libelle: 'Permis de conduire (verso)' },
  { champ: 'piece_identite_path', nom: 'identite', libelle: "Pièce d'identité (recto)" },
  { champ: 'piece_identite_verso_path', nom: 'identite-verso', libelle: "Pièce d'identité (verso)" },
  { champ: 'justificatif_domicile_path', nom: 'domicile', libelle: "Justificatif de domicile / attestation d'hébergement" },
] as const;

export const cheminsPapiers = (c: any) => papiers.map((p) => c?.[p.champ]);
export const papiersComplets = (c: any) => papiers.every((p) => !!c?.[p.champ]);
export const papiersManquants = (c: any) => papiers.filter((p) => !c?.[p.champ]).length;

export default function PapiersClient({ c, agenceId, liens }: { c: any; agenceId: string; liens: Record<string, string> }) {
  return (
    <>
      {papiers.map((p) => (
        <Fichier key={p.champ} agenceId={agenceId} dossier={`clients/${c.id}`} nom={p.nom} libelle={p.libelle} camera
          lien={liens[c[p.champ]]} action={A.documentClient.bind(null, c.id, p.champ)} />
      ))}
    </>
  );
}
