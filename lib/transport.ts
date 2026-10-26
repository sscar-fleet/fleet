// Version transport : outils serveur autour du planning (semaines, tournées fixes, remplissage automatique).
import { planifier, reglesDe, lundiDe, type Regles } from './planning';

export const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const ajouterJours = (j: string, n: number) => { const d = new Date(j + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const semaineDe = (lundi: string) => Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i));
export const jourSemaine = (j: string) => ((new Date(j + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1; // 1 = lundi
export { lundiDe };
export const lundiValide = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? lundiDe(v) : null);
export const heureCourte = (h?: string | null) => String(h ?? '').slice(0, 5);
export const nomChauffeur = (c?: { prenom?: string | null; nom?: string | null } | null) => (c ? [c.prenom, c.nom].filter(Boolean).join(' ') : '');

// Tarif d'une tournée : saisi sur la tournée, sinon tarif du dépôt pour ce donneur d'ordre, sinon tarif général du donneur d'ordre
export function tarifDe(t: { tarif?: number | null; donneur_id?: string | null; depot_id?: string | null }, donneurs: any[], tarifs: any[]) {
  if (t.tarif != null) return Number(t.tarif);
  const parDepot = tarifs.find((x) => x.donneur_id === t.donneur_id && x.depot_id === t.depot_id);
  if (parDepot) return Number(parDepot.tarif);
  const d = donneurs.find((x) => x.id === t.donneur_id);
  return d?.tarif_tournee != null ? Number(d.tarif_tournee) : null;
}

// Crée les tournées fixes manquantes de la semaine (sans doublon si on relance)
export async function creerFixes(supabase: any, agenceId: string, lundi: string) {
  const jours = semaineDe(lundi);
  const [{ data: fixes }, { data: existantes }] = await Promise.all([
    supabase.from('tournees_fixes').select('*').eq('actif', true),
    supabase.from('tournees').select('fixe_id, jour').not('fixe_id', 'is', null).gte('jour', jours[0]).lte('jour', jours[6]),
  ]);
  const deja = new Map<string, number>();
  (existantes ?? []).forEach((t: any) => { const k = t.fixe_id + '|' + t.jour; deja.set(k, (deja.get(k) ?? 0) + 1); });
  const lignes: any[] = [];
  for (const f of fixes ?? []) for (const j of jours) {
    if (!(f.jours ?? []).includes(jourSemaine(j))) continue;
    const manque = Number(f.nombre ?? 1) - (deja.get(f.id + '|' + j) ?? 0);
    for (let i = 0; i < manque; i++) lignes.push({ agence_id: agenceId, jour: j, debut: f.debut, fin: f.fin, donneur_id: f.donneur_id, depot_id: f.depot_id, libelle: f.libelle, tarif: f.tarif, fixe_id: f.id });
  }
  if (lignes.length) {
    const { error } = await supabase.from('tournees').insert(lignes);
    if (error) throw new Error('Tournées fixes : ' + error.message);
  }
  return lignes.length;
}

// Données utiles au planning d'une semaine (et au contrôle des règles)
export async function chargerSemaine(supabase: any, lundi: string) {
  const jours = semaineDe(lundi);
  const debutMois = jours[0].slice(0, 8) + '01';
  const [{ data: tournees }, { data: chauffeurs }, { data: indispos }, { data: vehicules }, { data: avant }, { data: mois }] = await Promise.all([
    supabase.from('tournees').select('*').gte('jour', jours[0]).lte('jour', jours[6]).neq('statut', 'annulee').order('jour').order('debut'),
    supabase.from('chauffeurs').select('*').eq('actif', true).order('prenom').order('nom'),
    supabase.from('indispos_chauffeurs').select('*').lte('du', jours[6]).gte('au', ajouterJours(jours[0], -7)),
    supabase.from('vehicules').select('id, immatriculation, marque, modele, statut, depot_id').neq('statut', 'sorti').order('immatriculation'),
    supabase.from('tournees').select('chauffeur_id, jour').gte('jour', ajouterJours(jours[0], -7)).lt('jour', jours[0]).not('chauffeur_id', 'is', null).neq('statut', 'annulee'),
    supabase.from('tournees').select('chauffeur_id').gte('jour', debutMois < jours[0] ? debutMois : jours[0]).lt('jour', jours[0]).not('chauffeur_id', 'is', null).neq('statut', 'annulee'),
  ]);
  const joursTravailles: Record<string, string[]> = {};
  (avant ?? []).forEach((t: any) => { (joursTravailles[t.chauffeur_id] ??= []).push(t.jour); });
  const tourneesMois: Record<string, number> = {};
  (mois ?? []).forEach((t: any) => { tourneesMois[t.chauffeur_id] = (tourneesMois[t.chauffeur_id] ?? 0) + 1; });
  const chauffeursP = (chauffeurs ?? []).map((c: any) => ({ ...c, indispos: (indispos ?? []).filter((i: any) => i.chauffeur_id === c.id).map((i: any) => ({ du: i.du, au: i.au })) }));
  return { jours, tournees: tournees ?? [], chauffeurs: chauffeursP, vehicules: vehicules ?? [], indispos: indispos ?? [], joursTravailles, tourneesMois };
}

// « Remplir la semaine » : affecte chauffeurs et camions aux tournées non verrouillées encore à faire
export async function remplirSemaine(supabase: any, lundi: string, reglesBrutes: unknown, depotId?: string | null) {
  const s = await chargerSemaine(supabase, lundi);
  const regles: Regles = reglesDe(reglesBrutes);
  const aujourdhui = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  // Les tournées passées, faites ou d'un autre dépôt (si filtre) ne bougent pas : elles comptent comme verrouillées
  const tournees = s.tournees.map((t: any) => ({
    id: t.id, jour: t.jour, debut: t.debut, fin: t.fin, depot_id: t.depot_id, chauffeur_id: t.chauffeur_id, vehicule_id: t.vehicule_id,
    verrouillee: t.verrouillee || t.statut !== 'prevue' || t.jour < aujourdhui || (!!depotId && t.depot_id !== depotId),
  }));
  const vehicules = s.vehicules.map((v: any) => ({ id: v.id, depot_id: v.depot_id, disponible: !['maintenance', 'hors_service'].includes(v.statut) }));
  const { affectations, manques } = planifier({ tournees, chauffeurs: s.chauffeurs, vehicules, regles, joursTravailles: s.joursTravailles, tourneesMois: s.tourneesMois });
  // Écriture : une mise à jour par tournée modifiée
  const avant = new Map(s.tournees.map((t: any) => [t.id, t]));
  const changees = affectations.filter((a) => { const t: any = avant.get(a.id); return t && (t.chauffeur_id !== a.chauffeur_id || t.vehicule_id !== a.vehicule_id); });
  for (let i = 0; i < changees.length; i += 25) {
    await Promise.all(changees.slice(i, i + 25).map((a) => supabase.from('tournees').update({ chauffeur_id: a.chauffeur_id, vehicule_id: a.vehicule_id }).eq('id', a.id)));
  }
  return { placees: affectations.filter((a) => a.chauffeur_id).length, total: affectations.length, manques: manques.length };
}
