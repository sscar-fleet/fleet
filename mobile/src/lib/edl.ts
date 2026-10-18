// État des lieux fait sur le téléphone, même sans réseau : tout part dans la file d'attente
import { supabase } from './supabase';
import { enLigne, mettreEnFile } from './hors-ligne';

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

export const VOYANTS = { moteur: 'Moteur', huile: 'Huile', batterie: 'Batterie', freins: 'Freins', airbag: 'Airbag', pneus: 'Pression des pneus', temperature: 'Température', abs: 'ABS / ESP', entretien: 'Entretien', autre: 'Autre' };

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

// Retrouve l'état des lieux déjà commencé (sur le site ou ici), sinon en prépare un nouveau
export async function ouvrirEdl(locationId: string, type: 'depart' | 'retour', agenceId: string, auteur: string) {
  if (await enLigne()) {
    const { data } = await supabase.from('etats_des_lieux').select('id').eq('location_id', locationId).eq('type', type).maybeSingle();
    if (data) return data.id as string;
  }
  const id = uuid();
  await mettreEnFile({ genre: 'ajout', table: 'etats_des_lieux', champs: { id, agence_id: agenceId, location_id: locationId, type, created_by: auteur } });
  return id;
}

export async function ajouterPhoto(edlId: string, agenceId: string, position: string, uri: string) {
  const chemin = `${agenceId}/edl/${edlId}/${position}-${Date.now()}.jpg`;
  await mettreEnFile({ genre: 'fichier', chemin, uri, type: 'image/jpeg',
    ensuite: { genre: 'ajout', table: 'photos_edl', champs: { agence_id: agenceId, edl_id: edlId, position, path: chemin } } });
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
}
