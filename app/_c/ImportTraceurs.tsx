// Import de la flotte depuis le compte de suivi : chaque boîtier pas encore relié devient une fiche véhicule en un geste.
import Formulaire from './Formulaire';
import Envoyer from './Envoyer';
import { importerVehicules } from '../actions';
import { devinerMarqueModele } from '@/lib/logoMarque';
import { plaque } from '@/lib/format';
import type { FicheBoitier } from '@/lib/telematique';

type Fiche = FicheBoitier & { enLigne: boolean; existe: string | null };

export default function ImportTraceurs({ fiches, ouvert }: { fiches: Fiche[]; ouvert: boolean }) {
  const liste = fiches.filter((f) => f.existe !== 'relie');
  if (!liste.length) return null;
  const avecPlaque = liste.filter((f) => f.plaque).length;
  return (
    <details className="formulaire carte formulaire-haut import-traceurs" open={ouvert}>
      <summary>Importer depuis vos traceurs ({liste.length})</summary>
      <p className="gris" style={{ marginTop: 0 }}>
        {liste.length} boîtier{liste.length > 1 ? 's' : ''} de votre compte de suivi {liste.length > 1 ? 'ne sont' : 'n’est'} relié{liste.length > 1 ? 's' : ''} à aucune fiche.
        {avecPlaque ? ` La plaque a été retrouvée pour ${avecPlaque} d’entre eux.` : ''} Vérifiez, décochez ce qui ne vous concerne pas, puis importez : les fiches sont créées et les traceurs reliés.
      </p>
      <Formulaire action={importerVehicules} succes="Véhicules importés">
        <div className="tableau">
          <table className="import">
            <thead><tr><th></th><th>Immatriculation</th><th>Marque</th><th>Modèle</th><th className="masque-mobile">Boîtier</th></tr></thead>
            <tbody>
              {liste.map((f) => {
                const mm = devinerMarqueModele(f.nom);
                return (
                  <tr key={f.imei}>
                    <td><input type="hidden" name="imei" value={f.imei} /><input type="checkbox" name={`garder_${f.imei}`} defaultChecked={!!f.plaque} aria-label={`Importer ${f.nom ?? f.imei}`} style={{ width: 22, height: 22 }} /></td>
                    <td><input name={`immat_${f.imei}`} defaultValue={f.plaque ? plaque(f.plaque) : ''} placeholder="AB-123-CD" autoCapitalize="characters" autoComplete="off" aria-label="Immatriculation" />
                      {f.existe && <small className="gris" style={{ display: 'block' }}>Déjà dans la flotte : le boîtier sera relié</small>}</td>
                    <td><input name={`marque_${f.imei}`} defaultValue={mm.marque} placeholder="Marque" aria-label="Marque" /></td>
                    <td><input name={`modele_${f.imei}`} defaultValue={mm.modele} placeholder="Modèle" aria-label="Modèle" /></td>
                    <td className="masque-mobile"><small><span className={`pastille ${f.enLigne ? 'disponible' : ''}`}>{f.enLigne ? 'En ligne' : 'Hors ligne'}</span><br /><span className="gris">{f.nom ? `${f.nom} · ` : ''}IMEI {f.imei}</span></small></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Envoyer className="bouton principal">Importer les véhicules cochés</Envoyer>
      </Formulaire>
    </details>
  );
}
