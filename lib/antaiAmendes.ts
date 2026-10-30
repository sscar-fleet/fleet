// Amendes × ANTAI : déclaration de la flotte, récupération des infractions, désignation, suivi des réponses.
// Rien n'est désigné sans un clic du loueur. Fleet ne fait que préparer, envoyer ce qui a été validé, et suivre.
import { supabaseAdmin } from './supabaseAdmin';
import * as api from './antai';

const JOUR = 864e5;
export const DELAI_JOURS = 45;

// --- Préparation de la désignation (fonctions pures, testées hors ligne) -----------------------------------

export type Adresse = { numeroVoie?: string; voie: string; complement?: string; codePostal: string; ville: string; pays: string };

// « 12 bis rue Paul Bellamy, Appt 12, 44000 Nantes » → champs séparés exigés par l'ANTAI
export function decouperAdresse(texte?: string | null): Adresse | null {
  if (!texte) return null;
  const t = texte.replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.*?)[,\s]+(\d{5})\s+([^,]+?)(?:,\s*(france|fra))?\s*$/i);
  if (!m) return null;
  const [, rue, codePostal, ville] = m;
  const morceaux = rue.split(',').map((x) => x.trim()).filter(Boolean);
  const premiere = morceaux.shift() ?? '';
  const n = premiere.match(/^(\d+\s?(?:bis|ter|quater|[a-d])?)\s+(.+)$/i);
  const voie = (n ? n[2] : premiere).trim();
  if (!voie) return null;
  return {
    ...(n ? { numeroVoie: n[1].replace(/\s/g, '').toUpperCase().slice(0, 20) } : {}),
    voie: voie.toUpperCase().slice(0, 80),
    ...(morceaux.length ? { complement: morceaux.join(', ').slice(0, 255) } : {}),
    codePostal, ville: ville.trim().toUpperCase().slice(0, 40), pays: 'FRA',
  };
}

const EMAIL = /^[a-zA-Z0-9.!#$%&*+/=?^_\\{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
const jour = (d?: string | null) => (d ? String(d).slice(0, 10) : null);
const siretOk = (s?: string | null) => !!s && /^\d{14}$/.test(s.replace(/\s/g, ''));

// Construit le corps de la désignation et la liste de ce qui manque (en français, pour le loueur)
export function preparerDesignation(amende: { antai_id: number | null }, agence: any, client: any): { corps: any | null; manquants: string[] } {
  const manquants: string[] = [];
  if (!amende.antai_id) manquants.push('identifiant ANTAI de l’infraction');
  const adrAgence = decouperAdresse(agence?.adresse);
  if (!agence?.nom) manquants.push('nom de l’agence (Réglages)');
  if (!siretOk(agence?.siret)) manquants.push('SIRET de l’agence, 14 chiffres (Réglages)');
  if (!adrAgence) manquants.push('adresse complète de l’agence avec code postal (Réglages)');
  if (agence?.email && !EMAIL.test(agence.email)) manquants.push('e-mail de l’agence valide (Réglages)');
  if (!client) return { corps: null, manquants: [...manquants, 'conducteur'] };

  const societe = client.civilite === 'SOCIETE';
  const adr = decouperAdresse(client.adresse);
  if (!client.civilite) manquants.push('civilité du conducteur (M., Mme ou société)');
  if (!client.nom) manquants.push('nom du conducteur');
  if (!adr) manquants.push('adresse du conducteur avec code postal');
  if (client.email && !EMAIL.test(client.email)) manquants.push('e-mail du conducteur valide');
  if (societe) {
    if (!siretOk(client.siret)) manquants.push('SIRET de la société conductrice, 14 chiffres');
  } else {
    if (!client.prenom) manquants.push('prénom du conducteur');
    if (!client.date_naissance) manquants.push('date de naissance');
    if (!client.lieu_naissance) manquants.push('lieu de naissance');
    if (!client.numero_permis) manquants.push('numéro de permis');
    if (!client.date_permis) manquants.push('date de délivrance du permis');
    if (!client.permis_lieu) manquants.push('lieu de délivrance du permis');
    if (client.date_naissance && client.date_permis && client.date_permis <= client.date_naissance) manquants.push('date du permis incohérente (avant la naissance)');
  }
  if (manquants.length) return { corps: null, manquants };

  const corps: any = {
    identifiantDesignation: Number(amende.antai_id),
    statut: 'DESIGNATION',
    flotteClient: {
      nom: String(agence.nom).slice(0, 255), siret: agence.siret.replace(/\s/g, ''),
      ...(agence.email ? { courriel: agence.email } : {}), adresse: adrAgence,
    },
    detenteur: societe
      ? { civilite: 'SOCIETE', nom: String(client.nom).toUpperCase(), siret: client.siret.replace(/\s/g, ''), ...(client.email ? { courriel: client.email } : {}), adresse: adr }
      : {
          civilite: client.civilite, nom: String(client.nom).toUpperCase(), prenom: client.prenom, ...(client.email ? { courriel: client.email } : {}), adresse: adr,
          dateNaissance: jour(client.date_naissance), lieuNaissance: String(client.lieu_naissance).toUpperCase(),
        },
  };
  if (!societe) corps.permisDesigne = { numeroPermis: String(client.numero_permis).replace(/\s/g, ''), dateDelivrance: jour(client.date_permis), lieuDelivrance: String(client.permis_lieu).toUpperCase(), nationalite: (client.nationalite || 'FRA').toUpperCase() };
  return { corps, manquants: [] };
}

// Location en cours au moment de l'infraction (0, 1 ou 2 si changement de client le même jour)
export function locationsAuMoment(locations: any[], quand: string) {
  const t = new Date(quand).getTime();
  return locations.filter((l) => l.statut !== 'annulee' && new Date(l.debut).getTime() <= t && new Date(l.fin_reelle ?? l.fin_prevue).getTime() >= t);
}

// --- Opérations serveur ---------------------------------------------------------------------------------------

const admin = () => supabaseAdmin();
const plaque = api.plaque;

// F1 : déclaration des nouveaux véhicules et sortie de ceux qui quittent la flotte (envoi en masse, uniquement le delta)
export async function synchroniserFlotte(): Promise<{ declares: number; sortis: number; erreurs: number; message?: string }> {
  const db = admin();
  const { data: agences } = await db.from('agences').select('id').eq('antai_actif', true);
  const ids = (agences ?? []).map((a: any) => a.id);
  if (!ids.length) return { declares: 0, sortis: 0, erreurs: 0, message: 'Aucune agence avec la désignation ANTAI activée.' };
  const { data: vehicules } = await db.from('vehicules').select('id, agence_id, immatriculation, marque, modele, date_sortie, antai_statut, pret_par').in('agence_id', ids);
  const aujourdHui = new Date().toISOString().slice(0, 10);
  // Les véhicules prêtés par un confrère restent dans SA flotte ANTAI : on ne les déclare pas
  const aDeclarer = (vehicules ?? []).filter((v: any) => !v.pret_par && (!v.date_sortie || v.date_sortie > aujourdHui) && (!v.antai_statut || v.antai_statut === 'a_declarer'));
  const aSortir = (vehicules ?? []).filter((v: any) => v.antai_statut === 'declare' && v.date_sortie);
  let declares = 0, sortis = 0, erreurs = 0;

  for (let i = 0; i < aDeclarer.length; i += 1000) {
    const lot = aDeclarer.slice(i, i + 1000);
    const r = await api.creerVehicules(lot.map((v: any) => ({ immatriculation: v.immatriculation, marque: v.marque ?? undefined, modele: v.modele ?? undefined })));
    if (r.statut !== 200) { erreurs += lot.length; await db.from('vehicules').update({ antai_statut: 'erreur', antai_erreur: api.messageAntai(r), antai_le: new Date().toISOString() }).in('id', lot.map((v: any) => v.id)); continue; }
  }
  // La flotte lue à l'ANTAI fait foi : déclarés = présents, erreur = absents après envoi
  if (aDeclarer.length) {
    const presents = await flotteAntai();
    for (const v of aDeclarer) {
      const ok = presents.has(plaque(v.immatriculation));
      ok ? declares++ : erreurs++;
      await db.from('vehicules').update({ antai_statut: ok ? 'declare' : 'erreur', antai_erreur: ok ? null : 'Refusé par l’ANTAI (déjà déclaré par une autre société, ou immatriculation incorrecte).', antai_le: new Date().toISOString() }).eq('id', v.id);
    }
  }
  // Sortie : à la date prévue si elle est à venir, sinon aujourd'hui (jamais dans le passé)
  if (aSortir.length) {
    const r = await api.desactiverVehicules(aSortir.map((v: any) => ({ vehicule: { immatriculation: v.immatriculation }, ...(v.date_sortie > aujourdHui ? { date_fin_gestion: `${v.date_sortie}T00:00:00.000Z` } : {}) })));
    if (r.statut === 200) {
      sortis = aSortir.length;
      await db.from('vehicules').update({ antai_statut: 'sorti', antai_le: new Date().toISOString(), antai_erreur: null }).in('id', aSortir.filter((v: any) => v.date_sortie <= aujourdHui).map((v: any) => v.id));
    } else erreurs += aSortir.length;
  }
  return { declares, sortis, erreurs };
}

async function flotteAntai(): Promise<Set<string>> {
  const presents = new Set<string>();
  for (let page = 0; page < 50; page++) {
    const r = await api.lireFlotte(page, 1000);
    if (r.statut !== 200) break;
    const liste: any[] = r.corps?.vehicules ?? r.corps?.flotte ?? r.corps?.content ?? (Array.isArray(r.corps) ? r.corps : []);
    for (const x of liste) { const im = x?.vehicule?.immatriculation ?? x?.immatriculation; if (im) presents.add(plaque(im)); }
    const pages = Number(r.corps?.nombrePages ?? 1);
    if (page + 1 >= pages || !liste.length) break;
  }
  return presents;
}

// F2 + F3 : nouvelles infractions → amende dans la bonne agence, conducteur retrouvé par la location
export async function recupererInfractions(): Promise<{ nouvelles: number; sansVehicule: string[]; sansConducteur: number }> {
  const db = admin();
  const dossiers: ReturnType<typeof api.lireDossier>[] = [];
  for (let page = 0; page < 50; page++) {
    const r = await api.lireInfractions(page, 1000);
    if (r.statut !== 200) throw new api.ErreurAntai(`Lecture des infractions refusée : ${api.messageAntai(r)}`, r.statut);
    const liste = (r.corps?.infractions ?? []).map(api.lireDossier);
    dossiers.push(...liste);
    if (page + 1 >= Number(r.corps?.nombrePages ?? 1) || !liste.length) break;
  }
  const ids = dossiers.map((d) => d.identifiantDesignation).filter(Boolean) as number[];
  const { data: connues } = ids.length ? await db.from('amendes').select('antai_id').in('antai_id', ids) : { data: [] as any[] };
  const dejaLa = new Set((connues ?? []).map((a: any) => Number(a.antai_id)));
  const nouveaux = dossiers.filter((d) => d.identifiantDesignation && !dejaLa.has(Number(d.identifiantDesignation)));
  if (!nouveaux.length) return { nouvelles: 0, sansVehicule: [], sansConducteur: 0 };

  const { data: agences } = await db.from('agences').select('id').eq('antai_actif', true);
  const agencesActives = (agences ?? []).map((a: any) => a.id);
  const { data: vehicules } = agencesActives.length ? await db.from('vehicules').select('id, agence_id, immatriculation, antai_statut').in('agence_id', agencesActives) : { data: [] as any[] };
  const parPlaque = new Map<string, any[]>();
  for (const v of vehicules ?? []) { const k = plaque(v.immatriculation); parPlaque.set(k, [...(parPlaque.get(k) ?? []), v]); }

  let nouvelles = 0, sansConducteur = 0; const sansVehicule: string[] = [];
  for (const d of nouveaux) {
    const candidats = parPlaque.get(plaque(d.immatriculation ?? '')) ?? [];
    const v = candidats.find((x) => x.antai_statut === 'declare') ?? candidats[0];
    if (!v || !d.date) { sansVehicule.push(d.immatriculation ?? `dossier ${d.numeroDossier}`); continue; }
    const { data: locs } = await db.from('locations').select('id, client_id, debut, fin_prevue, fin_reelle, statut')
      .eq('vehicule_id', v.id).lte('debut', d.date).order('debut', { ascending: false }).limit(5);
    const enCours = locationsAuMoment(locs ?? [], d.date);
    const unique = enCours.length === 1 ? enCours[0] : null;
    if (!unique) sansConducteur++;
    const apparition = d.apparition ?? new Date().toISOString();
    const lieu = d.lieu ? [d.lieu.numeroVoie, d.lieu.voie, d.lieu.codePostal, d.lieu.ville].filter(Boolean).join(' ') : null;
    const { error } = await db.from('amendes').insert({
      agence_id: v.agence_id, vehicule_id: v.id, location_id: unique?.id ?? null, client_id: unique?.client_id ?? null,
      source: 'antai', antai_id: d.identifiantDesignation, numero_avis: d.numeroDossier, code_natinf: d.codeNatinf, type: d.libelle,
      date_infraction: d.date, lieu, apparition_le: apparition, antai_statut: 'non_traite',
      echeance: new Date(new Date(apparition).getTime() + DELAI_JOURS * JOUR).toISOString().slice(0, 10),
      statut: unique ? 'a_designer' : 'infos_manquantes',
      antai_message: enCours.length > 1 ? 'Deux locations à cette heure-là : choisissez le conducteur.' : null,
    });
    if (!error) nouvelles++;
  }
  return { nouvelles, sansVehicule, sansConducteur };
}

// F4 / F5 : envoi de la désignation (ou de la non-désignation) validée par le loueur
export async function envoyerDesignation(amendeId: string, agenceId: string, utilisateurId: string, nonDesignation = false): Promise<{ erreur?: string; message?: string }> {
  const db = admin();
  const { data: a } = await db.from('amendes').select('*, clients(*), agences(nom, siret, adresse, email, antai_actif)').eq('id', amendeId).eq('agence_id', agenceId).maybeSingle();
  if (!a) return { erreur: 'Amende introuvable.' };
  if (a.source !== 'antai' || !a.antai_id) return { erreur: 'Cette amende n’a pas été reçue de l’ANTAI : désignation sur le site de l’ANTAI.' };
  if (!a.agences?.antai_actif) return { erreur: 'La désignation ANTAI n’est pas activée pour votre agence.' };
  if (['designation_faite', 'acquittement'].includes(a.antai_statut)) return { erreur: 'Déjà désignée.' };
  if (a.antai_statut === 'expire' || a.antai_statut === 'fail') return { erreur: 'Le délai de 45 jours est dépassé : la désignation n’est plus possible par Fleet.' };
  let corps: any;
  if (nonDesignation) corps = { identifiantDesignation: Number(a.antai_id), statut: 'NON_DESIGNATION' };
  else {
    const p = preparerDesignation(a, a.agences, a.clients);
    if (!p.corps) return { erreur: `Il manque : ${p.manquants.join(', ')}.` };
    corps = p.corps;
  }
  const r = await api.designer(corps, agenceId);
  const maintenant = new Date().toISOString();
  if (r.statut === 200) {
    const nom = a.clients ? [a.clients.prenom, a.clients.nom].filter(Boolean).join(' ') : null;
    await db.from('amendes').update({
      antai_statut: 'designation_faite', antai_message: null, designation: corps, designe_le: maintenant, designe_par: utilisateurId,
      statut: nonDesignation ? 'payee' : 'designee', conducteur_designe: nonDesignation ? 'Non-désignation (l’agence reste redevable)' : nom,
    }).eq('id', amendeId);
    return { message: nonDesignation ? 'Non-désignation envoyée à l’ANTAI.' : 'Désignation envoyée à l’ANTAI. Fleet suit sa réponse.' };
  }
  const msg = api.messageAntai(r) || `Erreur ${r.statut}`;
  await db.from('amendes').update({ antai_message: msg }).eq('id', amendeId);
  return { erreur: `L’ANTAI a refusé : ${msg}` };
}

// F6 : réponse de l'ANTAI aux désignations envoyées (acquittée, refusée, expirée)
export async function suivreStatuts(): Promise<{ acquittees: number; refusees: number; expirees: number }> {
  const db = admin();
  const { data } = await db.from('amendes').select('id, antai_id, antai_statut').eq('source', 'antai').in('antai_statut', ['designation_faite', 'non_traite']).not('antai_id', 'is', null).limit(1000);
  const liste = data ?? [];
  if (!liste.length) return { acquittees: 0, refusees: 0, expirees: 0 };
  const r = await api.statutDesignations(liste.map((a: any) => Number(a.antai_id)));
  if (r.statut !== 200) throw new api.ErreurAntai(`Suivi refusé : ${api.messageAntai(r)}`, r.statut);
  const ids = (k: string) => new Set<number>(((r.corps?.[k]?.IdentifiantDesignation ?? r.corps?.[k]?.identifiantDesignation ?? []) as any[]).map(Number));
  const acq = ids('acquittement'), ref = ids('refuse'), exp = ids('expire');
  let acquittees = 0, refusees = 0, expirees = 0;
  for (const a of liste) {
    const id = Number(a.antai_id);
    if (acq.has(id) && a.antai_statut !== 'acquittement') { acquittees++; await db.from('amendes').update({ antai_statut: 'acquittement', antai_message: null }).eq('id', a.id); }
    else if (ref.has(id)) { refusees++; await db.from('amendes').update({ antai_statut: 'refuse', statut: 'refusee', antai_message: 'Refusée par l’ANTAI : vérifiez les informations puis désignez à nouveau avant la fin du délai.' }).eq('id', a.id); }
    else if (exp.has(id)) { expirees++; await db.from('amendes').update({ antai_statut: 'expire', antai_message: 'Délai de 45 jours dépassé.' }).eq('id', a.id); }
  }
  return { acquittees, refusees, expirees };
}
