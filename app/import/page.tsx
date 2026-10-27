import Cadre from '../_c/Cadre';
import { utilisateurCourant } from '@/lib/agence';
import { equipementsDeLAgence } from '@/lib/annuaireSscs';
import { reglagesCatalogue } from '@/lib/photoModele';
import ImportFlotte from './ImportFlotte';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // l'écriture d'une grosse flotte (actions de cette page)
export const metadata = { title: 'Importer ma flotte' };

// Une seule porte pour mettre toute sa flotte dans Fleet : on dépose tout en vrac, Fleet AI trie, on vérifie, on importe.
export default async function Import() {
  const { supabase, profil, transport } = await utilisateurCourant();
  const [{ data: vs }, sscs] = await Promise.all([
    supabase.from('vehicules').select('immatriculation').neq('statut', 'sorti'),
    profil.role === 'gerant' ? equipementsDeLAgence(supabase).catch(() => null) : Promise.resolve(null),
  ]);
  return (
    <Cadre titre="Importer ma flotte" retour={{ lien: '/vehicules', texte: 'Véhicules' }}>
      <ImportFlotte
        agenceId={profil.agence_id}
        transport={transport}
        existantes={(vs ?? []).map((v: any) => v.immatriculation)}
        catalogue={reglagesCatalogue()}
        sscs={sscs && sscs.vehicules.length ? { nom: sscs.client.nom, vehicules: sscs.vehicules.map((v) => ({ immatriculation: v.immatriculation, marque: v.marque, modele: v.modele })), dejaRelies: sscs.dejaRelies } : null}
      />
    </Cadre>
  );
}
