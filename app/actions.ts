'use server';
// Toutes les actions qui modifient les données. Les règles d'accès de la base (RLS)
// garantissent qu'un loueur ne touche qu'aux données de son agence.
import { deplacerReservation as deplacerReservationLib } from '@/lib/reservation';
import { lireDocument } from '@/lib/lecture';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { utilisateurCourant, verifier } from '@/lib/agence';
import { texte, nombre, immat, depuisParis, joursEntre, JOUR, tel, memePersonne } from '@/lib/format';
const telephoneSaisi = (v: FormDataEntryValue | null) => { const t = texte(v); return t ? tel(t) : null; };
import { chercherPhotoModele } from '@/lib/photoModele';
import { imeiDeLAgence } from '@/lib/telematique';
import { commandeMoteur } from '@/lib/whatsgps';

const rafraichir = () => revalidatePath('/', 'layout');

// Les erreurs lancées dans une action serveur sont masquées en production :
// on les renvoie donc sous forme de message, affiché en français dans le formulaire.
type Resultat = { erreur?: string } | void;
function proteger<A extends any[]>(fn: (...a: A) => Promise<any>) {
  return async (...a: A): Promise<Resultat> => {
    try {
      await fn(...a);
    } catch (e: any) {
      if (typeof e?.digest === 'string' && e.digest.startsWith('NEXT_')) throw e; // redirection
      return { erreur: e?.message || 'Une erreur est survenue.' };
    }
  };
}


async function journal(location_id: string | null, vehicule_id: string | null, action: string, detail?: string) {
  const { supabase, profil } = await utilisateurCourant();
  await supabase.from('historique').insert({ agence_id: profil.agence_id, location_id, vehicule_id, action, detail, auteur: profil.id });
}

function cheminScan(formData: FormData, nom: string, agenceId: string) {
  const v = texte(formData.get(nom));
  return v && v.startsWith(agenceId + '/') ? v : null;
}

const PAPIERS_CLIENT = ['permis_path', 'permis_verso_path', 'piece_identite_path', 'piece_identite_verso_path', 'justificatif_domicile_path'];
function papiersClient(formData: FormData, agenceId: string) {
  return Object.fromEntries(PAPIERS_CLIENT.map((c) => [c, cheminScan(formData, c, agenceId)]));
}

// Véhicule prêté par un confrère : pas de coût ; les colonnes du prêt ne sont écrites que si besoin
function champsPret(formData: FormData, _modification = false) {
  if (texte(formData.get('financement')) === 'pret') {
    const unite = texte(formData.get('pret_unite'));
    return { cout_mensuel: null, prix_achat: null, pret_par: texte(formData.get('pret_par')), pret_retour: texte(formData.get('pret_retour')),
      pret_tarif: nombre(formData.get('pret_tarif')), pret_unite: unite && ['jour', 'mois', 'forfait'].includes(unite) ? unite : null };
  }
  return {};
}

function champAutorise(champ: string, liste: string[]) {
  if (!liste.includes(champ)) throw new Error('Champ non autorisé');
}

// ---------------------------------------------------------------------------
// Véhicules
// ---------------------------------------------------------------------------
async function _ajouterVehicule(formData: FormData) {
  const { supabase, profil } = await utilisateurCourant();
  if (!immat(formData.get('immatriculation'))) throw new Error('Indiquez l’immatriculation.');
  if (!texte(formData.get('marque')) || !texte(formData.get('modele'))) throw new Error('Indiquez la marque et le modèle.');
  const { data, error } = await supabase.from('vehicules').insert({
    agence_id: profil.agence_id,
    immatriculation: immat(formData.get('immatriculation')),
    marque: texte(formData.get('marque')),
    modele: texte(formData.get('modele')),
    carburant: texte(formData.get('carburant')),
    km: nombre(formData.get('km')),
    prix_jour: nombre(formData.get('prix_jour')),
    assurance_echeance: texte(formData.get('assurance_echeance')),
    ct_echeance: texte(formData.get('ct_echeance')),
    cout_mensuel: nombre(formData.get('cout_mensuel')),
    financement: texte(formData.get('financement')),
    date_entree: texte(formData.get('date_entree')) ?? new Date().toISOString().slice(0, 10),
    carte_grise_path: cheminScan(formData, 'carte_grise_path', profil.agence_id),
    prix_achat: nombre(formData.get('prix_achat')),
    ...champsPret(formData),
  }).select('id').single();
  verifier(error, 'Ajout du véhicule');
  rafraichir();
  redirect(`/vehicules/${data!.id}`);
}

async function _majVehicule(id: string, formData: FormData) {
  const { supabase } = await utilisateurCourant();
  const { error } = await supabase.from('vehicules').update({
    prix_achat: nombre(formData.get('prix_achat')),
    immatriculation: immat(formData.get('immatriculation')),
    marque: texte(formData.get('marque')),
    modele: texte(formData.get('modele')),
    carburant: texte(formData.get('carburant')),
    km: nombre(formData.get('km')),
    prix_jour: nombre(formData.get('prix_jour')),
    assurance_echeance: texte(formData.get('assurance_echeance')),
    ct_echeance: texte(formData.get('ct_echeance')),
    cout_mensuel: nombre(formData.get('cout_mensuel')),
    financement: texte(formData.get('financement')),
    date_entree: texte(formData.get('date_entree')),
    ...champsPret(formData, true),
  }).eq('id', id);
  verifier(error, 'Modification du véhicule');
  rafraichir();
  await recalerTraceur(supabase, id, nombre(formData.get('km')));
}

async function _statutVehicule(id: string, statut: string) {
  champAutorise(statut, ['disponible', 'loue', 'maintenance', 'hors_service']);
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('vehicules').update({ statut }).eq('id', id)).error);
  await journal(null, id, 'Statut du véhicule', statut);
  rafraichir();
}

async function _documentVehicule(id: string, champ: string, chemin: string) {
  champAutorise(champ, ['carte_grise_path', 'assurance_path', 'ct_path', 'photo_path']);
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('vehicules').update({ [champ]: chemin }).eq('id', id)).error);
  rafraichir();
}

async function _sortirVehicule(id: string, formData: FormData) {
  const { supabase } = await utilisateurCourant();
  const { data: enCours } = await supabase.from('locations').select('numero').eq('vehicule_id', id).in('statut', ['reservee', 'en_cours']).limit(1);
  if (enCours?.length) throw new Error(`Ce véhicule a encore une location en cours ou à venir (contrat n° ${enCours[0].numero}). Terminez-la ou changez de voiture d\u2019abord.`);
  const motif = texte(formData.get('motif_sortie')) ?? 'autre';
  const quand = texte(formData.get('date_sortie')) ?? new Date().toISOString().slice(0, 10);
  verifier((await supabase.from('vehicules').update({
    statut: 'sorti', date_sortie: quand, motif_sortie: motif, prix_sortie: nombre(formData.get('prix_sortie')),
  }).eq('id', id)).error, 'Sortie du véhicule');
  await journal(null, id, 'Sorti de la flotte', motif);
  rafraichir();
}

async function _remettreVehicule(id: string) {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('vehicules').update({ statut: 'disponible', date_sortie: null, motif_sortie: null, prix_sortie: null }).eq('id', id)).error);
  await journal(null, id, 'Remis dans la flotte');
  rafraichir();
}

async function _photoModele(id: string) {
  const { supabase } = await utilisateurCourant();
  const { data: v } = await supabase.from('vehicules').select('marque, modele').eq('id', id).single();
  const photo = await chercherPhotoModele(v?.marque, v?.modele);
  if (!photo) throw new Error('Aucune photo trouvée pour ce modèle. Vérifiez la marque et le modèle, ou ajoutez votre propre photo.');
  verifier((await supabase.from('vehicules').update({ photo_modele: photo }).eq('id', id)).error);
  rafraichir();
}

async function _enregistrerAttestation(vehicule_id: string, personne: string, fourriere: string, frais?: number | null) {
  const { supabase, profil } = await utilisateurCourant();
  if (frais && frais > 0) {
    verifier((await supabase.from('depenses').insert({ agence_id: profil.agence_id, vehicule_id, categorie: 'fourriere', montant: frais, libelle: fourriere || 'Fourrière' })).error, 'Frais de fourrière');
  }
  verifier((await supabase.from('attestations_fourriere').insert({
    agence_id: profil.agence_id, vehicule_id, personne_autorisee: personne, fourriere: fourriere || null, created_by: profil.id,
  })).error);
  await journal(null, vehicule_id, 'Attestation fourrière', `${personne}${fourriere ? ' · ' + fourriere : ''}`);
  rafraichir();
}

// ---------------------------------------------------------------------------
// Entretien
// ---------------------------------------------------------------------------
async function _ajouterEntretien(formData: FormData) {
  const { supabase, profil } = await utilisateurCourant();
  const vehicule_id = String(formData.get('vehicule_id'));
  const demarrer = formData.get('demarrer') === 'oui';
  verifier((await supabase.from('entretiens').insert({
    agence_id: profil.agence_id, vehicule_id,
    type: texte(formData.get('type')) ?? 'entretien',
    raison: texte(formData.get('raison')) ?? 'Entretien',
    montant_recu: nombre(formData.get('montant_recu')),
    commentaire: texte(formData.get('commentaire')),
    garage: texte(formData.get('garage')),
    retour_prevu: depuisParis(texte(formData.get('retour_prevu'))),
    km: nombre(formData.get('km')),
    cout: nombre(formData.get('cout')),
    statut: demarrer ? 'en_cours' : 'prevu',
    debut: demarrer ? new Date().toISOString() : null,
  })).error, 'Ajout de l’entretien');
  if (demarrer) await supabase.from('vehicules').update({ statut: 'maintenance' }).eq('id', vehicule_id);
  rafraichir();
}

// Prêter un de mes véhicules à un confrère : il sort de ma flotte disponible jusqu'au retour, le prix entre dans mon chiffre
async function _preterVehicule(formData: FormData) {
  const { supabase, profil } = await utilisateurCourant();
  const vehicule_id = String(formData.get('vehicule_id') || '');
  const loueur = texte(formData.get('loueur'));
  if (!vehicule_id || !loueur) throw new Error('Choisissez le véhicule et le confrère.');
  const debut = depuisParis(texte(formData.get('debut'))) ?? new Date().toISOString();
  const retour = depuisParis(texte(formData.get('retour_prevu')));
  const tarif = nombre(formData.get('tarif'));
  const unite = String(formData.get('tarif_unite') || 'jour') === 'forfait' ? 'forfait' : 'jour';
  const jours = retour ? Math.max(1, Math.ceil((new Date(retour).getTime() - new Date(debut).getTime()) / JOUR)) : null;
  const prevu = tarif == null ? null : unite === 'forfait' ? tarif : jours ? tarif * jours : null;
  const conflit = await supabase.from('locations').select('numero').eq('vehicule_id', vehicule_id).in('statut', ['reservee', 'en_cours'])
    .lt('debut', retour ?? '9999-12-31').gt('fin_prevue', debut).limit(1);
  if (conflit.data?.length) throw new Error(`Ce véhicule a une location sur ces dates (n° ${conflit.data[0].numero}) : changez-la de voiture d'abord.`);
  const maintenant = new Date(debut).getTime() <= Date.now() + 3600e3;
  verifier((await supabase.from('entretiens').insert({
    agence_id: profil.agence_id, vehicule_id, type: 'transfert', raison: `Prêt à ${loueur}`, garage: loueur, garage_tel: telephoneSaisi(formData.get('telephone')),
    debut, retour_prevu: retour, tarif, tarif_unite: unite, montant_recu: prevu, commentaire: texte(formData.get('commentaire')),
    statut: maintenant ? 'en_cours' : 'prevu',
  })).error, 'Prêt');
  if (maintenant) await supabase.from('vehicules').update({ statut: 'maintenance' }).eq('id', vehicule_id);
  await journal(null, vehicule_id, 'Prêté à un confrère', `${loueur}${retour ? ' · retour prévu ' + new Date(retour).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : ''}`);
  rafraichir();
}

async function _encaisserPret(id: string) {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('entretiens').update({ encaisse: true }).eq('id', id)).error);
  rafraichir();
}
async function _reglerEmprunt(vehicule_id: string) {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('vehicules').update({ pret_regle: true }).eq('id', vehicule_id)).error);
  rafraichir();
}
// Véhicule emprunté rendu au confrère : il sort de la flotte (historique et chiffres conservés)
async function _rendreEmprunt(vehicule_id: string) {
  const { supabase } = await utilisateurCourant();
  const { data: l } = await supabase.from('locations').select('numero').eq('vehicule_id', vehicule_id).in('statut', ['reservee', 'en_cours']).limit(1);
  if (l?.length) throw new Error(`Ce véhicule a encore une location (n° ${l[0].numero}) : changez-la de voiture ou terminez-la d'abord.`);
  verifier((await supabase.from('vehicules').update({ statut: 'sorti', date_sortie: versJourSrv() }).eq('id', vehicule_id)).error);
  await journal(null, vehicule_id, 'Rendu au confrère');
  rafraichir();
}
const versJourSrv = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

async function _demarrerEntretien(id: string) {
  const { supabase } = await utilisateurCourant();
  const { data, error } = await supabase.from('entretiens')
    .update({ statut: 'en_cours', debut: new Date().toISOString() }).eq('id', id).select('vehicule_id').single();
  verifier(error);
  await supabase.from('vehicules').update({ statut: 'maintenance' }).eq('id', data!.vehicule_id);
  rafraichir();
}

async function _terminerEntretien(id: string, formData?: FormData) {
  const { supabase } = await utilisateurCourant();
  const cout = formData ? nombre(formData.get('cout')) : null;
  const recu = formData ? nombre(formData.get('montant_recu')) : null;
  const maj: any = { statut: 'termine', fin: new Date().toISOString() };
  if (cout !== null) maj.cout = cout;
  if (recu !== null) maj.montant_recu = recu;
  else {
    // Prêt à un confrère facturé au jour : le montant suit la durée réelle
    const { data: e0 } = await supabase.from('entretiens').select('*').eq('id', id).single();
    if ((e0 as any)?.tarif && (e0 as any)?.tarif_unite === 'jour' && (e0 as any)?.debut)
      maj.montant_recu = Number((e0 as any).tarif) * Math.max(1, Math.ceil((Date.now() - new Date((e0 as any).debut).getTime()) / JOUR));
  }
  const { data, error } = await supabase.from('entretiens').update(maj).eq('id', id).select('vehicule_id').single();
  verifier(error);
  const { data: v } = await supabase.from('vehicules').select('statut').eq('id', data!.vehicule_id).single();
  if (v?.statut === 'maintenance') await supabase.from('vehicules').update({ statut: 'disponible' }).eq('id', data!.vehicule_id);
  rafraichir();
}

// Fiche maintenance : notes de suivi (appel au garage, nouvelle date de sortie…) et infos du garage
async function _noteEntretien(id: string, formData: FormData) {
  const { supabase, profil } = await utilisateurCourant();
  const txt = texte(formData.get('texte'));
  const genre = String(formData.get('genre') || 'note');
  champAutorise(genre, ['note', 'appel', 'date']);
  const nouvelle = depuisParis(texte(formData.get('retour_prevu')));
  if (!txt && !nouvelle) throw new Error('Écrivez une note ou choisissez une nouvelle date.');
  const { data: e } = await supabase.from('entretiens').select('vehicule_id, retour_prevu').eq('id', id).single();
  verifier((await supabase.from('entretien_suivi').insert({ agence_id: profil.agence_id, entretien_id: id, genre: nouvelle && !txt ? 'date' : genre, texte: txt, retour_prevu: nouvelle, auteur: profil.id })).error);
  if (nouvelle) {
    verifier((await supabase.from('entretiens').update({ retour_prevu: nouvelle }).eq('id', id)).error);
    await journal(null, e?.vehicule_id ?? null, 'Maintenance : nouvelle date de sortie', `${txt ? txt + ' · ' : ''}${new Date(nouvelle).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' })}`);
  }
  rafraichir();
}

async function _majEntretien(id: string, formData: FormData) {
  const { supabase } = await utilisateurCourant();
  const type = texte(formData.get('type'));
  if (type) champAutorise(type, ['entretien', 'reparation', 'carrosserie', 'controle', 'nettoyage', 'transfert', 'autre']);
  verifier((await supabase.from('entretiens').update({
    ...(type ? { type } : {}),
    raison: texte(formData.get('raison')) ?? 'Entretien',
    garage: texte(formData.get('garage')),
    garage_tel: telephoneSaisi(formData.get('garage_tel')),
    cout: nombre(formData.get('cout')),
    km: nombre(formData.get('km')),
    commentaire: texte(formData.get('commentaire')),
  }).eq('id', id)).error);
  rafraichir();
}

async function _devisEntretien(id: string, chemin: string) {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('entretiens').update({ devis_path: chemin }).eq('id', id)).error);
  rafraichir();
}

// ---------------------------------------------------------------------------
// Dommages
// ---------------------------------------------------------------------------
async function _ajouterDommage(formData: FormData) {
  const { supabase, profil } = await utilisateurCourant();
  verifier((await supabase.from('dommages').insert({
    agence_id: profil.agence_id,
    vehicule_id: String(formData.get('vehicule_id')),
    location_id: texte(formData.get('location_id')),
    edl_id: texte(formData.get('edl_id')),
    type: texte(formData.get('type')) ?? 'autre',
    gravite: texte(formData.get('gravite')) ?? 'leger',
    zone: texte(formData.get('zone')),
    cout: nombre(formData.get('cout')),
  })).error, 'Ajout du dommage');
  rafraichir();
}

async function _photoDommage(id: string, champ: string, chemin: string) {
  champAutorise(champ, ['photo_zone_path', 'photo_gros_plan_path']);
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('dommages').update({ [champ]: chemin }).eq('id', id)).error);
  rafraichir();
}

async function _statutDommage(id: string, statut: string) {
  champAutorise(statut, ['ouvert', 'repare', 'annule']);
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('dommages').update({ statut }).eq('id', id)).error);
  rafraichir();
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
function champsClient(formData: FormData) {
  return {
    nom: (texte(formData.get('nom')) ?? '').toUpperCase(),
    prenom: texte(formData.get('prenom')),
    telephone: telephoneSaisi(formData.get('telephone')),
    email: texte(formData.get('email')),
    adresse: texte(formData.get('adresse')),
    date_naissance: texte(formData.get('date_naissance')),
    date_permis: texte(formData.get('date_permis')),
    numero_permis: texte(formData.get('numero_permis')),
  };
}

async function _ajouterClient(formData: FormData) {
  const { supabase, profil } = await utilisateurCourant();
  const champs = champsClient(formData);
  if (!champs.nom) throw new Error('Le nom du client est obligatoire.');
  const { data, error } = await supabase.from('clients').insert({ agence_id: profil.agence_id, ...champs,
    ...papiersClient(formData, profil.agence_id) }).select('id').single();
  verifier(error, 'Ajout du client');
  rafraichir();
  redirect(`/clients/${data!.id}`);
}

async function _majClient(id: string, formData: FormData) {
  const { supabase } = await utilisateurCourant();
  const champs: any = champsClient(formData);
  champs.note = texte(formData.get('note'));
  verifier((await supabase.from('clients').update(champs).eq('id', id)).error, 'Modification du client');
  rafraichir();
}

async function _documentClient(id: string, champ: string, chemin: string) {
  champAutorise(champ, PAPIERS_CLIENT);
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('clients').update({ [champ]: chemin }).eq('id', id)).error);
  rafraichir();
}

async function _listeNoire(id: string, valeur: boolean) {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('clients').update({ liste_noire: valeur }).eq('id', id)).error);
  rafraichir();
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------
async function verifierDisponible(supabase: any, vehicule_id: string, debut: string, fin: string, sauf?: string) {
  let q = supabase.from('locations').select('id, numero, debut, fin_prevue')
    .eq('vehicule_id', vehicule_id).in('statut', ['reservee', 'en_cours'])
    .lt('debut', fin).gt('fin_prevue', debut);
  if (sauf) q = q.neq('id', sauf);
  const { data } = await q;
  if (data?.length) throw new Error(`Ce véhicule est déjà réservé sur ces dates (contrat n° ${data[0].numero}).`);
}

async function _creerLocation(formData: FormData) {
  const { supabase, profil } = await utilisateurCourant();
  const vehicule_id = String(formData.get('vehicule_id') || '');
  if (!vehicule_id) throw new Error('Choisissez un véhicule.');
  const debut = depuisParis(texte(formData.get('debut')));
  const fin = depuisParis(texte(formData.get('fin_prevue')));
  if (!debut || !fin) throw new Error('Indiquez les dates de départ et de retour.');
  if (new Date(fin) <= new Date(debut)) throw new Error('Le retour doit être après le départ.');
  await verifierDisponible(supabase, vehicule_id, debut, fin);

  let client_id = texte(formData.get('client_id'));
  if (!client_id) {
    const champs = champsClient(formData);
    if (!champs.nom) throw new Error('Choisissez un client ou saisissez le nom d’un nouveau client.');
    const { data, error } = await supabase.from('clients').insert({ agence_id: profil.agence_id, ...champs,
      ...papiersClient(formData, profil.agence_id) }).select('id').single();
    verifier(error, 'Création du client');
    client_id = data!.id;
  }

  const { data: v } = await supabase.from('vehicules').select('prix_jour, km').eq('id', vehicule_id).single();
  let prix = nombre(formData.get('prix_total'));
  if (prix === null && v?.prix_jour) prix = Number(v.prix_jour) * joursEntre(debut, fin);

  const { data, error } = await supabase.from('locations').insert({
    agence_id: profil.agence_id, vehicule_id, client_id, debut, fin_prevue: fin, prix_total: prix,
    km_inclus: nombre(formData.get('km_inclus')), prix_km_sup: nombre(formData.get('prix_km_sup')),
    caution_montant: nombre(formData.get('caution_montant')), km_depart: v?.km ?? null,
    note: texte(formData.get('note')),
  }).select('id').single();
  verifier(error, 'Création de la location');
  await journal(data!.id, vehicule_id, 'Réservation créée');
  rafraichir();
  redirect(`/locations/${data!.id}`);
}

async function _prolonger(id: string, formData: FormData) {
  const { supabase } = await utilisateurCourant();
  const { data: l } = await supabase.from('locations').select('vehicule_id, debut, fin_prevue, prix_total').eq('id', id).single();
  const fin = depuisParis(texte(formData.get('fin_prevue')));
  if (!l || !fin) throw new Error('Nouvelle date de retour manquante.');
  if (new Date(fin) <= new Date(l.debut)) throw new Error('Le retour doit être après le départ.');
  await verifierDisponible(supabase, l.vehicule_id, l.debut, fin, id);
  const prix = nombre(formData.get('prix_total')) ?? l.prix_total;
  verifier((await supabase.from('locations').update({ fin_prevue: fin, prix_total: prix }).eq('id', id)).error);
  await journal(id, l.vehicule_id, 'Prolongation', `retour le ${new Date(fin).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`);
  rafraichir();
}

async function _changerVoiture(id: string, formData: FormData) {
  const { supabase } = await utilisateurCourant();
  const nouveau = String(formData.get('vehicule_id') || '');
  const { data: l } = await supabase.from('locations').select('vehicule_id, debut, fin_prevue, statut, vehicules(immatriculation)').eq('id', id).single();
  if (!l || !nouveau || nouveau === l.vehicule_id) return;
  await verifierDisponible(supabase, nouveau, l.debut, l.fin_prevue, id);
  const { data: v } = await supabase.from('vehicules').select('immatriculation, km').eq('id', nouveau).single();
  verifier((await supabase.from('locations').update({ vehicule_id: nouveau, ...(l.statut === 'reservee' ? { km_depart: v?.km ?? null } : {}) }).eq('id', id)).error);
  if (l.statut === 'en_cours') {
    await supabase.from('vehicules').update({ statut: 'disponible' }).eq('id', l.vehicule_id);
    await supabase.from('vehicules').update({ statut: 'loue' }).eq('id', nouveau);
  }
  await journal(id, nouveau, 'Changement de voiture', `${(l as any).vehicules?.immatriculation ?? ''} → ${v?.immatriculation ?? ''}`);
  rafraichir();
}

async function _deplacerReservation(id: string, vehicule_id: string) {
  const { supabase, profil } = await utilisateurCourant();
  await deplacerReservationLib(supabase, profil.agence_id, profil.id, id, vehicule_id);
  rafraichir();
}

// Planning : décaler une réservation de quelques jours (même durée, mêmes heures), éventuellement sur une autre voiture,
// ou tirer son bord pour la prolonger / raccourcir. Le prix suit la durée au tarif journalier de la voiture.
async function _ajusterPlanning(id: string, p: { decalageJours?: number; vehicule_id?: string | null; nouvelleFinJour?: string | null }) {
  const { supabase } = await utilisateurCourant();
  const { data: l } = await supabase.from('locations').select('vehicule_id, debut, fin_prevue, statut, prix_total, vehicules(prix_jour)').eq('id', id).single();
  if (!l) throw new Error('Location introuvable.');
  const decalage = Math.round(Number(p.decalageJours ?? 0));
  if (decalage && l.statut !== 'reservee') throw new Error('Une location déjà partie ne peut pas être décalée : prolongez-la plutôt.');
  if (!['reservee', 'en_cours'].includes(l.statut)) throw new Error('Cette location est terminée.');
  const vehicule = p.vehicule_id && p.vehicule_id !== l.vehicule_id ? p.vehicule_id : l.vehicule_id;
  if (vehicule !== l.vehicule_id && l.statut !== 'reservee') throw new Error('Pour une location en cours, changez de voiture depuis sa fiche.');
  const J = 86_400_000;
  let debut = new Date(new Date(l.debut).getTime() + decalage * J).toISOString();
  let fin = new Date(new Date(l.fin_prevue).getTime() + decalage * J).toISOString();
  if (p.nouvelleFinJour && /^\d{4}-\d{2}-\d{2}$/.test(p.nouvelleFinJour)) {
    const heure = new Date(l.fin_prevue).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
    fin = depuisParis(`${p.nouvelleFinJour}T${heure}`)!;
    if (new Date(fin) <= new Date(debut)) throw new Error('Le retour doit être après le départ.');
  }
  await verifierDisponible(supabase, vehicule, debut, fin, id);
  const prixJour = Number((l as any).vehicules?.prix_jour ?? 0);
  const ancienneDuree = Math.max(1, Math.ceil((new Date(l.fin_prevue).getTime() - new Date(l.debut).getTime()) / J));
  const nouvelleDuree = Math.max(1, Math.ceil((new Date(fin).getTime() - new Date(debut).getTime()) / J));
  const prix = nouvelleDuree !== ancienneDuree && prixJour ? Math.round((Number(l.prix_total ?? 0) + (nouvelleDuree - ancienneDuree) * prixJour) * 100) / 100 : l.prix_total;
  const maj: Record<string, unknown> = { debut, fin_prevue: fin, prix_total: prix };
  if (vehicule !== l.vehicule_id) maj.vehicule_id = vehicule;
  verifier((await supabase.from('locations').update(maj).eq('id', id)).error);
  const quand = (d: string) => new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  await journal(id, vehicule, p.nouvelleFinJour ? 'Retour modifié depuis le planning' : 'Réservation déplacée depuis le planning', `${quand(debut)} → ${quand(fin)}${prix !== l.prix_total ? ` · prix ${prix} €` : ''}`);
  rafraichir();
  return { debut, fin, prix };
}

async function _annulerLocation(id: string) {
  const { supabase } = await utilisateurCourant();
  const { data: l } = await supabase.from('locations').select('statut, vehicule_id').eq('id', id).single();
  if (l?.statut !== 'reservee') throw new Error('Seule une réservation pas encore partie peut être annulée.');
  verifier((await supabase.from('locations').update({ statut: 'annulee' }).eq('id', id)).error);
  await journal(id, l.vehicule_id, 'Réservation annulée');
  rafraichir();
}

async function _cautionLocation(id: string, formData: FormData) {
  const statut = String(formData.get('caution_statut'));
  champAutorise(statut, ['a_prendre', 'prise', 'rendue', 'encaissee', 'litige']);
  const { supabase } = await utilisateurCourant();
  const retenue = nombre(formData.get('caution_retenue'));
  const motif = texte(formData.get('caution_motif'));
  if (statut === 'encaissee' && !motif) throw new Error('Indiquez le motif de la retenue.');
  verifier((await supabase.from('locations').update({
    caution_statut: statut, caution_montant: nombre(formData.get('caution_montant')),
    caution_retenue: statut === 'encaissee' ? retenue : null, caution_motif: statut === 'encaissee' || statut === 'litige' ? motif : null,
  }).eq('id', id)).error);
  await journal(id, null, 'Caution', statut + (motif ? ' · ' + motif : ''));
  rafraichir();
}

async function _signatureContrat(id: string, chemin: string) {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('locations').update({ signature_contrat_path: chemin }).eq('id', id)).error);
  await journal(id, null, 'Contrat signé');
  rafraichir();
}

async function _noteLocation(id: string, formData: FormData) {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('locations').update({ note: texte(formData.get('note')) }).eq('id', id)).error);
  rafraichir();
}

// ---------------------------------------------------------------------------
// État des lieux
// ---------------------------------------------------------------------------
async function _ouvrirEdl(location_id: string, type: 'depart' | 'retour') {
  const { supabase, profil } = await utilisateurCourant();
  const { data: existe } = await supabase.from('etats_des_lieux').select('id').eq('location_id', location_id).eq('type', type).maybeSingle();
  if (!existe) {
    verifier((await supabase.from('etats_des_lieux').insert({ agence_id: profil.agence_id, location_id, type, created_by: profil.id })).error);
  }
  redirect(`/locations/${location_id}/edl/${type}`);
}

async function _photoEdl(edl_id: string, position: string, chemin: string) {
  const { supabase, profil } = await utilisateurCourant();
  if (position !== 'libre') await supabase.from('photos_edl').delete().eq('edl_id', edl_id).eq('position', position);
  verifier((await supabase.from('photos_edl').insert({ agence_id: profil.agence_id, edl_id, position, path: chemin })).error);
  rafraichir();
}

async function _majEdl(edl_id: string, formData: FormData) {
  const { supabase } = await utilisateurCourant();
  const checklist: Record<string, boolean | string> = {};
  ['voyant', 'badge', 'kit', 'accessoires', 'proprete'].forEach((c) => { checklist[c] = formData.get(c) === 'on'; });
  const voyantType = checklist.voyant ? texte(formData.get('voyant_type')) : null;
  if (voyantType) (checklist as any).voyant_type = voyantType;
  verifier((await supabase.from('etats_des_lieux').update({
    km: nombre(formData.get('km')), carburant: nombre(formData.get('carburant')), checklist,
  }).eq('id', edl_id)).error);
  rafraichir();
}

async function _signatureEdl(edl_id: string, chemin: string) {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('etats_des_lieux').update({ signature_path: chemin, signe_le: new Date().toISOString() }).eq('id', edl_id)).error);
  rafraichir();
}

async function _positionEdl(edl_id: string, latitude: number, longitude: number) {
  const { supabase } = await utilisateurCourant();
  await supabase.from('etats_des_lieux').update({ latitude, longitude }).eq('id', edl_id);
}

async function _terminerEdl(edl_id: string) {
  const { supabase } = await utilisateurCourant();
  const { data: e } = await supabase.from('etats_des_lieux')
    .select('id, type, km, carburant, location_id, locations(vehicule_id, statut, km_depart)').eq('id', edl_id).single();
  if (!e) throw new Error('État des lieux introuvable.');
  if (e.km === null) throw new Error('Indiquez le kilométrage avant de terminer.');
  const l: any = e.locations;
  const maintenant = new Date().toISOString();
  if (e.type === 'depart') {
    verifier((await supabase.from('etats_des_lieux').update({ statut: 'termine' }).eq('id', edl_id)).error);
    verifier((await supabase.from('locations').update({ statut: 'en_cours', km_depart: e.km, carburant_depart: e.carburant }).eq('id', e.location_id)).error);
    await supabase.from('vehicules').update({ statut: 'loue', km: e.km }).eq('id', l.vehicule_id);
    await journal(e.location_id, l.vehicule_id, 'Départ', `${e.km} km`);
    await recalerTraceur(supabase, l.vehicule_id, e.km);
  } else {
    if (l.km_depart !== null && e.km < l.km_depart) throw new Error('Le kilométrage de retour est inférieur à celui du départ.');
    verifier((await supabase.from('etats_des_lieux').update({ statut: 'a_comparer' }).eq('id', edl_id)).error);
    await supabase.from('etats_des_lieux').update({ statut: 'a_comparer' }).eq('location_id', e.location_id).eq('type', 'depart');
    verifier((await supabase.from('locations').update({ statut: 'terminee', km_retour: e.km, carburant_retour: e.carburant, fin_reelle: maintenant }).eq('id', e.location_id)).error);
    await supabase.from('vehicules').update({ statut: 'disponible', km: e.km }).eq('id', l.vehicule_id);
    await journal(e.location_id, l.vehicule_id, 'Retour', `${e.km} km`);
    await recalerTraceur(supabase, l.vehicule_id, e.km);
  }
  rafraichir();
  redirect(e.type === 'retour' ? `/locations/${e.location_id}/comparaison` : `/locations/${e.location_id}`);
}

async function _validerComparaison(location_id: string) {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('etats_des_lieux').update({ statut: 'termine' }).eq('location_id', location_id)).error);
  await journal(location_id, null, 'États des lieux comparés');
  rafraichir();
  redirect(`/locations/${location_id}`);
}

// ---------------------------------------------------------------------------
// Amendes
// ---------------------------------------------------------------------------
async function _ajouterAmende(formData: FormData) {
  const { supabase, profil } = await utilisateurCourant();
  const plaque = immat(formData.get('immatriculation'));
  const quand = depuisParis(texte(formData.get('date_infraction')));
  if (!quand) throw new Error('Indiquez la date et l’heure de l’infraction.');
  const { data: v } = await supabase.from('vehicules').select('id').eq('immatriculation', plaque).maybeSingle();
  if (!v) throw new Error(`Aucun véhicule ${plaque} dans votre flotte.`);
  // La location en cours à ce moment-là donne le conducteur
  const { data: locs } = await supabase.from('locations').select('id, client_id, debut, fin_prevue, fin_reelle')
    .eq('vehicule_id', v.id).neq('statut', 'annulee').lte('debut', quand).order('debut', { ascending: false }).limit(5);
  const loc = (locs ?? []).find((l: any) => new Date(l.fin_reelle ?? l.fin_prevue) >= new Date(quand));
  const echeanceSaisie = texte(formData.get('echeance'));
  const echeance = echeanceSaisie ?? new Date(new Date(quand).getTime() + 45 * JOUR).toISOString().slice(0, 10);
  verifier((await supabase.from('amendes').insert({
    agence_id: profil.agence_id, vehicule_id: v.id, location_id: loc?.id ?? null, client_id: loc?.client_id ?? null,
    numero_avis: texte(formData.get('numero_avis')), type: texte(formData.get('type')), date_infraction: quand,
    lieu: texte(formData.get('lieu')), montant: nombre(formData.get('montant')), echeance,
    avis_path: texte(formData.get('avis_path')), statut: loc ? 'a_designer' : 'infos_manquantes',
  })).error, 'Ajout de l’amende');
  rafraichir();
}

async function _statutAmende(id: string, statut: string) {
  champAutorise(statut, ['a_designer', 'infos_manquantes', 'designee', 'refusee', 'payee']);
  const { supabase } = await utilisateurCourant();
  const maj: any = { statut };
  if (statut === 'designee') {
    const { data } = await supabase.from('amendes').select('clients(nom, prenom)').eq('id', id).single();
    const c: any = data?.clients;
    if (c) maj.conducteur_designe = [c.prenom, c.nom].filter(Boolean).join(' ');
  }
  verifier((await supabase.from('amendes').update(maj).eq('id', id)).error);
  rafraichir();
}

async function _avisAmende(id: string, chemin: string) {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('amendes').update({ avis_path: chemin }).eq('id', id)).error);
  rafraichir();
}

async function _clientAmende(id: string, formData: FormData) {
  const { supabase } = await utilisateurCourant();
  const client_id = texte(formData.get('client_id'));
  verifier((await supabase.from('amendes').update({ client_id, statut: client_id ? 'a_designer' : 'infos_manquantes' }).eq('id', id)).error);
  rafraichir();
}

// ---------------------------------------------------------------------------
// FPS (forfaits post-stationnement) : le loueur règle, puis refacture au client qui avait la voiture
// ---------------------------------------------------------------------------
const plusUnMois = (jour: string) => { const d = new Date(jour + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); };

async function _ajouterFps(formData: FormData) {
  const { supabase, profil } = await utilisateurCourant();
  const plaque = immat(formData.get('immatriculation'));
  const quand = depuisParis(texte(formData.get('date_constat')));
  if (!quand) throw new Error('Indiquez la date et l’heure du stationnement.');
  const { data: v } = await supabase.from('vehicules').select('id').eq('immatriculation', plaque).maybeSingle();
  if (!v) throw new Error(`Aucun véhicule ${plaque} dans votre flotte.`);
  // La location en cours à ce moment-là donne le client à refacturer
  const { data: locs } = await supabase.from('locations').select('id, client_id, debut, fin_prevue, fin_reelle')
    .eq('vehicule_id', v.id).neq('statut', 'annulee').lte('debut', quand).order('debut', { ascending: false }).limit(5);
  const loc = (locs ?? []).find((l: any) => new Date(l.fin_reelle ?? l.fin_prevue) >= new Date(quand));
  const { data: ag } = await supabase.from('agences').select('frais_fps').eq('id', profil.agence_id).single();
  const dateAvis = texte(formData.get('date_avis'));
  const base = dateAvis ?? new Date().toISOString().slice(0, 10);
  // Sans date limite lue sur l'avis : trois mois après l'envoi, comme sur les avis de l'ANTAI
  const limitePaiement = texte(formData.get('limite_paiement')) ?? (() => { const d = new Date(base + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 3); return d.toISOString().slice(0, 10); })();
  verifier((await supabase.from('fps').insert({
    agence_id: profil.agence_id, vehicule_id: v.id, location_id: loc?.id ?? null, client_id: loc?.client_id ?? null,
    numero_avis: texte(formData.get('numero_avis')), collectivite: texte(formData.get('collectivite')), date_constat: quand,
    lieu: texte(formData.get('lieu')), montant: nombre(formData.get('montant')), date_avis: dateAvis,
    limite_contestation: plusUnMois(base), limite_paiement: limitePaiement,
    frais_gestion: nombre(formData.get('frais_gestion')) ?? Number(ag?.frais_fps ?? 0),
    avis_path: texte(formData.get('avis_path')), statut: loc ? 'a_refacturer' : 'client_inconnu',
  })).error, 'Ajout du FPS');
  rafraichir();
}

async function _statutFps(id: string, statut: string) {
  champAutorise(statut, ['a_refacturer', 'client_inconnu', 'refacture', 'rembourse', 'conteste', 'abandonne']);
  const { supabase } = await utilisateurCourant();
  const maj: any = { statut };
  if (statut === 'refacture') maj.refacture_le = new Date().toISOString();
  if (statut === 'rembourse') maj.rembourse_le = new Date().toISOString();
  verifier((await supabase.from('fps').update(maj).eq('id', id)).error);
  rafraichir();
}

async function _payeTresorFps(id: string, valeur: boolean) {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('fps').update({ paye_tresor: valeur }).eq('id', id)).error);
  rafraichir();
}

async function _clientFps(id: string, formData: FormData) {
  const { supabase } = await utilisateurCourant();
  const client_id = texte(formData.get('client_id'));
  verifier((await supabase.from('fps').update({ client_id, statut: client_id ? 'a_refacturer' : 'client_inconnu' }).eq('id', id)).error);
  rafraichir();
}

// Relance du client (1 : rappel, 2 : ferme, 3 : mise en demeure envoyée) : on note la date pour le suivi
async function _relancerFps(id: string, niveau: number) {
  const { supabase } = await utilisateurCourant();
  const champ = niveau === 1 ? 'relance1_le' : niveau === 2 ? 'relance2_le' : 'mise_en_demeure_le';
  const maj: any = { [champ]: new Date().toISOString() };
  const { data: f } = await supabase.from('fps').select('statut').eq('id', id).single();
  if (f?.statut === 'a_refacturer') { maj.statut = 'refacture'; maj.refacture_le = new Date().toISOString(); }
  verifier((await supabase.from('fps').update(maj).eq('id', id)).error);
  rafraichir();
}

// Le client ne paie pas : le FPS et les frais sont retenus sur une caution encore en main
async function _retenirCautionFps(id: string) {
  const { supabase } = await utilisateurCourant();
  const { data: f } = await supabase.from('fps').select('id, client_id, location_id, montant, frais_gestion, numero_avis').eq('id', id).single();
  if (!f?.client_id) throw new Error('Associez d’abord le client.');
  const { data: locs } = await supabase.from('locations').select('id, caution_montant, caution_retenue, caution_motif, caution_statut')
    .eq('client_id', f.client_id).eq('caution_statut', 'prise').order('debut', { ascending: false });
  const loc = (locs ?? []).find((l: any) => l.id === f.location_id) ?? (locs ?? [])[0];
  if (!loc) throw new Error('Aucune caution de ce client n’est encore en main.');
  const total = Number(f.montant ?? 0) + Number(f.frais_gestion ?? 0);
  const dejaRetenu = Number(loc.caution_retenue ?? 0);
  if (loc.caution_montant != null && dejaRetenu + total > Number(loc.caution_montant)) throw new Error('La caution ne couvre pas ce montant.');
  const motif = [loc.caution_motif, `FPS ${f.numero_avis ?? ''} (${total.toFixed(2).replace('.', ',')} €)`.trim()].filter(Boolean).join(' · ');
  verifier((await supabase.from('locations').update({ caution_retenue: dejaRetenu + total, caution_motif: motif }).eq('id', loc.id)).error, 'Retenue sur la caution');
  verifier((await supabase.from('fps').update({ statut: 'rembourse', rembourse_le: new Date().toISOString(), retenu_location_id: loc.id }).eq('id', id)).error);
  await journal(loc.id, null, 'Retenue sur la caution', `FPS ${f.numero_avis ?? ''}`);
  rafraichir();
}

async function _fraisFps(id: string, formData: FormData) {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('fps').update({ frais_gestion: nombre(formData.get('frais_gestion')) ?? 0 }).eq('id', id)).error);
  rafraichir();
}

// ---------------------------------------------------------------------------
// Dépenses (fourrière, réparation, carburant…)
// ---------------------------------------------------------------------------
async function _ajouterDepense(formData: FormData) {
  const { supabase, profil } = await utilisateurCourant();
  const montant = nombre(formData.get('montant'));
  if (!montant || montant <= 0) throw new Error('Indiquez le montant de la dépense.');
  const categorie = texte(formData.get('categorie')) ?? 'autre';
  champAutorise(categorie, ['fourriere', 'reparation', 'carburant', 'nettoyage', 'peage', 'autre']);
  verifier((await supabase.from('depenses').insert({
    agence_id: profil.agence_id, vehicule_id: texte(formData.get('vehicule_id')), location_id: texte(formData.get('location_id')),
    categorie, montant, date: texte(formData.get('date')) ?? new Date().toISOString().slice(0, 10), libelle: texte(formData.get('libelle')),
  })).error, 'Ajout de la dépense');
  rafraichir();
}

// ---------------------------------------------------------------------------
// Pièces jointes (factures de réparation, justificatifs)
// ---------------------------------------------------------------------------
async function _ajouterPiece(cible: { entretien_id?: string; depense_id?: string; vehicule_id?: string }, chemin: string, nom: string) {
  const { supabase, profil } = await utilisateurCourant();
  if (!chemin.startsWith(profil.agence_id + '/')) throw new Error('Fichier non autorisé');
  verifier((await supabase.from('pieces_jointes').insert({
    agence_id: profil.agence_id, entretien_id: cible.entretien_id ?? null, depense_id: cible.depense_id ?? null,
    vehicule_id: cible.vehicule_id ?? null, nom: nom.slice(0, 120), path: chemin,
  })).error, 'Ajout du fichier');
  rafraichir();
}

// ---------------------------------------------------------------------------
// Devis
// ---------------------------------------------------------------------------
async function _creerDevis(formData: FormData) {
  const { supabase, profil } = await utilisateurCourant();
  const debut = depuisParis(texte(formData.get('debut')));
  const fin = depuisParis(texte(formData.get('fin')));
  if (!debut || !fin) throw new Error('Indiquez les dates.');
  if (new Date(fin) <= new Date(debut)) throw new Error('Le retour doit être après le départ.');
  const client_id = texte(formData.get('client_id'));
  let client_nom = texte(formData.get('client_nom')); let telephone = telephoneSaisi(formData.get('telephone')); let email = texte(formData.get('email'));
  if (client_id) {
    const { data: c } = await supabase.from('clients').select('nom, prenom, telephone, email').eq('id', client_id).single();
    client_nom = [c?.prenom, c?.nom].filter(Boolean).join(' '); telephone = telephone ?? c?.telephone ?? null; email = email ?? c?.email ?? null;
  }
  if (!client_nom) throw new Error('Choisissez un client ou indiquez un nom.');
  const vehicule_id = texte(formData.get('vehicule_id'));
  let prix = nombre(formData.get('prix_total'));
  if (prix === null && vehicule_id) {
    const { data: v } = await supabase.from('vehicules').select('prix_jour').eq('id', vehicule_id).single();
    if (v?.prix_jour) prix = Number(v.prix_jour) * joursEntre(debut, fin);
  }
  const { data, error } = await supabase.from('devis').insert({
    agence_id: profil.agence_id, client_id, client_nom, telephone, email, vehicule_id, debut, fin, prix_total: prix,
    km_inclus: nombre(formData.get('km_inclus')), prix_km_sup: nombre(formData.get('prix_km_sup')), caution: nombre(formData.get('caution')),
    note: texte(formData.get('note')), valide_jusqu: texte(formData.get('valide_jusqu')),
  }).select('id').single();
  verifier(error, 'Création du devis');
  rafraichir();
  redirect(`/devis/${data!.id}`);
}

async function _statutDevis(id: string, statut: string) {
  champAutorise(statut, ['envoye', 'refuse']);
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('devis').update({ statut }).eq('id', id)).error);
  rafraichir();
}

// Le client accepte : la réservation est créée avec les mêmes valeurs
async function _transformerDevis(id: string, formData: FormData) {
  const { supabase, profil } = await utilisateurCourant();
  const { data: x } = await supabase.from('devis').select('*').eq('id', id).single();
  if (!x) throw new Error('Devis introuvable.');
  if (x.location_id) redirect(`/locations/${x.location_id}`);
  const vehicule_id = texte(formData.get('vehicule_id')) ?? x.vehicule_id;
  if (!vehicule_id) throw new Error('Choisissez le véhicule à réserver.');
  await verifierDisponible(supabase, vehicule_id, x.debut, x.fin);
  let client_id = x.client_id;
  if (!client_id) {
    const morceaux = String(x.client_nom).trim().split(/\s+/);
    const nom = (morceaux.length > 1 ? morceaux.slice(1).join(' ') : morceaux[0]).toUpperCase();
    const prenom = morceaux.length > 1 ? morceaux[0] : null;
    // Client déjà connu (même téléphone, ou même nom) : on reprend sa fiche au lieu d'en créer une deuxième
    const { data: connus } = await supabase.from('clients').select('id, nom, prenom, telephone');
    const existant = (connus ?? []).find((k: any) => memePersonne({ nom, prenom, telephone: x.telephone }, k));
    if (existant) client_id = existant.id;
  }
  if (!client_id) {
    const morceaux = String(x.client_nom).trim().split(/\s+/);
    const nom = (morceaux.length > 1 ? morceaux.slice(1).join(' ') : morceaux[0]).toUpperCase();
    const prenom = morceaux.length > 1 ? morceaux[0] : null;
    const { data: c, error } = await supabase.from('clients').insert({ agence_id: profil.agence_id, nom, prenom, telephone: x.telephone ? tel(x.telephone) : null, email: x.email }).select('id').single();
    verifier(error, 'Création du client');
    client_id = c!.id;
  }
  const { data: v } = await supabase.from('vehicules').select('km').eq('id', vehicule_id).single();
  const { data: l, error } = await supabase.from('locations').insert({
    agence_id: profil.agence_id, vehicule_id, client_id, debut: x.debut, fin_prevue: x.fin, prix_total: x.prix_total,
    km_inclus: x.km_inclus, prix_km_sup: x.prix_km_sup, caution_montant: x.caution, km_depart: v?.km ?? null, note: x.note,
  }).select('id').single();
  verifier(error, 'Création de la réservation');
  await supabase.from('devis').update({ statut: 'accepte', location_id: l!.id, client_id, vehicule_id }).eq('id', id);
  await journal(l!.id, vehicule_id, 'Réservation créée depuis le devis', `D-${String(x.numero).padStart(4, '0')}`);
  rafraichir();
  redirect(`/locations/${l!.id}`);
}

// ---------------------------------------------------------------------------
// Accès employés
// ---------------------------------------------------------------------------
async function _inviterEmploye(formData: FormData) {
  const { supabase, profil } = await utilisateurCourant();
  if (profil.role !== 'gerant') throw new Error('Seul le gérant peut ajouter un accès.');
  const email = (texte(formData.get('email')) ?? '').toLowerCase();
  const nom = texte(formData.get('nom'));
  if (!email || !nom) throw new Error('Indiquez le nom et l\u2019e-mail de l\u2019employé.');
  const acces = String(formData.get('acces') || 'les_deux');
  champAutorise(acces, ['logiciel', 'appli', 'les_deux']);
  let r = await supabase.from('invitations').insert({ agence_id: profil.agence_id, email, nom, role: 'employe', acces });
  if (r.error && /acces/.test(r.error.message)) r = await supabase.from('invitations').insert({ agence_id: profil.agence_id, email, nom, role: 'employe' });
  verifier(r.error, 'Invitation');
  rafraichir();
}

async function _changerAcces(utilisateur: string, formData: FormData) {
  const { supabase, profil } = await utilisateurCourant();
  if (profil.role !== 'gerant') throw new Error('Seul le gérant peut changer les accès.');
  const acces = String(formData.get('acces') || '');
  champAutorise(acces, ['logiciel', 'appli', 'les_deux']);
  verifier((await supabase.rpc('changer_acces', { utilisateur, nouvel_acces: acces })).error, 'Accès');
  rafraichir();
}

async function _annulerInvitation(id: string) {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('invitations').delete().eq('id', id).eq('utilisee', false)).error);
  rafraichir();
}

async function _retirerAcces(id: string) {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.rpc('retirer_acces', { utilisateur: id })).error, 'Retrait de l\u2019accès');
  rafraichir();
}

// ---------------------------------------------------------------------------
// Réglages de l'agence
// ---------------------------------------------------------------------------
async function _majAgence(formData: FormData) {
  const { supabase, profil } = await utilisateurCourant();
  if (profil.role !== 'gerant') throw new Error('Seul le gérant peut modifier les réglages.');
  verifier((await supabase.from('agences').update({
    nom: texte(formData.get('nom')) ?? 'Mon agence',
    siret: texte(formData.get('siret')),
    adresse: texte(formData.get('adresse')),
    telephone: telephoneSaisi(formData.get('telephone')),
    email: texte(formData.get('email')),
    gerant_nom: texte(formData.get('gerant_nom')),
    tva_taux: nombre(formData.get('tva_taux')) ?? 20,
    frais_fps: nombre(formData.get('frais_fps')) ?? 0,
    conditions: texte(formData.get('conditions')),
    forme_juridique: texte(formData.get('forme_juridique')),
    rcs: texte(formData.get('rcs')),
    tva_intra: texte(formData.get('tva_intra')),
    iban: texte(formData.get('iban')),
    site: texte(formData.get('site')),
    couleur: /^#[0-9a-fA-F]{6}$/.test(String(formData.get('couleur'))) ? String(formData.get('couleur')) : '#19F7D6',
    envoi_contrat: formData.get('envoi_contrat') === 'on',
    facture_auto: formData.get('facture_auto') === 'on',
  }).eq('id', profil.agence_id)).error, 'Réglages');
  rafraichir();
}

async function _documentAgence(champ: string, chemin: string) {
  champAutorise(champ, ['gerant_piece_identite_path', 'kbis_path', 'signature_path', 'tampon_path', 'logo_path']);
  const { supabase, profil } = await utilisateurCourant();
  if (profil.role !== 'gerant') throw new Error('Seul le gérant peut modifier ces documents.');
  verifier((await supabase.from('agences').update({ [champ]: chemin }).eq('id', profil.agence_id)).error);
  // Kbis : l'IA lit sa date (alerte au-delà de 3 mois) et complète l'identité de l'agence si elle est vide
  if (champ === 'kbis_path') {
    try {
      const { data: f } = await supabase.storage.from('documents').download(chemin);
      if (f) {
        const type = f.type || (chemin.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
        const r = await lireDocument(`data:${type.startsWith('image/') ? type : 'application/pdf'};base64,${Buffer.from(await f.arrayBuffer()).toString('base64')}`, 'kbis');
        const c = r.champs as any;
        if (c) {
          const { data: a } = await supabase.from('agences').select('rcs, forme_juridique, siret, adresse').eq('id', profil.agence_id).single();
          const maj: Record<string, unknown> = {};
          if (typeof c.date_kbis === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.date_kbis)) maj.kbis_date = c.date_kbis;
          if (!a?.rcs && c.rcs) maj.rcs = c.rcs;
          if (!a?.forme_juridique && c.forme_juridique) maj.forme_juridique = c.forme_juridique;
          if (!a?.adresse && c.adresse) maj.adresse = c.adresse;
          if (Object.keys(maj).length) await supabase.from('agences').update(maj).eq('id', profil.agence_id);
        }
      }
    } catch { /* lecture facultative */ }
  }
  rafraichir();
}

// ---------------------------------------------------------------------------
// Suivi GPS (traceurs Seeworld / WhatsGPS)

// Recale le kilométrage : compteur du véhicule et chiffre du traceur au même moment (sans bloquer si le GPS ne répond pas)
async function recalerTraceur(supabase: any, vehicule_id: string, kmCompteur: number | null) {
  if (kmCompteur == null) return;
  try {
    const { data: v } = await supabase.from('vehicules').select('traceur_id, traceurs(imei)').eq('id', vehicule_id).maybeSingle();
    const imei = (v as any)?.traceurs?.imei;
    if (!v?.traceur_id || !imei) return;
    const e = await imeiDeLAgence(supabase, imei);
    if (e.kmTraceur == null) return;
    await supabase.from('traceurs').update({ km_compteur_ref: kmCompteur, km_traceur_ref: e.kmTraceur, ref_le: new Date().toISOString() }).eq('id', v.traceur_id);
  } catch { /* le suivi GPS ne doit jamais bloquer un état des lieux */ }
}

async function _relierTraceur(vehicule_id: string, formData: FormData) {
  const { supabase, profil } = await utilisateurCourant();
  const imei = texte(formData.get('imei'))?.replace(/\s/g, '');
  if (!imei) throw new Error('Choisissez le boîtier à relier.');
  const e = await imeiDeLAgence(supabase, imei);
  const { data: v } = await supabase.from('vehicules').select('km, immatriculation').eq('id', vehicule_id).single();
  const kmCompteur = nombre(formData.get('km')) ?? v?.km ?? null;
  const ref = kmCompteur != null && e.kmTraceur != null
    ? { km_compteur_ref: kmCompteur, km_traceur_ref: e.kmTraceur, ref_le: new Date().toISOString() } : {};
  const { data: existe } = await supabase.from('traceurs').select('id').eq('imei', imei).maybeSingle();
  let traceur_id = existe?.id;
  if (traceur_id) verifier((await supabase.from('traceurs').update(ref).eq('id', traceur_id)).error);
  else {
    const { data, error } = await supabase.from('traceurs').insert({ agence_id: profil.agence_id, imei, fournisseur: 'seeworld', ...ref }).select('id').single();
    verifier(error, 'Boîtier');
    traceur_id = data!.id;
  }
  await supabase.from('vehicules').update({ traceur_id: null }).eq('traceur_id', traceur_id).neq('id', vehicule_id);
  verifier((await supabase.from('vehicules').update({ traceur_id, ...(kmCompteur != null ? { km: kmCompteur } : {}) }).eq('id', vehicule_id)).error);
  await journal(null, vehicule_id, 'Traceur GPS relié', `IMEI ${imei}`);
  rafraichir();
}

// Importe en un geste les véhicules équipés d'un boîtier : crée la fiche (plaque, marque, modèle lus chez WhatsGPS)
// et relie le traceur ; si la plaque existe déjà dans la flotte, relie seulement le boîtier.
async function _importerVehicules(formData: FormData) {
  const { supabase, profil } = await utilisateurCourant();
  const imeis = formData.getAll('imei').map((x) => String(x).replace(/\D/g, '')).filter((i) => formData.get(`garder_${i}`));
  if (!imeis.length) throw new Error('Cochez au moins un véhicule à importer.');
  let crees = 0, relies = 0; const erreurs: string[] = [];
  for (const imei of imeis) {
    try {
      const plaqueSaisie = immat(formData.get(`immat_${imei}`));
      if (!plaqueSaisie) { erreurs.push(`IMEI ${imei} : plaque manquante`); continue; }
      const e = await imeiDeLAgence(supabase, imei);
      const { data: v0 } = await supabase.from('vehicules').select('id, traceur_id').eq('immatriculation', plaqueSaisie).maybeSingle();
      let vehicule_id = v0?.id as string | undefined;
      if (!vehicule_id) {
        const { data, error } = await supabase.from('vehicules').insert({
          agence_id: profil.agence_id, immatriculation: plaqueSaisie,
          marque: texte(formData.get(`marque_${imei}`)), modele: texte(formData.get(`modele_${imei}`)),
          date_entree: new Date().toISOString().slice(0, 10),
        }).select('id').single();
        verifier(error, `Véhicule ${plaqueSaisie}`);
        vehicule_id = data!.id; crees++;
      } else relies++;
      const { data: t0 } = await supabase.from('traceurs').select('id').eq('imei', imei).maybeSingle();
      let traceur_id = t0?.id as string | undefined;
      if (!traceur_id) {
        const { data, error } = await supabase.from('traceurs').insert({ agence_id: profil.agence_id, imei, fournisseur: 'seeworld' }).select('id').single();
        verifier(error, 'Boîtier'); traceur_id = data!.id;
      }
      await supabase.from('vehicules').update({ traceur_id: null }).eq('traceur_id', traceur_id).neq('id', vehicule_id);
      verifier((await supabase.from('vehicules').update({ traceur_id }).eq('id', vehicule_id)).error);
      await journal(null, vehicule_id!, 'Traceur GPS relié', `IMEI ${imei} · importé depuis le compte de suivi${e.enLigne ? '' : ' (boîtier hors ligne)'}`);
    } catch (err: any) { erreurs.push(`IMEI ${imei} : ${err?.message ?? 'erreur'}`); }
  }
  rafraichir();
  if (erreurs.length) throw new Error(`${crees} véhicule${crees > 1 ? 's' : ''} créé${crees > 1 ? 's' : ''}, ${relies} relié${relies > 1 ? 's' : ''}. À reprendre : ${erreurs.join(' ; ')}`);
}

async function _delierTraceur(vehicule_id: string) {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('vehicules').update({ traceur_id: null }).eq('id', vehicule_id)).error);
  await journal(null, vehicule_id, 'Traceur GPS retiré');
  rafraichir();
}

async function _moteur(vehicule_id: string, couper: boolean) {
  const { supabase, profil } = await utilisateurCourant();
  const { data: v } = await supabase.from('vehicules').select('traceur_id, traceurs(imei)').eq('id', vehicule_id).single();
  const imei = (v as any)?.traceurs?.imei;
  if (!imei) throw new Error('Aucun traceur relié à ce véhicule.');
  await imeiDeLAgence(supabase, imei);
  const r = await commandeMoteur(imei, couper);
  await supabase.from('traceurs').update({ moteur_coupe: couper }).eq('id', v!.traceur_id);
  await journal(null, vehicule_id, couper ? 'Moteur coupé à distance' : 'Moteur remis en route',
    `${profil.nom}${r.enLigne ? '' : ' · boîtier hors ligne, la commande partira à sa reconnexion'}`);
  rafraichir();
  if (!r.enLigne) throw new Error(`Commande enregistrée, mais le boîtier est hors ligne : elle s'appliquera dès qu'il se reconnecte.`);
}

async function _reporterKm(vehicule_id: string, kmCompteur: number) {
  const { supabase } = await utilisateurCourant();
  verifier((await supabase.from('vehicules').update({ km: Math.round(kmCompteur) }).eq('id', vehicule_id)).error);
  rafraichir();
}

// ---------------------------------------------------------------------------
export const ajouterVehicule = proteger(_ajouterVehicule);
export const majVehicule = proteger(_majVehicule);
export const statutVehicule = proteger(_statutVehicule);
export const documentVehicule = proteger(_documentVehicule);
export const enregistrerAttestation = proteger(_enregistrerAttestation);
export const ajouterEntretien = proteger(_ajouterEntretien);
export const demarrerEntretien = proteger(_demarrerEntretien);
export const terminerEntretien = proteger(_terminerEntretien);
export const devisEntretien = proteger(_devisEntretien);
export const noteEntretien = proteger(_noteEntretien);
export const preterVehicule = proteger(_preterVehicule);
export const encaisserPret = proteger(_encaisserPret);
export const reglerEmprunt = proteger(_reglerEmprunt);
export const rendreEmprunt = proteger(_rendreEmprunt);
export const majEntretien = proteger(_majEntretien);
export const ajouterDommage = proteger(_ajouterDommage);
export const photoDommage = proteger(_photoDommage);
export const statutDommage = proteger(_statutDommage);
export const ajouterClient = proteger(_ajouterClient);
export const majClient = proteger(_majClient);
export const documentClient = proteger(_documentClient);
export const listeNoire = proteger(_listeNoire);
export const creerLocation = proteger(_creerLocation);
export const prolonger = proteger(_prolonger);
export const ajusterPlanning = proteger(_ajusterPlanning);
export const changerVoiture = proteger(_changerVoiture);
export const deplacerReservation = proteger(_deplacerReservation);
export const annulerLocation = proteger(_annulerLocation);
export const cautionLocation = proteger(_cautionLocation);
export const signatureContrat = proteger(_signatureContrat);
export const noteLocation = proteger(_noteLocation);
export const ouvrirEdl = proteger(_ouvrirEdl);
export const photoEdl = proteger(_photoEdl);
export const majEdl = proteger(_majEdl);
export const signatureEdl = proteger(_signatureEdl);
export const positionEdl = proteger(_positionEdl);
export const terminerEdl = proteger(_terminerEdl);
export const validerComparaison = proteger(_validerComparaison);
export const ajouterAmende = proteger(_ajouterAmende);
export const ajouterFps = proteger(_ajouterFps);
export const statutFps = proteger(_statutFps);
export const payeTresorFps = proteger(_payeTresorFps);
export const clientFps = proteger(_clientFps);
export const fraisFps = proteger(_fraisFps);
export const relancerFps = proteger(_relancerFps);
export const retenirCautionFps = proteger(_retenirCautionFps);
export const statutAmende = proteger(_statutAmende);
export const avisAmende = proteger(_avisAmende);
export const clientAmende = proteger(_clientAmende);
export const majAgence = proteger(_majAgence);
export const ajouterDepense = proteger(_ajouterDepense);
export const ajouterPiece = proteger(_ajouterPiece);
export const creerDevis = proteger(_creerDevis);
export const statutDevis = proteger(_statutDevis);
export const transformerDevis = proteger(_transformerDevis);
export const inviterEmploye = proteger(_inviterEmploye);
export const annulerInvitation = proteger(_annulerInvitation);
export const changerAcces = proteger(_changerAcces);
export const retirerAcces = proteger(_retirerAcces);
export const sortirVehicule = proteger(_sortirVehicule);
export const photoModele = proteger(_photoModele);
export const remettreVehicule = proteger(_remettreVehicule);
export const documentAgence = proteger(_documentAgence);
export const relierTraceur = proteger(_relierTraceur);
export const delierTraceur = proteger(_delierTraceur);
export const importerVehicules = proteger(_importerVehicules);

// Parcours découverte : un écran ouvert ou un outil essayé pour la première fois (une seule trace par découverte)
export async function marquerDecouverte(cle: string) {
  if (!/^[a-z]{2,20}$/.test(cle)) return;
  try {
    const { supabase, profil } = await utilisateurCourant();
    const action = `Découverte : ${cle}`;
    const { count } = await supabase.from('historique').select('id', { count: 'exact', head: true }).eq('action', action);
    if (!count) await supabase.from('historique').insert({ agence_id: profil.agence_id, action, auteur: profil.id });
  } catch { /* le parcours ne doit jamais gêner le travail */ }
}
export const moteur = proteger(_moteur);
export const reporterKm = proteger(_reporterKm);
