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
