'use server';
import { revalidatePath } from 'next/cache';
import { supabaseServeur } from '@/lib/supabase';
import { antaiConfigure } from '@/lib/antai';

// Lance une étape du cahier de tests ANTAI (sandbox). Réservé à SS CAR FLEET.
export async function lancerEtapeAntai(i: number, _fd?: FormData): Promise<{ erreur?: string; message?: string } | void> {
  const { data: admin } = await supabaseServeur().rpc('est_admin');
  if (!admin) return { erreur: 'Réservé à SS CAR FLEET.' };
  if (!antaiConfigure('sandbox')) return { erreur: 'Identifiants ANTAI sandbox absents dans Vercel (ANTAI_SANDBOX_USER et ANTAI_SANDBOX_PASSWORD).' };
  const { lancerEtape } = await import('@/lib/antaiTests');
  const r = await lancerEtape(i);
  revalidatePath('/admin/antai');
  if (r.erreur) return { erreur: `${r.ok} réussis, ${r.ko} en échec. ${r.erreur}` };
  return { message: `Étape terminée : ${r.ok} conformes, ${r.ko} non conformes.` };
}

async function verifierAdmin() {
  const { data: admin } = await supabaseServeur().rpc('est_admin');
  return !!admin;
}

// Ouvre ou ferme la désignation ANTAI pour une agence
export async function activerAntai(agenceId: string, actif: boolean, _fd?: FormData): Promise<{ erreur?: string; message?: string } | void> {
  if (!(await verifierAdmin())) return { erreur: 'Réservé à SS CAR FLEET.' };
  const { supabaseAdmin } = await import('@/lib/supabaseAdmin');
  const { error } = await supabaseAdmin().from('agences').update({ antai_actif: actif, antai_active_le: actif ? new Date().toISOString() : null }).eq('id', agenceId);
  revalidatePath('/admin/antai');
  if (error) return { erreur: error.message };
  return { message: actif ? 'Désignation ANTAI activée pour cette agence.' : 'Désignation ANTAI coupée pour cette agence.' };
}

// Lancement à la main de ce que la tournée automatique fait à 8 h et 14 h
export async function tourneeAntai(quoi: 'flotte' | 'infractions' | 'statuts', _fd?: FormData): Promise<{ erreur?: string; message?: string } | void> {
  if (!(await verifierAdmin())) return { erreur: 'Réservé à SS CAR FLEET.' };
  if (!antaiConfigure()) return { erreur: 'Identifiants ANTAI absents dans Vercel.' };
  const m = await import('@/lib/antaiAmendes');
  try {
    if (quoi === 'flotte') { const r = await m.synchroniserFlotte(); return { message: r.message ?? `${r.declares} déclarés, ${r.sortis} sortis, ${r.erreurs} en erreur.` }; }
    if (quoi === 'infractions') { const r = await m.recupererInfractions(); return { message: `${r.nouvelles} nouvelles amendes, ${r.sansConducteur} sans conducteur trouvé${r.sansVehicule.length ? `, ${r.sansVehicule.length} sans véhicule dans Fleet (${r.sansVehicule.slice(0, 5).join(', ')})` : ''}.` }; }
    const r = await m.suivreStatuts(); return { message: `${r.acquittees} acceptées, ${r.refusees} refusées, ${r.expirees} expirées.` };
  } catch (e: any) { return { erreur: e?.message ?? String(e) }; }
  finally { revalidatePath('/admin/antai'); }
}
