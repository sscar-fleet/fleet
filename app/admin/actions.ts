'use server';
import { revalidatePath } from 'next/cache';
import { supabaseServeur } from '@/lib/supabase';

// Actions réservées à SS CAR FLEET : la base refuse tout autre compte (fonction admin_maj_agence)
export async function majAgence(agence: string, statut: string, jours: number | null, _fd?: FormData): Promise<{ erreur?: string } | void> {
  const supabase = supabaseServeur();
  const fin = jours ? new Date(Date.now() + jours * 864e5).toISOString().slice(0, 10) : null;
  const { error } = await supabase.rpc('admin_maj_agence', { p_agence: agence, p_statut: statut, p_fin_essai: fin, p_note: null });
  if (error) return { erreur: error.message };
  revalidatePath('/admin');
}

export async function noteAgence(agence: string, statut: string, fd: FormData): Promise<{ erreur?: string } | void> {
  const supabase = supabaseServeur();
  const { error } = await supabase.rpc('admin_maj_agence', { p_agence: agence, p_statut: statut, p_fin_essai: null, p_note: String(fd.get('note') ?? '').slice(0, 500) });
  if (error) return { erreur: error.message };
  revalidatePath('/admin');
}

// Client SS CAR SYSTEM reconnu : ses véhicules équipés sont créés dans l'agence et reliés à leurs boîtiers
export async function rattacherSscs(agence: string, clientId: string, _fd?: FormData): Promise<{ erreur?: string } | void> {
  const supabase = supabaseServeur();
  const { data: admin } = await supabase.rpc('est_admin');
  if (!admin) return { erreur: 'Réservé à SS CAR FLEET.' };
  const { clientSscs, rattacherEquipements } = await import('@/lib/annuaireSscs');
  const trouve = await clientSscs(clientId);
  if (!trouve || !trouve.vehicules.length) return { erreur: 'Aucun véhicule équipé pour ce client SS CAR SYSTEM.' };
  const r = await rattacherEquipements(agence, trouve.client, trouve.vehicules, null);
  revalidatePath('/admin');
  if (r.erreur) return { erreur: r.erreur };
}
