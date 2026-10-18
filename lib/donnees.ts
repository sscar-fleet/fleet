import { liensFichiers } from './agence';

// Données de l'agence utilisées dans les PDF (avec liens temporaires vers logo, signature, tampon…)
export async function donneesAgence(supabase: any, agenceId: string) {
  const { data: a } = await supabase.from('agences').select('*').eq('id', agenceId).single();
  const liens = await liensFichiers(supabase, [a?.logo_path, a?.signature_path, a?.tampon_path, a?.kbis_path, a?.gerant_piece_identite_path]);
  return {
    nom: a?.nom ?? '', adresse: a?.adresse, telephone: a?.telephone, email: a?.email, siret: a?.siret,
    gerant_nom: a?.gerant_nom, conditions: a?.conditions, tva_taux: a?.tva_taux ?? 20,
    forme_juridique: a?.forme_juridique, rcs: a?.rcs, tva_intra: a?.tva_intra, iban: a?.iban, site: a?.site,
    couleur: a?.couleur ?? '#19F7D6', envoi_contrat: a?.envoi_contrat ?? true, facture_auto: a?.facture_auto ?? true,
    logo: liens[a?.logo_path] ?? null, signature: liens[a?.signature_path] ?? null, tampon: liens[a?.tampon_path] ?? null,
    kbis: liens[a?.kbis_path] ?? null, piece_gerant: liens[a?.gerant_piece_identite_path] ?? null,
  };
}
