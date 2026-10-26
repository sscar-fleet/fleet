// Rapport d'une journée (version transport) : par camion, qui l'a conduit, départ, fin, km, tournées, chiffre, anomalies
import { journeesTraccar } from './traccar';
import { tarifDe, nomChauffeur } from './transport';
import { plaque } from './format';

export type LigneRapport = { vehicule_id: string; plaque: string; modele: string; chauffeurs: string; tournees: number; faites: number;
  depart: string | null; fin: string | null; km: number | null; chiffre: number; anomalies: string[] };

export async function rapportJour(supabase: any, jour: string, agenceId?: string) {
  // agenceId : appel par la tournée serveur (clé complète) → chaque requête est limitée à l'entreprise
  const ag = (q: any) => (agenceId ? q.eq('agence_id', agenceId) : q);
  const [{ data: tournees }, { data: vehicules }, { data: chauffeurs }, { data: donneurs }, { data: tarifs }, journees] = await Promise.all([
    ag(supabase.from('tournees').select('*').eq('jour', jour).neq('statut', 'annulee')),
    ag(supabase.from('vehicules').select('id, immatriculation, marque, modele, traceurs(imei)').neq('statut', 'sorti').order('immatriculation')),
    ag(supabase.from('chauffeurs').select('id, prenom, nom')),
    ag(supabase.from('donneurs_ordre').select('*')),
    ag(supabase.from('tarifs_tournee').select('*')),
    journeesTraccar(jour).catch(() => new Map()),
  ]);
  const passe = jour < new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const lignes: LigneRapport[] = [];
  for (const v of vehicules ?? []) {
    const ts = (tournees ?? []).filter((t: any) => t.vehicule_id === v.id);
    const j = v.traceurs?.imei ? journees.get(String(v.traceurs.imei)) : undefined;
    if (!ts.length && !j) continue;
    const noms = Array.from(new Set(ts.map((t: any) => nomChauffeur((chauffeurs ?? []).find((c: any) => c.id === t.chauffeur_id))).filter(Boolean)));
    const anomalies: string[] = [];
    if (ts.length && v.traceurs?.imei && !j && passe) anomalies.push('Prévu mais n’a pas roulé');
    if (!ts.length && j && j.km > 3) anomalies.push('A roulé sans tournée prévue');
    if (!v.traceurs?.imei) anomalies.push('Pas de traceur');
    lignes.push({ vehicule_id: v.id, plaque: plaque(v.immatriculation), modele: [v.marque, v.modele].filter(Boolean).join(' '), chauffeurs: noms.join(', '),
      tournees: ts.length, faites: ts.filter((t: any) => t.statut === 'faite').length, depart: j?.depart ?? null, fin: j?.fin ?? null, km: j ? j.km : null,
      chiffre: ts.reduce((x: number, t: any) => x + (tarifDe(t, donneurs ?? [], tarifs ?? []) ?? 0), 0), anomalies });
  }
  // Kilométrage anormal : plus du double de la moyenne des camions qui ont roulé
  const kms = lignes.map((l) => l.km).filter((k): k is number => k != null && k > 0);
  const moyenne = kms.length ? kms.reduce((a, b) => a + b, 0) / kms.length : 0;
  lignes.forEach((l) => { if (moyenne && l.km != null && kms.length >= 3 && l.km > moyenne * 2) l.anomalies.push(`${l.km} km : plus du double de la moyenne`); });
  lignes.sort((a, b) => b.anomalies.length - a.anomalies.length || a.plaque.localeCompare(b.plaque));
  const sansCamion = (tournees ?? []).filter((t: any) => !t.vehicule_id).length;
  return { lignes, total: { tournees: (tournees ?? []).length, faites: (tournees ?? []).filter((t: any) => t.statut === 'faite').length,
    km: kms.reduce((a, b) => a + b, 0), chiffre: lignes.reduce((x, l) => x + l.chiffre, 0), anomalies: lignes.filter((l) => l.anomalies.length).length, sansCamion } };
}
export const heureParis = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) : '—');
