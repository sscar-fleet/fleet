'use server';
import { revalidatePath } from 'next/cache';
import { utilisateurCourant } from '@/lib/agence';
import { antaiConfigure } from '@/lib/antai';

// Désignation du conducteur auprès de l'ANTAI, après validation du loueur (clic + confirmation)
export async function designerAntai(amendeId: string, _fd?: FormData): Promise<{ erreur?: string; message?: string } | void> {
  const { profil } = await utilisateurCourant();
  if (!antaiConfigure()) return { erreur: 'La liaison ANTAI n’est pas encore en service.' };
  const { envoyerDesignation } = await import('@/lib/antaiAmendes');
  const r = await envoyerDesignation(amendeId, profil.agence_id, profil.id, false);
  revalidatePath('/amendes');
  return r;
}

// Non-désignation : l'agence reste redevable de l'amende (et d'une éventuelle majoration)
export async function nonDesignerAntai(amendeId: string, _fd?: FormData): Promise<{ erreur?: string; message?: string } | void> {
  const { profil } = await utilisateurCourant();
  if (profil.role !== 'gerant') return { erreur: 'Seul le gérant peut choisir de ne pas désigner.' };
  if (!antaiConfigure()) return { erreur: 'La liaison ANTAI n’est pas encore en service.' };
  const { envoyerDesignation } = await import('@/lib/antaiAmendes');
  const r = await envoyerDesignation(amendeId, profil.agence_id, profil.id, true);
  revalidatePath('/amendes');
  return r;
}
