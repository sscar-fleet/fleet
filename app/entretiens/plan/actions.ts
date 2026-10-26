'use server';
// Plans d'entretien au kilomètre : ajout, modification, « Fait aujourd'hui » (qui crée aussi la ligne de maintenance avec son coût)
import { revalidatePath } from 'next/cache';
import { utilisateurCourant, verifier } from '@/lib/agence';
import { texte, nombre } from '@/lib/format';
import { TYPES_PLAN, libellePlan } from '@/lib/entretienKm';

type Resultat = { erreur?: string; message?: string } | void;
function proteger<A extends any[]>(fn: (...a: A) => Promise<string | void>) {
  return async (...a: A): Promise<Resultat> => {
    try { const m = await fn(...a); revalidatePath('/', 'layout'); return m ? { message: m } : undefined; }
    catch (e: any) { if (typeof e?.digest === 'string' && e.digest.startsWith('NEXT_')) throw e; return { erreur: e?.message || 'Une erreur est survenue.' }; }
  };
}
const entier = (v: FormDataEntryValue | null) => { const n = nombre(v); return n == null ? null : Math.round(n); };
const jour = (v: FormDataEntryValue | null) => { const s = texte(v); return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };

export const ajouterPlan = proteger(async (fd: FormData) => {
  const { supabase, profil } = await utilisateurCourant();
  const type = texte(fd.get('type')) ?? 'vidange';
  const modele = TYPES_PLAN[type] ?? TYPES_PLAN.autre;
  const tous = fd.get('tous') === 'oui';
  let ids = fd.getAll('vehicule_id').map(String).filter(Boolean);
  if (tous) { const { data } = await supabase.from('vehicules').select('id, km').neq('statut', 'sorti'); ids = (data ?? []).map((v: any) => v.id); }
  if (!ids.length) throw new Error('Choisissez au moins un camion.');
  const { data: vehs } = await supabase.from('vehicules').select('id, km').in('id', ids);
  const intervalle_km = entier(fd.get('intervalle_km')) ?? modele.km ?? null;
  const intervalle_mois = entier(fd.get('intervalle_mois')) ?? modele.mois ?? null;
  if (!intervalle_km && !intervalle_mois) throw new Error('Indiquez un nombre de km ou de mois.');
  const dernierKm = entier(fd.get('dernier_km'));
  const derniereDate = jour(fd.get('derniere_date'));
  const lignes = (vehs ?? []).map((v: any) => ({
    agence_id: profil.agence_id, vehicule_id: v.id, type, libelle: texte(fd.get('libelle')),
    intervalle_km, intervalle_mois,
    // Sans dernier passage connu, on part du compteur du jour : la première alerte arrive après un intervalle complet
    dernier_km: dernierKm ?? (intervalle_km ? v.km ?? null : null),
    derniere_date: derniereDate ?? (intervalle_mois ? new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }) : null),
  }));
  verifier((await supabase.from('entretien_plans').insert(lignes)).error);
  return lignes.length > 1 ? `${lignes.length} camions suivis` : 'Entretien suivi';
});

export const modifierPlan = proteger(async (id: string, fd: FormData) => {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('entretien_plans').update({
    libelle: texte(fd.get('libelle')), intervalle_km: entier(fd.get('intervalle_km')), intervalle_mois: entier(fd.get('intervalle_mois')),
    dernier_km: entier(fd.get('dernier_km')), derniere_date: jour(fd.get('derniere_date')),
  }).eq('id', id)).error);
  return 'Enregistré';
});

export const arreterPlan = proteger(async (id: string) => {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('entretien_plans').update({ actif: false }).eq('id', id)).error);
  return 'Ce suivi est arrêté';
});

// Fait : le compteur et la date repartent de là, et la maintenance est ajoutée à l'historique (avec le coût pour le coût par camion)
export const planFait = proteger(async (id: string, fd: FormData) => {
  const { supabase, profil } = await utilisateurCourant();
  const { data: p } = await supabase.from('entretien_plans').select('*, vehicules(km)').eq('id', id).single();
  if (!p) throw new Error('Entretien introuvable.');
  const km = entier(fd.get('km')) ?? p.vehicules?.km ?? null;
  const date = jour(fd.get('date')) ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const cout = nombre(fd.get('cout'));
  verifier((await supabase.from('entretien_plans').update({ dernier_km: km, derniere_date: date }).eq('id', id)).error);
  const quand = new Date(date + 'T12:00:00Z').toISOString();
  verifier((await supabase.from('entretiens').insert({
    agence_id: profil.agence_id, vehicule_id: p.vehicule_id, type: p.type === 'controle_technique' ? 'controle' : 'entretien',
    raison: libellePlan(p), garage: texte(fd.get('garage')), km, cout, debut: quand, fin: quand, statut: 'termine',
  })).error);
  if (km != null) await supabase.from('vehicules').update({ km }).eq('id', p.vehicule_id).or(`km.is.null,km.lt.${km}`);
  return `${libellePlan(p)} noté${cout ? ' avec son coût' : ''}`;
});
