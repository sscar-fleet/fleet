import { liensFichiers } from './agence';
import { donneesAgence } from './donnees';

// Tout ce qu'il faut pour afficher une location et fabriquer ses PDF
export async function chargerLocation(supabase: any, agenceId: string, id: string) {
  const { data: l } = await supabase.from('locations')
    .select('*, vehicules(*), clients(*), etats_des_lieux(*, photos_edl(*))')
    .eq('id', id).maybeSingle();
  if (!l) return null;
  const { data: dommages } = await supabase.from('dommages').select('*').eq('location_id', id).order('created_at');
  const edls: any[] = l.etats_des_lieux ?? [];
  const liens = await liensFichiers(supabase, [
    l.signature_contrat_path, l.clients?.permis_path, l.clients?.permis_verso_path, l.clients?.piece_identite_path, l.clients?.piece_identite_verso_path, l.clients?.justificatif_domicile_path,
    l.vehicules?.carte_grise_path, l.vehicules?.assurance_path,
    ...edls.flatMap((e) => [e.signature_path, ...(e.photos_edl ?? []).map((p: any) => p.path)]),
    ...(dommages ?? []).flatMap((d: any) => [d.photo_zone_path, d.photo_gros_plan_path]),
  ]);
  const agence = await donneesAgence(supabase, agenceId);
  const v = l.vehicules; const c = l.clients;
  const vehicule = { immatriculation: v.immatriculation, marque: v.marque, modele: v.modele, carburant: v.carburant };
  const client = { nom: c.nom, prenom: c.prenom, telephone: c.telephone, email: c.email, adresse: c.adresse,
    date_naissance: c.date_naissance, date_permis: c.date_permis, numero_permis: c.numero_permis };
  const location = { ...l, vehicules: undefined, clients: undefined, etats_des_lieux: undefined, signature: liens[l.signature_contrat_path] ?? l.signature_distance ?? null };
  const dommagesDoc = (dommages ?? []).map((d: any) => ({ ...d, photo_zone: liens[d.photo_zone_path] ?? null, photo_gros_plan: liens[d.photo_gros_plan_path] ?? null }));
  const edlDoc = (type: 'depart' | 'retour') => {
    const e = edls.find((x) => x.type === type);
    if (!e) return null;
    return { ...e, photos_edl: undefined, signature: liens[e.signature_path] ?? null,
      photos: (e.photos_edl ?? []).sort((a: any, b: any) => a.prise_le.localeCompare(b.prise_le)).map((p: any) => ({ position: p.position, url: liens[p.path], id: p.id })) };
  };
  return { brut: l, liens, agence, vehicule, client, location, dommages: dommagesDoc, depart: edlDoc('depart'), retour: edlDoc('retour') };
}
