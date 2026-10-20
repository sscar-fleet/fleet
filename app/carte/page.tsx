import { utilisateurCourant } from '@/lib/agence';
import { plaque } from '@/lib/format';
import { suiviAgence, kmEstime } from '@/lib/telematique';
import Cadre from '../_c/Cadre';
import SuiviFlotte, { type LigneSuivi } from '../_c/SuiviFlotte';

export const dynamic = 'force-dynamic';

// Suivi GPS : toute la flotte en direct, en tableau de bord
export default async function CarteFlotte({ searchParams }: { searchParams: { vehicule?: string } }) {
  const { supabase } = await utilisateurCourant();
  const [{ data: vehicules }, { data: locations }, suivi] = await Promise.all([
    supabase.from('vehicules').select('id, immatriculation, marque, modele, statut, km, traceurs(*)').neq('statut', 'sorti').order('immatriculation'),
    supabase.from('locations').select('id, vehicule_id, fin_prevue, clients(nom, prenom)').eq('statut', 'en_cours'),
    suiviAgence(supabase),
  ]);
  const lignes = (vehicules ?? []).map((v: any): LigneSuivi => {
    const t = v.traceurs; const e = t ? suivi.etats.get(String(t.imei)) : undefined;
    const loc = (locations ?? []).find((l: any) => l.vehicule_id === v.id) as any;
    const etat: LigneSuivi['etat'] = !t ? 'sans' : !e ? 'hors_ligne' : t.moteur_coupe ? 'coupe' : !e.enLigne ? 'hors_ligne' : e.enMouvement ? 'roule' : 'arret';
    return { id: v.id, immat: plaque(v.immatriculation), marque: v.marque, modele: v.modele, etat, vitesse: e?.vitesse ?? 0, contact: e?.contact ?? null,
      lat: e?.lat ?? null, lng: e?.lng ?? null, le: e?.le ?? null, km: kmEstime(t, e) ?? v.km, statut: v.statut,
      client: loc ? [loc.clients?.prenom, loc.clients?.nom].filter(Boolean).join(' ') : null, retour: loc?.fin_prevue ?? null, location_id: loc?.id ?? null };
  });
  const sans = lignes.filter((l) => l.etat === 'sans').length;

  return (
    <Cadre titre="Suivi GPS" tables={['vehicules', 'locations']}
      actions={sans > 0 ? <a className="bouton petit" href="/vehicules">{sans} véhicule{sans > 1 ? 's' : ''} sans traceur</a> : undefined}>
      {!suivi.actif ? <div className="alerte-bandeau">{suivi.raison}</div> : <SuiviFlotte lignes={lignes} demo={suivi.demo} initial={searchParams.vehicule} />}
    </Cadre>
  );
}
