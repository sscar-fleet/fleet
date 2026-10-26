'use server';
// Sinistres : création, étapes, documents, suivi (notes, appels, relances), montants
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { utilisateurCourant, verifier } from '@/lib/agence';
import { texte, nombre, depuisParis } from '@/lib/format';
import { documentsDefaut, dansJours, RELANCE_JOURS, FINIS, STATUT_SINISTRE, TYPES_SINISTRE, type DocSinistre } from '@/lib/sinistres';

type Resultat = { erreur?: string; message?: string } | void;
function proteger<A extends any[]>(fn: (...a: A) => Promise<string | void>) {
  return async (...a: A): Promise<Resultat> => {
    try { const m = await fn(...a); revalidatePath('/', 'layout'); return m ? { message: m } : undefined; }
    catch (e: any) { if (typeof e?.digest === 'string' && e.digest.startsWith('NEXT_')) throw e; return { erreur: e?.message || 'Une erreur est survenue.' }; }
  };
}
const id = (v: FormDataEntryValue | null) => { const s = texte(v); return s && /^[0-9a-f-]{36}$/.test(s) ? s : null; };
async function noter(supabase: any, agence_id: string, sinistre_id: string, genre: string, texteNote: string | null, auteur: string, fichier_path: string | null = null) {
  await supabase.from('sinistre_suivi').insert({ agence_id, sinistre_id, genre, texte: texteNote, auteur, fichier_path });
}

export async function creerSinistre(fd: FormData): Promise<Resultat> {
  let nouveau: string | null = null;
  try {
    const { supabase, profil } = await utilisateurCourant();
    const type = texte(fd.get('type')) ?? 'accident';
    if (!TYPES_SINISTRE[type]) throw new Error('Type inconnu.');
    const quand = depuisParis(texte(fd.get('date_sinistre')));
    if (!quand) throw new Error('Indiquez la date et l’heure du sinistre.');
    const vehicule_id = id(fd.get('vehicule_id'));
    // Conducteur : chauffeur choisi, sinon celui de la tournée du camion à cette heure-là
    let chauffeur_id = id(fd.get('chauffeur_id'));
    if (!chauffeur_id && vehicule_id) {
      const j = new Date(quand).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
      const h = new Date(quand).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
      const { data: t } = await supabase.from('tournees').select('chauffeur_id').eq('vehicule_id', vehicule_id).eq('jour', j).lte('debut', h).gte('fin', h).not('chauffeur_id', 'is', null).limit(1);
      chauffeur_id = (t ?? [])[0]?.chauffeur_id ?? null;
    }
    const { data, error } = await supabase.from('sinistres').insert({
      agence_id: profil.agence_id, vehicule_id, chauffeur_id, type, date_sinistre: quand, lieu: texte(fd.get('lieu')), description: texte(fd.get('description')),
      tiers: texte(fd.get('tiers')), assureur: texte(fd.get('assureur')), documents: documentsDefaut(type), prochaine_relance: dansJours(1),
    }).select('id').single();
    verifier(error, 'Sinistre');
    nouveau = data!.id as string;
    await noter(supabase, profil.agence_id, nouveau, 'statut', 'Sinistre enregistré', profil.id);
  } catch (e: any) { return { erreur: e?.message || 'Une erreur est survenue.' }; }
  revalidatePath('/', 'layout');
  redirect(`/sinistres/${nouveau}`);
}

export const majSinistre = proteger(async (sinistreId: string, fd: FormData) => {
  const { supabase } = await utilisateurCourant();
  const champs: Record<string, unknown> = {
    lieu: texte(fd.get('lieu')), description: texte(fd.get('description')), tiers: texte(fd.get('tiers')), responsabilite: texte(fd.get('responsabilite')) ?? 'inconnue',
    assureur: texte(fd.get('assureur')), numero_dossier: texte(fd.get('numero_dossier')), expert: texte(fd.get('expert')),
    montant_estime: nombre(fd.get('montant_estime')), franchise: nombre(fd.get('franchise')), montant_rembourse: nombre(fd.get('montant_rembourse')),
    reste_a_charge: nombre(fd.get('reste_a_charge')), retenue_chauffeur: nombre(fd.get('retenue_chauffeur')),
    chauffeur_id: id(fd.get('chauffeur_id')), vehicule_id: id(fd.get('vehicule_id')), prochaine_relance: texte(fd.get('prochaine_relance')),
  };
  verifier((await supabase.from('sinistres').update(champs).eq('id', sinistreId)).error);
  return 'Dossier enregistré';
});

export const etapeSinistre = proteger(async (sinistreId: string, statut: string) => {
  const { supabase, profil } = await utilisateurCourant();
  if (!STATUT_SINISTRE[statut]) throw new Error('Étape inconnue.');
  const fini = FINIS.includes(statut);
  verifier((await supabase.from('sinistres').update({ statut, clos_le: fini ? new Date().toISOString() : null, prochaine_relance: fini ? null : dansJours(RELANCE_JOURS) }).eq('id', sinistreId)).error);
  await noter(supabase, profil.agence_id, sinistreId, 'statut', `Étape : ${STATUT_SINISTRE[statut]}`, profil.id);
  return `Étape : ${STATUT_SINISTRE[statut]}`;
});

// Suivi : chaque note, appel ou relance repousse la prochaine relance de 7 jours
export const suiviSinistre = proteger(async (sinistreId: string, fd: FormData) => {
  const { supabase, profil } = await utilisateurCourant();
  const genre = texte(fd.get('genre')) ?? 'note';
  if (!['note', 'appel', 'relance', 'courrier'].includes(genre)) throw new Error('Type de suivi inconnu.');
  const t = texte(fd.get('texte'));
  if (!t) throw new Error('Écrivez ce qui s’est passé.');
  await noter(supabase, profil.agence_id, sinistreId, genre, t, profil.id);
  await supabase.from('sinistres').update({ prochaine_relance: dansJours(RELANCE_JOURS) }).eq('id', sinistreId).not('statut', 'in', '(clos,refuse)');
  return 'Ajouté au suivi';
});
export const courrierSinistre = proteger(async (sinistreId: string, chemin: string) => {
  const { supabase, profil } = await utilisateurCourant();
  await noter(supabase, profil.agence_id, sinistreId, 'courrier', 'Document ajouté', profil.id, chemin);
  await supabase.from('sinistres').update({ prochaine_relance: dansJours(RELANCE_JOURS) }).eq('id', sinistreId).not('statut', 'in', '(clos,refuse)');
});

// Documents demandés : cocher, joindre le fichier, en ajouter un
async function documents(supabase: any, sinistreId: string): Promise<DocSinistre[]> {
  const { data } = await supabase.from('sinistres').select('documents').eq('id', sinistreId).single();
  return Array.isArray(data?.documents) ? data.documents : [];
}
export const cocherDocument = proteger(async (sinistreId: string, index: number) => {
  const { supabase } = await utilisateurCourant();
  const docs = await documents(supabase, sinistreId);
  if (!docs[index]) throw new Error('Document introuvable.');
  docs[index] = { ...docs[index], fait: !docs[index].fait };
  verifier((await supabase.from('sinistres').update({ documents: docs }).eq('id', sinistreId)).error);
});
export const joindreDocument = proteger(async (sinistreId: string, index: number, chemin: string) => {
  const { supabase } = await utilisateurCourant();
  const docs = await documents(supabase, sinistreId);
  if (!docs[index]) throw new Error('Document introuvable.');
  docs[index] = { ...docs[index], fait: true, chemin };
  verifier((await supabase.from('sinistres').update({ documents: docs }).eq('id', sinistreId)).error);
});
export const ajouterDocument = proteger(async (sinistreId: string, fd: FormData) => {
  const { supabase } = await utilisateurCourant();
  const nom = texte(fd.get('nom')); if (!nom) throw new Error('Nom du document ?');
  const docs = await documents(supabase, sinistreId);
  verifier((await supabase.from('sinistres').update({ documents: [...docs, { nom, fait: false }] }).eq('id', sinistreId)).error);
  return 'Document ajouté à la liste';
});
export const photoSinistre = proteger(async (sinistreId: string, chemin: string) => {
  const { supabase } = await utilisateurCourant();
  const { data } = await supabase.from('sinistres').select('photos').eq('id', sinistreId).single();
  verifier((await supabase.from('sinistres').update({ photos: [...(data?.photos ?? []), chemin] }).eq('id', sinistreId)).error);
});
