// Champs d'une fiche client (création et modification)
import Scanner from './Scanner';

export default function ChampsClient({ c = {} as any, obligatoire = true, agenceId }: { c?: any; obligatoire?: boolean; agenceId?: string }) {
  return (
    <>
      {agenceId && <>
        <Scanner genre="permis" agenceId={agenceId} champChemin="permis_path" libelle="Photo du permis : remplissage automatique" />
        <Scanner genre="identite" agenceId={agenceId} champChemin="piece_identite_path" libelle="Photo de la pièce d'identité" />
        <input type="hidden" name="permis_path" />
        <input type="hidden" name="piece_identite_path" />
      </>}
      <label>Nom{obligatoire ? ' *' : ''}<input name="nom" defaultValue={c.nom ?? ''} required={obligatoire} autoComplete="off" /></label>
      <label>Prénom<input name="prenom" defaultValue={c.prenom ?? ''} autoComplete="off" /></label>
      <label>Téléphone<input name="telephone" type="tel" defaultValue={c.telephone ?? ''} autoComplete="off" /></label>
      <label>E-mail<input name="email" type="email" defaultValue={c.email ?? ''} autoComplete="off" /></label>
      <label className="pleine">Adresse<input name="adresse" defaultValue={c.adresse ?? ''} autoComplete="off" /></label>
      <label>Date de naissance<input name="date_naissance" type="date" defaultValue={c.date_naissance ?? ''} /></label>
      <label>N° de permis<input name="numero_permis" defaultValue={c.numero_permis ?? ''} autoComplete="off" /></label>
      <label>Permis obtenu le<input name="date_permis" type="date" defaultValue={c.date_permis ?? ''} /></label>
    </>
  );
}
