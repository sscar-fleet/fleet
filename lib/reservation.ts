// Changer la voiture d'une réservation (pas encore partie) : vérifie que la nouvelle voiture est libre et en état de rouler.
import { plaque } from './format';

export async function deplacerReservation(supabase: any, agenceId: string, auteur: string, locationId: string, vehiculeId: string) {
  const { data: l } = await supabase.from('locations').select('id, numero, vehicule_id, debut, fin_prevue, statut, vehicules(immatriculation)').eq('id', locationId).single();
  if (!l) throw new Error('Réservation introuvable.');
  if (l.statut !== 'reservee') throw new Error('Seule une réservation pas encore partie peut changer de voiture.');
  if (l.vehicule_id === vehiculeId) return { message: 'C’est déjà cette voiture.' };
  const { data: v } = await supabase.from('vehicules').select('id, immatriculation, marque, modele, statut, km').eq('id', vehiculeId).single();
  if (!v) throw new Error('Véhicule introuvable.');
  if (['maintenance', 'hors_service', 'sorti'].includes(v.statut)) throw new Error(`${plaque(v.immatriculation)} est ${v.statut === 'maintenance' ? 'en maintenance' : 'indisponible'}.`);
  const { data: conflit } = await supabase.from('locations').select('numero, clients(nom)').eq('vehicule_id', vehiculeId).in('statut', ['reservee', 'en_cours'])
    .lt('debut', l.fin_prevue).gt('fin_prevue', l.debut).neq('id', locationId).limit(1);
  if (conflit?.length) throw new Error(`${plaque(v.immatriculation)} est déjà prise sur ces dates (n° ${conflit[0].numero}${conflit[0].clients?.nom ? ', ' + conflit[0].clients.nom : ''}).`);
  const { error } = await supabase.from('locations').update({ vehicule_id: vehiculeId, km_depart: v.km ?? null }).eq('id', locationId);
  if (error) throw new Error(error.message);
  const avant = plaque(l.vehicules?.immatriculation ?? '');
  await supabase.from('historique').insert({ agence_id: agenceId, location_id: locationId, vehicule_id: vehiculeId, action: 'Changement de voiture', detail: `${avant} → ${plaque(v.immatriculation)}`, auteur });
  return { message: `Réservation n° ${l.numero} passée sur ${[v.marque, v.modele].filter(Boolean).join(' ')} ${plaque(v.immatriculation)}` };
}

// Voitures possibles pour une réservation : libres sur toute la période et en état de rouler
export async function voituresPossibles(supabase: any, locationId: string) {
  const { data: l } = await supabase.from('locations').select('id, vehicule_id, debut, fin_prevue').eq('id', locationId).single();
  if (!l) return [];
  const [{ data: vehicules }, { data: prises }] = await Promise.all([
    supabase.from('vehicules').select('id, immatriculation, marque, modele, annee, couleur, visuel, statut, prix_jour, km').neq('statut', 'sorti').order('immatriculation'),
    supabase.from('locations').select('vehicule_id, numero, debut, fin_prevue, clients(nom)').in('statut', ['reservee', 'en_cours']).lt('debut', l.fin_prevue).gt('fin_prevue', l.debut).neq('id', locationId),
  ]);
  return (vehicules ?? []).filter((v: any) => v.id !== l.vehicule_id).map((v: any) => {
    const p = (prises ?? []).find((x: any) => x.vehicule_id === v.id);
    const raison = ['maintenance', 'hors_service'].includes(v.statut) ? (v.statut === 'maintenance' ? 'En maintenance' : 'Hors service')
      : p ? `Prise : n° ${p.numero}${p.clients?.nom ? ' · ' + p.clients.nom : ''}` : null;
    return { ...v, libre: !raison, raison };
  }).sort((a: any, b: any) => Number(b.libre) - Number(a.libre));
}
