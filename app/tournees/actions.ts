'use server';
// Actions de la version transport : métier, règles, dépôts, donneurs d'ordre, chauffeurs, tournées et planning.
// Les règles d'accès de la base (RLS) limitent tout à l'entreprise de l'utilisateur.
import { revalidatePath } from 'next/cache';
import { utilisateurCourant, verifier } from '@/lib/agence';
import { texte, nombre, tel } from '@/lib/format';
import { reglesDe } from '@/lib/planning';
import { creerFixes, remplirSemaine, lundiValide, semaineDe } from '@/lib/transport';
import { lirePlanning, type TourneeLue } from '@/lib/lecturePlanning';
import { quotaIa } from '@/lib/api';

type Resultat = { erreur?: string; message?: string } | void;
function proteger<A extends any[]>(fn: (...a: A) => Promise<string | void>) {
  return async (...a: A): Promise<Resultat> => {
    try { const m = await fn(...a); revalidatePath('/', 'layout'); return m ? { message: m } : undefined; }
    catch (e: any) {
      if (typeof e?.digest === 'string' && e.digest.startsWith('NEXT_')) throw e;
      return { erreur: e?.message || 'Une erreur est survenue.' };
    }
  };
}
async function gerant() {
  const c = await utilisateurCourant();
  if (c.profil.role !== 'gerant') throw new Error('Réservé au gérant.');
  return c;
}
const heure = (v: FormDataEntryValue | null) => { const s = texte(v); if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null; const [h, m] = s.split(':').map(Number); return h < 24 && m < 60 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : null; };
const id = (v: FormDataEntryValue | null) => { const s = texte(v); return s && /^[0-9a-f-]{36}$/.test(s) ? s : null; };

// ——— Métier et règles
export const changerMetier = proteger(async (fd: FormData) => {
  const { supabase, profil } = await gerant();
  const metier = texte(fd.get('metier'));
  if (metier !== 'location' && metier !== 'transport') throw new Error('Métier inconnu.');
  verifier((await supabase.from('agences').update({ metier }).eq('id', profil.agence_id)).error);
  return metier === 'transport' ? 'Version transport activée' : 'Version location activée';
});

export const enregistrerRegles = proteger(async (fd: FormData) => {
  const { supabase, profil } = await gerant();
  const regles = reglesDe({
    joursReposMin: Number(fd.get('joursReposMin')), joursConsecutifsMax: Number(fd.get('joursConsecutifsMax')),
    creneauxMaxJour: Number(fd.get('creneauxMaxJour')), pauseMinutes: Number(fd.get('pauseMinutes')),
    memeDepot: fd.get('memeDepot') === 'on', partageCamion: fd.get('partageCamion') === 'on',
    partageMemeVille: fd.get('partageMemeVille') === 'on', regrouperCreneaux: fd.get('regrouperCreneaux') === 'on',
    prisePosteMinutes: Number(fd.get('prisePosteMinutes')),
  });
  verifier((await supabase.from('agences').update({ regles_transport: regles }).eq('id', profil.agence_id)).error);
  return 'Règles enregistrées';
});

// ——— Dépôts
export const ajouterDepot = proteger(async (fd: FormData) => {
  const { supabase, profil } = await utilisateurCourant();
  const nom = texte(fd.get('nom')); if (!nom) throw new Error('Indiquez le nom du dépôt.');
  verifier((await supabase.from('depots').insert({ agence_id: profil.agence_id, nom, adresse: texte(fd.get('adresse')) })).error);
  return 'Dépôt ajouté';
});
export const modifierDepot = proteger(async (depotId: string, fd: FormData) => {
  const { supabase } = await utilisateurCourant();
  const nom = texte(fd.get('nom')); if (!nom) throw new Error('Indiquez le nom du dépôt.');
  verifier((await supabase.from('depots').update({ nom, adresse: texte(fd.get('adresse')) }).eq('id', depotId)).error);
});
export const archiverDepot = proteger(async (depotId: string) => {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('depots').update({ actif: false }).eq('id', depotId)).error);
  return 'Dépôt retiré';
});

export const depotCamion = proteger(async (vehiculeId: string, fd: FormData) => {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('vehicules').update({ depot_id: id(fd.get('valeur')) }).eq('id', vehiculeId)).error);
});

// ——— Donneurs d'ordre et tarifs
export const ajouterDonneur = proteger(async (fd: FormData) => {
  const { supabase, profil } = await utilisateurCourant();
  const nom = texte(fd.get('nom')); if (!nom) throw new Error('Indiquez le nom du donneur d’ordre.');
  verifier((await supabase.from('donneurs_ordre').insert({ agence_id: profil.agence_id, nom, tarif_tournee: nombre(fd.get('tarif_tournee')), couleur: texte(fd.get('couleur')) })).error);
  return 'Donneur d’ordre ajouté';
});
export const modifierDonneur = proteger(async (donneurId: string, fd: FormData) => {
  const { supabase } = await utilisateurCourant();
  const nom = texte(fd.get('nom')); if (!nom) throw new Error('Indiquez le nom.');
  verifier((await supabase.from('donneurs_ordre').update({ nom, tarif_tournee: nombre(fd.get('tarif_tournee')), couleur: texte(fd.get('couleur')) }).eq('id', donneurId)).error);
});
export const archiverDonneur = proteger(async (donneurId: string) => {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('donneurs_ordre').update({ actif: false }).eq('id', donneurId)).error);
  return 'Donneur d’ordre retiré';
});
export const tarifDepot = proteger(async (fd: FormData) => {
  const { supabase, profil } = await utilisateurCourant();
  const donneur_id = id(fd.get('donneur_id')), depot_id = id(fd.get('depot_id')), tarif = nombre(fd.get('tarif'));
  if (!donneur_id || !depot_id) throw new Error('Choisissez le donneur d’ordre et le dépôt.');
  if (tarif == null) { verifier((await supabase.from('tarifs_tournee').delete().eq('donneur_id', donneur_id).eq('depot_id', depot_id)).error); return 'Tarif du dépôt retiré'; }
  verifier((await supabase.from('tarifs_tournee').upsert({ agence_id: profil.agence_id, donneur_id, depot_id, tarif })).error);
  return 'Tarif enregistré';
});

// ——— Chauffeurs
function champsChauffeur(fd: FormData) {
  const nomComplet = texte(fd.get('nom')) ?? '';
  const prenom = texte(fd.get('prenom'));
  const base = { prenom, nom: nomComplet, telephone: texte(fd.get('telephone')) ? tel(texte(fd.get('telephone'))) : null, ville: texte(fd.get('ville')), depot_id: id(fd.get('depot_id')), note: texte(fd.get('note')), permis_valide_le: texte(fd.get('permis_valide_le')) };
  // Identité pour la désignation des amendes : seulement si le formulaire la contient (fiche complète)
  if (!fd.has('numero_permis')) return base;
  return { ...base, date_naissance: texte(fd.get('date_naissance')), lieu_naissance: texte(fd.get('lieu_naissance')), adresse: texte(fd.get('adresse')), numero_permis: texte(fd.get('numero_permis')), date_permis: texte(fd.get('date_permis')) };
}
export const ajouterChauffeur = proteger(async (fd: FormData) => {
  const { supabase, profil } = await utilisateurCourant();
  const c = champsChauffeur(fd); if (!c.nom) throw new Error('Indiquez au moins le nom du chauffeur.');
  verifier((await supabase.from('chauffeurs').insert({ agence_id: profil.agence_id, ...c })).error);
  return 'Chauffeur ajouté';
});
export const modifierChauffeur = proteger(async (chauffeurId: string, fd: FormData) => {
  const { supabase } = await utilisateurCourant();
  const c = champsChauffeur(fd); if (!c.nom) throw new Error('Indiquez au moins le nom du chauffeur.');
  verifier((await supabase.from('chauffeurs').update(c).eq('id', chauffeurId)).error);
});
export const archiverChauffeur = proteger(async (chauffeurId: string) => {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('chauffeurs').update({ actif: false }).eq('id', chauffeurId)).error);
  // Il sort des tournées à venir non faites
  const aujourdhui = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  await supabase.from('tournees').update({ chauffeur_id: null, verrouillee: false }).eq('chauffeur_id', chauffeurId).gte('jour', aujourdhui).eq('statut', 'prevue');
  return 'Chauffeur retiré des plannings à venir';
});
// Ajout en une fois : une ligne par chauffeur « Prénom Nom ; téléphone ; ville ; dépôt » (séparateurs ; , tabulation)
export const importerChauffeurs = proteger(async (fd: FormData) => {
  const { supabase, profil } = await utilisateurCourant();
  const lignes = String(fd.get('liste') ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lignes.length) throw new Error('Collez au moins une ligne.');
  const { data: depots } = await supabase.from('depots').select('id, nom').eq('actif', true);
  const depotDe = (n: string) => (depots ?? []).find((d: any) => d.nom.toLowerCase().trim() === n.toLowerCase().trim())?.id ?? null;
  const parDefaut = id(fd.get('depot_id'));
  const aCreer = lignes.map((l) => {
    const p = l.split(/\t|;|,(?=\s*[^\d\s])/).map((x) => x.trim());
    const [nomComplet = '', ...reste] = p;
    const telephone = reste.find((x) => /^[+\d][\d\s.]{7,}$/.test(x)) ?? null;
    const autres = reste.filter((x) => x !== telephone);
    const depot = autres.map(depotDe).find(Boolean) ?? parDefaut;
    const ville = autres.find((x) => !depotDe(x)) ?? null;
    const mots = nomComplet.split(/\s+/);
    return { agence_id: profil.agence_id, prenom: mots.length > 1 ? mots[0] : null, nom: mots.length > 1 ? mots.slice(1).join(' ') : nomComplet, telephone: telephone ? tel(telephone) : null, ville, depot_id: depot };
  }).filter((c) => c.nom);
  verifier((await supabase.from('chauffeurs').insert(aCreer)).error);
  return `${aCreer.length} chauffeur${aCreer.length > 1 ? 's' : ''} ajouté${aCreer.length > 1 ? 's' : ''}`;
});
export const ajouterIndispo = proteger(async (fd: FormData) => {
  const { supabase, profil } = await utilisateurCourant();
  const chauffeur_id = id(fd.get('chauffeur_id')); const du = texte(fd.get('du')); const au = texte(fd.get('au')) ?? du;
  if (!chauffeur_id || !du || !au) throw new Error('Choisissez le chauffeur et les dates.');
  if (au < du) throw new Error('La date de fin est avant la date de début.');
  verifier((await supabase.from('indispos_chauffeurs').insert({ agence_id: profil.agence_id, chauffeur_id, du, au, motif: texte(fd.get('motif')) })).error);
  // Ses tournées non verrouillées sur la période sont libérées (à replanifier)
  await supabase.from('tournees').update({ chauffeur_id: null }).eq('chauffeur_id', chauffeur_id).gte('jour', du).lte('jour', au).eq('statut', 'prevue').eq('verrouillee', false);
  return 'Absence enregistrée';
});
export const supprimerIndispo = proteger(async (indispoId: string) => {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('indispos_chauffeurs').delete().eq('id', indispoId)).error);
  return 'Absence retirée';
});

// ——— Tournées
export const ajouterTournees = proteger(async (fd: FormData) => {
  const { supabase, profil } = await utilisateurCourant();
  const debut = heure(fd.get('debut')), fin = heure(fd.get('fin'));
  if (!debut || !fin) throw new Error('Indiquez l’heure de début et de fin (ex. 07:00).');
  const jours = fd.getAll('jours').map(String).filter((j) => /^\d{4}-\d{2}-\d{2}$/.test(j));
  if (!jours.length) throw new Error('Cochez au moins un jour.');
  const nombreParJour = Math.min(50, Math.max(1, Number(fd.get('nombre')) || 1));
  const base = { agence_id: profil.agence_id, debut, fin, donneur_id: id(fd.get('donneur_id')), depot_id: id(fd.get('depot_id')), libelle: texte(fd.get('libelle')), tarif: nombre(fd.get('tarif')) };
  const lignes = jours.flatMap((jour) => Array.from({ length: nombreParJour }, () => ({ ...base, jour })));
  verifier((await supabase.from('tournees').insert(lignes)).error);
  return `${lignes.length} tournée${lignes.length > 1 ? 's' : ''} ajoutée${lignes.length > 1 ? 's' : ''}`;
});
export const ajouterTourneeFixe = proteger(async (fd: FormData) => {
  const { supabase, profil } = await utilisateurCourant();
  const debut = heure(fd.get('debut')), fin = heure(fd.get('fin'));
  if (!debut || !fin) throw new Error('Indiquez l’heure de début et de fin (ex. 07:00).');
  const jours = fd.getAll('jours').map(Number).filter((n) => n >= 1 && n <= 7);
  if (!jours.length) throw new Error('Cochez au moins un jour de la semaine.');
  verifier((await supabase.from('tournees_fixes').insert({ agence_id: profil.agence_id, debut, fin, jours, nombre: Math.max(1, Number(fd.get('nombre')) || 1),
    donneur_id: id(fd.get('donneur_id')), depot_id: id(fd.get('depot_id')), libelle: texte(fd.get('libelle')), tarif: nombre(fd.get('tarif')) })).error);
  return 'Tournée fixe ajoutée : elle sera créée chaque semaine';
});
export const archiverTourneeFixe = proteger(async (fixeId: string) => {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('tournees_fixes').update({ actif: false }).eq('id', fixeId)).error);
  return 'Tournée fixe arrêtée';
});
export const creerFixesSemaine = proteger(async (lundiBrut: string) => {
  const { supabase, profil } = await utilisateurCourant();
  const lundi = lundiValide(lundiBrut); if (!lundi) throw new Error('Semaine invalide.');
  const n = await creerFixes(supabase, profil.agence_id, lundi);
  return n ? `${n} tournée${n > 1 ? 's' : ''} fixe${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''}` : 'Les tournées fixes de la semaine sont déjà là';
});
export const remplir = proteger(async (lundiBrut: string, depotId: string | null) => {
  const { supabase, profil } = await utilisateurCourant();
  const lundi = lundiValide(lundiBrut); if (!lundi) throw new Error('Semaine invalide.');
  await creerFixes(supabase, profil.agence_id, lundi);
  const r = await remplirSemaine(supabase, lundi, profil.agences?.regles_transport, depotId);
  if (!r.total) return 'Aucune tournée à planifier cette semaine';
  return r.manques ? `Planning rempli : ${r.manques} tournée${r.manques > 1 ? 's' : ''} sans chauffeur ou sans camion (en rouge)` : `Planning rempli : ${r.placees} tournées affectées`;
});
// Choix à la main d'un chauffeur ou d'un camion : la tournée est verrouillée (le remplissage automatique n'y touche plus)
export const affecter = proteger(async (tourneeId: string, champ: 'chauffeur_id' | 'vehicule_id', valeur: string | null) => {
  const { supabase } = await utilisateurCourant();
  if (champ !== 'chauffeur_id' && champ !== 'vehicule_id') throw new Error('Champ non autorisé');
  const v = valeur && /^[0-9a-f-]{36}$/.test(valeur) ? valeur : null;
  verifier((await supabase.from('tournees').update({ [champ]: v, verrouillee: true }).eq('id', tourneeId)).error);
});
export const deverrouiller = proteger(async (tourneeId: string) => {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('tournees').update({ verrouillee: false }).eq('id', tourneeId)).error);
});
export const supprimerTournee = proteger(async (tourneeId: string) => {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('tournees').delete().eq('id', tourneeId)).error);
  return 'Tournée supprimée';
});
export const viderAffectations = proteger(async (lundiBrut: string) => {
  const { supabase } = await utilisateurCourant();
  const lundi = lundiValide(lundiBrut); if (!lundi) throw new Error('Semaine invalide.');
  const j = semaineDe(lundi);
  const aujourdhui = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  verifier((await supabase.from('tournees').update({ chauffeur_id: null, vehicule_id: null, verrouillee: false }).gte('jour', j[0] > aujourdhui ? j[0] : aujourdhui).lte('jour', j[6]).eq('statut', 'prevue')).error);
  return 'Affectations effacées (tournées à venir)';
});
export const finTournee = proteger(async (tourneeId: string, fd: FormData) => {
  const { supabase } = await utilisateurCourant();
  const livres = nombre(fd.get('livres')), absents = nombre(fd.get('absents'));
  verifier((await supabase.from('tournees').update({ statut: 'faite', livres, absents, fin_le: new Date().toISOString(), note: texte(fd.get('note')) }).eq('id', tourneeId)).error);
  return 'Tournée terminée';
});

// Planning d'un donneur d'ordre collé ou en capture : lecture par l'IA, puis création après validation
export async function lirePlanningSemaine(lundiBrut: string, texteColle: string, image: string | null): Promise<{ tournees?: TourneeLue[]; erreur?: string }> {
  try {
    const { supabase } = await utilisateurCourant();
    const lundi = lundiValide(lundiBrut); if (!lundi) return { erreur: 'Semaine invalide.' };
    const limite = await quotaIa(supabase); if (limite) return { erreur: limite };
    const [{ data: donneurs }, { data: depots }] = await Promise.all([
      supabase.from('donneurs_ordre').select('nom').eq('actif', true), supabase.from('depots').select('nom').eq('actif', true),
    ]);
    return await lirePlanning({ texte: texteColle, image }, lundi, (donneurs ?? []).map((d: any) => d.nom), (depots ?? []).map((d: any) => d.nom));
  } catch (e: any) { return { erreur: e?.message || 'Lecture impossible.' }; }
}
export const creerTourneesLues = proteger(async (lundiBrut: string, lues: TourneeLue[]) => {
  const { supabase, profil } = await utilisateurCourant();
  const lundi = lundiValide(lundiBrut); if (!lundi) throw new Error('Semaine invalide.');
  const jours = semaineDe(lundi);
  const [{ data: donneurs }, { data: depots }] = await Promise.all([supabase.from('donneurs_ordre').select('id, nom'), supabase.from('depots').select('id, nom')]);
  const idDe = (l: any[] | null, n: string | null) => (n ? (l ?? []).find((x: any) => x.nom === n)?.id ?? null : null);
  const lignes = (Array.isArray(lues) ? lues : []).filter((x) => jours.includes(x.jour) && /^\d{2}:\d{2}$/.test(x.debut) && /^\d{2}:\d{2}$/.test(x.fin))
    .flatMap((x) => Array.from({ length: Math.min(50, Math.max(1, Number(x.nombre) || 1)) }, () => ({
      agence_id: profil.agence_id, jour: x.jour, debut: x.debut, fin: x.fin, donneur_id: idDe(donneurs, x.donneur), depot_id: idDe(depots, x.depot) })));
  if (!lignes.length) throw new Error('Rien à créer.');
  verifier((await supabase.from('tournees').insert(lignes)).error);
  return `${lignes.length} tournée${lignes.length > 1 ? 's' : ''} ajoutée${lignes.length > 1 ? 's' : ''}`;
});

// Accès à l'appli pour un chauffeur : il reçoit un lien, crée son mot de passe, et ne voit que ses tournées
export const inviterChauffeur = proteger(async (chauffeurId: string, fd: FormData) => {
  const { supabase, profil } = await gerant();
  const email = (texte(fd.get('email')) ?? '').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Indiquez l’adresse e-mail du chauffeur.');
  const { data: c } = await supabase.from('chauffeurs').select('id, prenom, nom').eq('id', chauffeurId).maybeSingle();
  if (!c) throw new Error('Chauffeur introuvable.');
  const nom = [c.prenom, c.nom].filter(Boolean).join(' ');
  await supabase.from('invitations').delete().eq('chauffeur_id', chauffeurId).eq('utilisee', false);
  verifier((await supabase.from('invitations').insert({ agence_id: profil.agence_id, email, nom, role: 'employe', acces: 'chauffeur', chauffeur_id: chauffeurId })).error, 'Invitation');
  return 'Invitation créée : envoyez-lui le lien';
});

// Exemple pour découvrir (ou faire une démonstration) : dépôts, donneurs d'ordre, chauffeurs et tournées fictifs,
// puis planning rempli. Tout est marqué « exemple » et s'efface en un clic.
const EXEMPLE = 'Exemple Fleet';
export const chargerExemple = proteger(async (lundiBrut: string) => {
  const { supabase, profil } = await gerant();
  const lundi = lundiValide(lundiBrut); if (!lundi) throw new Error('Semaine invalide.');
  const A = profil.agence_id;
  const { data: deps, error: e1 } = await supabase.from('depots').insert([{ agence_id: A, nom: 'Wissous (exemple)', adresse: EXEMPLE }, { agence_id: A, nom: 'Bonneuil (exemple)', adresse: EXEMPLE }]).select('id, nom');
  verifier(e1);
  const [wissous, bonneuil] = [deps![0].id, deps![1].id];
  const { data: dons, error: e2 } = await supabase.from('donneurs_ordre').insert([
    { agence_id: A, nom: 'Amazon (exemple)', tarif_tournee: 160, couleur: '#f59e0b' },
    { agence_id: A, nom: 'Rexel (exemple)', tarif_tournee: 210, couleur: '#3b82f6' },
    { agence_id: A, nom: 'UPS (exemple)', tarif_tournee: 150, couleur: '#a855f7' },
  ]).select('id, nom');
  verifier(e2);
  const [amazon, rexel, ups] = [dons![0].id, dons![1].id, dons![2].id];
  const noms: [string, string, string, string][] = [['Karim', 'Benali', 'Brétigny', wissous], ['Yanis', 'Laurent', 'Brétigny', wissous], ['Sarah', 'Petit', 'Évry', wissous], ['Mehdi', 'Ouali', 'Évry', wissous],
    ['Lucas', 'Martin', 'Massy', wissous], ['Inès', 'Moreau', 'Massy', wissous], ['Amina', 'Diallo', 'Brétigny', wissous], ['Omar', 'Haddad', 'Évry', wissous],
    ['Paul', 'Girard', 'Créteil', bonneuil], ['Nadia', 'Belkacem', 'Créteil', bonneuil], ['Hugo', 'Fontaine', 'Créteil', bonneuil]];
  verifier((await supabase.from('chauffeurs').insert(noms.map(([prenom, nom, ville, depot_id]) => ({ agence_id: A, prenom, nom, ville, depot_id, note: EXEMPLE })))).error);
  verifier((await supabase.from('tournees_fixes').insert([{ agence_id: A, donneur_id: rexel, depot_id: bonneuil, libelle: EXEMPLE, debut: '07:00', fin: '15:00', jours: [1, 2, 3, 4, 5], nombre: 2 }])).error);
  const jours = semaineDe(lundi).slice(0, 6);
  const creneaux: [string, string, number, string][] = [['06:35', '10:30', 2, amazon], ['11:00', '13:30', 2, amazon], ['14:00', '17:00', 2, amazon], ['17:30', '20:30', 1, amazon], ['09:00', '16:00', 1, ups]];
  verifier((await supabase.from('tournees').insert(jours.flatMap((jour) => creneaux.flatMap(([debut, fin, n, donneur_id]) => Array.from({ length: n }, () => ({ agence_id: A, jour, debut, fin, donneur_id, depot_id: wissous, libelle: EXEMPLE })))))).error);
  await creerFixes(supabase, A, lundi);
  const r = await remplirSemaine(supabase, lundi, profil.agences?.regles_transport);
  return `Exemple chargé : ${r.total} tournées, ${noms.length} chauffeurs`;
});
export const effacerExemple = proteger(async () => {
  const { supabase } = await gerant();
  const { data: deps } = await supabase.from('depots').select('id').eq('adresse', EXEMPLE);
  const ids = (deps ?? []).map((d: any) => d.id);
  await supabase.from('tournees').delete().eq('libelle', EXEMPLE);
  await supabase.from('tournees_fixes').delete().eq('libelle', EXEMPLE);
  if (ids.length) await supabase.from('tournees').delete().in('depot_id', ids);
  await supabase.from('chauffeurs').delete().eq('note', EXEMPLE);
  await supabase.from('donneurs_ordre').delete().like('nom', '%(exemple)');
  if (ids.length) verifier((await supabase.from('depots').delete().in('id', ids)).error);
  return 'Exemple effacé';
});

// Amende : choisir à la main le chauffeur (quand le planning ne l'a pas trouvé)
export const chauffeurAmende = proteger(async (amendeId: string, fd: FormData) => {
  const { supabase } = await utilisateurCourant();
  const chauffeur_id = id(fd.get('chauffeur_id'));
  verifier((await supabase.from('amendes').update({ chauffeur_id, statut: chauffeur_id ? 'a_designer' : 'infos_manquantes' }).eq('id', amendeId)).error);
  return chauffeur_id ? 'Chauffeur associé' : 'Chauffeur retiré';
});
