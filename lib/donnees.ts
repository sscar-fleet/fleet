import { liensFichiers } from './agence';

// Données de l'agence utilisées dans les PDF (avec liens temporaires vers logo, signature, tampon…)
export async function donneesAgence(supabase: any, agenceId: string) {
  const { data: a } = await supabase.from('agences').select('*').eq('id', agenceId).single();
  const liens = await liensFichiers(supabase, [a?.logo_path, a?.signature_path, a?.tampon_path, a?.kbis_path, a?.gerant_piece_identite_path]);
  return {
    nom: a?.nom ?? '', adresse: a?.adresse, telephone: a?.telephone, email: a?.email, siret: a?.siret,
    gerant_nom: a?.gerant_nom, conditions: a?.conditions, tva_taux: a?.tva_taux ?? 20,
    logo: liens[a?.logo_path] ?? null, signature: liens[a?.signature_path] ?? null, tampon: liens[a?.tampon_path] ?? null,
    kbis: liens[a?.kbis_path] ?? null, piece_gerant: liens[a?.gerant_piece_identite_path] ?? null,
  };
}
