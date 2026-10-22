// État des lieux fait sur le téléphone, même sans réseau : tout part dans la file d'attente
import { supabase } from './supabase';
import { enLigne, mettreEnFile } from './hors-ligne';
import { nouvelId } from './id';
import { DEMO } from './demo';
import { api } from './site';

export const POSITIONS = [
  { position: 'face_avant', libelle: 'Face avant' },
  { position: 'lateral_gauche_avant', libelle: 'Côté gauche, avant' },
  { position: 'lateral_gauche_arriere', libelle: 'Côté gauche, arrière' },
  { position: 'face_arriere', libelle: 'Face arrière' },
  { position: 'lateral_droit_arriere', libelle: 'Côté droit, arrière' },
  { position: 'lateral_droit_avant', libelle: 'Côté droit, avant' },
  { position: 'roue_avant_gauche', libelle: 'Roue avant gauche' },
  { position: 'roue_arriere_gauche', libelle: 'Roue arrière gauche' },
  { position: 'roue_arriere_droite', libelle: 'Roue arrière droite' },
  { position: 'roue_avant_droite', libelle: 'Roue avant droite' },
  { position: 'compteur', libelle: 'Compteur, moteur allumé' },
] as const;

export const VOYANTS: Record<string, string> = { moteur: 'Moteur', huile: 'Huile', batterie: 'Batterie', freins: 'Freins', airbag: 'Airbag', pneus: 'Pression des pneus', temperature: 'Température', abs: 'ABS / ESP', entretien: 'Entretien', autre: 'Autre' };


// Retrouve l'état des lieux déjà commencé (sur le site ou ici), sinon en prépare un nouveau
export async function ouvrirEdl(locationId: string, type: 'depart' | 'retour', agenceId: string, auteur: string) {
  if (DEMO) return nouvelId();
  if (await enLigne()) {
    const { data } = await supabase.from('etats_des_lieux').select('id').eq('location_id', locationId).eq('type', type).maybeSingle();
    if (data) return data.id as string;
  }
  const id = nouvelId();
  await mettreEnFile({ genre: 'ajout', table: 'etats_des_lieux', champs: { id, agence_id: agenceId, location_id: locationId, type, created_by: auteur } });
  return id;
}

export async function ajouterPhoto(edlId: string, agenceId: string, position: string, uri: string) {
  const chemin = `${agenceId}/edl/${edlId}/${position}-${Date.now()}.jpg`;
  await mettreEnFile({ genre: 'fichier', chemin, uri, type: 'image/jpeg',
    ensuite: { genre: 'ajout', table: 'photos_edl', champs: { agence_id: agenceId, edl_id: edlId, position, path: chemin } } });
  return chemin;
}

// Dégât repéré pendant l'état des lieux : il part dans la liste des dommages du véhicule
export const TYPES_DEGAT = { rayure: 'Rayure', bosse: 'Bosse', impact: 'Impact', jante: 'Jante', autre: 'Autre' } as const;
export async function ajouterDegat(p: { agenceId: string; vehiculeId: string; locationId: string; edlId: string; zone: string; type: keyof typeof TYPES_DEGAT; gravite: 'leger' | 'moyen' | 'grave'; photo?: string }) {
  await mettreEnFile({ genre: 'ajout', table: 'dommages', champs: {
    agence_id: p.agenceId, vehicule_id: p.vehiculeId, location_id: p.locationId, edl_id: p.edlId, zone: p.zone, type: p.type, gravite: p.gravite, photo_zone_path: p.photo ?? null } });
}

// Prolonger une location en cours : nouvelle date de retour, prix ajusté au tarif du jour
export async function prolonger(l: { id: string; fin_prevue: string; prix_total: number | null; vehicules: { prix_jour: number | null } | null }, joursOuFin: number | Date) {
  const fin = (typeof joursOuFin === 'number' ? new Date(new Date(l.fin_prevue).getTime() + joursOuFin * 864e5) : joursOuFin).toISOString();
  const jours = Math.max(0, Math.ceil((new Date(fin).getTime() - new Date(l.fin_prevue).getTime()) / 864e5 - 0.01));
  const prix = l.vehicules?.prix_jour && l.prix_total != null ? Number(l.prix_total) + Number(l.vehicules.prix_jour) * jours : l.prix_total;
  await mettreEnFile({ genre: 'maj', table: 'locations', id: l.id, champs: { fin_prevue: fin, prix_total: prix } });
  return { fin, prix };
}

export async function terminerEdl(p: {
  edlId: string; type: 'depart' | 'retour'; locationId: string; vehiculeId: string;
  km: number; carburant: number; checklist: Record<string, unknown>; latitude?: number; longitude?: number;
}) {
  const maintenant = new Date().toISOString();
  await mettreEnFile({ genre: 'maj', table: 'etats_des_lieux', id: p.edlId, champs: {
    km: p.km, carburant: p.carburant, checklist: p.checklist, latitude: p.latitude ?? null, longitude: p.longitude ?? null,
    signe_le: maintenant, statut: p.type === 'depart' ? 'termine' : 'a_comparer' } });
  if (p.type === 'depart') {
    await mettreEnFile({ genre: 'maj', table: 'locations', id: p.locationId, champs: { statut: 'en_cours', km_depart: p.km, carburant_depart: p.carburant } });
    await mettreEnFile({ genre: 'maj', table: 'vehicules', id: p.vehiculeId, champs: { statut: 'loue', km: p.km } });
  } else {
    await mettreEnFile({ genre: 'maj', table: 'locations', id: p.locationId, champs: { statut: 'terminee', km_retour: p.km, carburant_retour: p.carburant, fin_reelle: maintenant } });
    await mettreEnFile({ genre: 'maj', table: 'vehicules', id: p.vehiculeId, champs: { statut: 'disponible', km: p.km } });
  }
  // Le traceur repart du vrai compteur (sans bloquer si le réseau ou le GPS ne répond pas)
  if (!DEMO && p.km > 0) api('mobile/recaler', { vehicule_id: p.vehiculeId, km: p.km }).catch(() => {});
}

// Signature du client : image envoyée dans le stockage puis rattachée à l'état des lieux
// Au départ, la même signature vaut signature du contrat s'il n'était pas encore signé
export async function ajouterSignature(edlId: string, agenceId: string, uri: string, contratDe?: string) {
  const chemin = `${agenceId}/edl/${edlId}/signature-${Date.now()}.png`;
  await mettreEnFile({ genre: 'fichier', chemin, uri, type: 'image/png',
    ensuite: { genre: 'maj', table: 'etats_des_lieux', id: edlId, champs: { signature_path: chemin } } });
  if (contratDe) await mettreEnFile({ genre: 'maj', table: 'locations', id: contratDe, champs: { signature_contrat_path: chemin } });
}

// PDF de l'état des lieux (photos, compteur, carburant), fabriqué sur le serveur une fois tout envoyé
export async function lienPdfEdl(locationId: string, type: 'depart' | 'retour', surAttente?: (n: number) => void): Promise<string | null> {
  if (DEMO) { await new Promise((r) => setTimeout(r, 1200)); return 'https://exemple.fr/etat-des-lieux.pdf'; }
  const { enAttente, envoyerFile } = await import('./hors-ligne');
  for (let i = 0; i < 45; i++) {
    const n = await enAttente();
    surAttente?.(n);
    if (!n) break;
    await envoyerFile().catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (await enAttente()) return null;
  const { api } = await import('./site');
  const r = await api<{ lien: string | null }>('mobile/edl-pdf', { location_id: locationId, type });
  return r.lien;
}

// Contrat, facture ou état des lieux en PDF (fabriqué sur le serveur, lien valable 30 jours)
export async function lienDocument(locationId: string, genre: 'contrat' | 'facture' | 'edl_depart' | 'edl_retour'): Promise<string | null> {
  if (DEMO) { await new Promise((r) => setTimeout(r, 900)); return 'https://exemple.fr/document.pdf'; }
  if (genre.startsWith('edl')) return lienPdfEdl(locationId, genre === 'edl_depart' ? 'depart' : 'retour');
  const { api } = await import('./site');
  return (await api<{ lien: string | null }>('mobile/document', { location_id: locationId, genre })).lien;
}
