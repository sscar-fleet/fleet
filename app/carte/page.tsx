import { utilisateurCourant } from '@/lib/agence';
import { plaque } from '@/lib/format';
import { suiviAgence, kmEstime } from '@/lib/telematique';
import Cadre from '../_c/Cadre';
import SuiviFlotte, { type LigneSuivi } from '../_c/SuiviFlotte';
import { pourCarte } from '@/lib/photoModele';

export const dynamic = 'force-dynamic';

// Suivi GPS : toute la flotte en direct, en tableau de bord
// Aperçu (?apercu=1) : voitures et clients fictifs, pour valider le rendu de la carte sans données réelles
function lignesApercu(): LigneSuivi[] {
  const il = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  const v = (id: string, immat: string, marque: string, modele: string, annee: number, couleur: string, etat: LigneSuivi['etat'], lat: number, lng: number, vitesse: number, cap: number | null, client: string | null): LigneSuivi =>
    ({ id, immat, marque, modele, etat, vitesse, contact: etat === 'roule', lat, lng, le: il(etat === 'roule' ? 0.05 : 12), km: 30000, client, retour: client ? il(-120) : null, location_id: null, statut: client ? 'loue' : 'disponible',
      ...pourCarte({ marque, modele, annee, couleur }, cap) });
  return [
    v('a1', 'AB-123-CD', 'Peugeot', '208', 2023, 'bleu', 'arret', 48.8566, 2.3522, 0, null, null),
    v('a2', 'EF-456-GH', 'Renault', 'Clio V', 2024, 'gris-fonce', 'arret', 48.8411, 2.3003, 0, null, 'Inès M.'),
    v('a3', 'IJ-789-KL', 'Mercedes-Benz', 'Classe A', 2022, 'noir', 'roule', 48.8848, 2.2966, 47, 245, 'Yanis L.'),
    v('a4', 'MN-012-OP', 'Dacia', 'Sandero', 2021, 'gris', 'arret', 48.8352, 2.2412, 0, null, 'Sarah P.'),
    v('a5', 'GH-234-JK', 'Volkswagen', 'Golf', 2022, 'gris-fonce', 'roule', 48.8635, 2.3790, 31, 160, 'Mehdi R.'),
    v('a6', 'UV-678-WX', 'Audi', 'RS3', 2023, 'noir', 'arret', 48.8462, 2.2870, 0, null, null),
  ];
}

export default async function CarteFlotte({ searchParams }: { searchParams: { vehicule?: string; apercu?: string } }) {
  if (searchParams.apercu === '1') return <Cadre titre="Suivi GPS · aperçu"><SuiviFlotte lignes={lignesApercu()} demo /></Cadre>;
  const { supabase } = await utilisateurCourant();
  const [{ data: vehicules }, { data: locations }, suivi] = await Promise.all([
    supabase.from('vehicules').select('id, immatriculation, marque, modele, annee, couleur, visuel, statut, km, traceurs(*)').neq('statut', 'sorti').order('immatriculation'),
    supabase.from('locations').select('id, vehicule_id, fin_prevue, clients(nom, prenom)').eq('statut', 'en_cours'),
    suiviAgence(supabase),
  ]);
  const lignes = (vehicules ?? []).map((v: any): LigneSuivi => {
    const t = v.traceurs; const e = t ? suivi.etats.get(String(t.imei)) : undefined;
    const loc = (locations ?? []).find((l: any) => l.vehicule_id === v.id) as any;
    const etat: LigneSuivi['etat'] = !t ? 'sans' : !e ? 'hors_ligne' : t.moteur_coupe ? 'coupe' : !e.enLigne ? 'hors_ligne' : e.enMouvement ? 'roule' : 'arret';
    return { id: v.id, immat: plaque(v.immatriculation), marque: v.marque, modele: v.modele, etat, vitesse: e?.vitesse ?? 0, contact: e?.contact ?? null,
      lat: e?.lat ?? null, lng: e?.lng ?? null, le: e?.le ?? null, km: kmEstime(t, e) ?? v.km, statut: v.statut,
      client: loc ? [loc.clients?.prenom, loc.clients?.nom].filter(Boolean).join(' ') : null, retour: loc?.fin_prevue ?? null, location_id: loc?.id ?? null, ...pourCarte(v, e?.cap) };
  });
  const sans = lignes.filter((l) => l.etat === 'sans').length;

  return (
    <Cadre titre="Suivi GPS" tables={['vehicules', 'locations']}
      actions={sans > 0 ? <a className="bouton petit" href="/vehicules">{sans} véhicule{sans > 1 ? 's' : ''} sans traceur</a> : undefined}>
      {!suivi.actif ? <div className="alerte-bandeau">{suivi.raison}</div> : <SuiviFlotte lignes={lignes} demo={suivi.demo} initial={searchParams.vehicule} />}
    </Cadre>
  );
}
