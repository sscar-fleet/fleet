'use server';
// Paiements en ligne du loueur (Stripe Connect). Toutes les écritures passent par la clé de service,
// après avoir vérifié avec la session de l'utilisateur (RLS) que la location ou le paiement est bien à son agence.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { utilisateurCourant, verifier } from '@/lib/agence';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { texte, nombre, euros, joursEntre } from '@/lib/format';
import { stripe, centimes, signerEtat, creerCompteLoueur, lienInscription, JOURS_EMPREINTE, type OptionsPaiement, OPTIONS } from '@/lib/stripe';

type Resultat = { erreur?: string; message?: string } | void;
function proteger<A extends any[]>(fn: (...a: A) => Promise<Resultat>) {
  return async (...a: A): Promise<Resultat> => {
    try { return await fn(...a); } catch (e: any) {
      if (typeof e?.digest === 'string' && e.digest.startsWith('NEXT_')) throw e;
      return { erreur: e?.message || 'Une erreur est survenue.' };
    }
  };
}
const origine = () => { const h = headers(); return `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`; };
const rafraichir = () => revalidatePath('/', 'layout');

async function gerant() {
  const u = await utilisateurCourant();
  if (u.profil.role !== 'gerant') throw new Error('Seul le gérant peut régler les paiements en ligne.');
  return u;
}

async function journal(admin: any, agence_id: string, location_id: string | null, action: string, detail: string, auteur?: string) {
  await admin.from('historique').insert({ agence_id, location_id, action, detail, auteur: auteur ?? null });
}

// ---------------------------------------------------------------------------
// Relier le compte Stripe du loueur
// ---------------------------------------------------------------------------
async function _connecterStripe(): Promise<Resultat> {
  const { supabase, profil } = await gerant();
  const admin = supabaseAdmin();
  const { data: a } = await supabase.from('agences').select('nom, email, site').eq('id', profil.agence_id).single();
  let { data: sc } = await admin.from('stripe_comptes').select('compte, relie_par').eq('agence_id', profil.agence_id).maybeSingle();
  if (!sc) {
    const compte = await creerCompteLoueur({ agenceId: profil.agence_id, nom: a?.nom, email: a?.email });
    verifier((await admin.from('stripe_comptes').insert({ agence_id: profil.agence_id, compte: compte.id, relie_par: 'creation' })).error);
    sc = { compte: compte.id, relie_par: 'creation' };
  }
  if (sc.relie_par === 'existant') { redirect('https://dashboard.stripe.com'); }
  const url = await lienInscription(sc.compte, origine());
  redirect(url);
}

async function _connecterExistant(): Promise<Resultat> {
  const { profil } = await gerant();
  const id = process.env.STRIPE_CONNECT_CLIENT_ID;
  if (!id) throw new Error('La connexion d’un compte Stripe existant n’est pas encore activée.');
  const q = new URLSearchParams({ response_type: 'code', client_id: id, scope: 'read_write', state: signerEtat(profil.agence_id), redirect_uri: `${origine()}/api/stripe/oauth` });
  redirect(`https://connect.stripe.com/oauth/authorize?${q}`);
}

async function _optionsPaiement(formData: FormData): Promise<Resultat> {
  const { supabase, profil } = await gerant();
  const p: OptionsPaiement = {};
  for (const o of OPTIONS) p[o.cle] = formData.get(o.cle) === 'on';
  verifier((await supabase.from('agences').update({ paiements: p }).eq('id', profil.agence_id)).error);
  rafraichir();
  return { message: 'Paiements en ligne enregistrés' };
}

// ---------------------------------------------------------------------------
// Demander un paiement au client (lien Stripe)
// ---------------------------------------------------------------------------
async function contexte(locationId: string) {
  const { supabase, profil } = await utilisateurCourant();
  const { data: l } = await supabase.from('locations').select('id, numero, agence_id, debut, fin_prevue, prix_total, caution_montant, statut, vehicules(immatriculation, marque, modele), clients(id, nom, prenom, email, telephone)').eq('id', locationId).maybeSingle();
  if (!l) throw new Error('Location introuvable.');
  const admin = supabaseAdmin();
  const [{ data: sc }, { data: ag }] = await Promise.all([
    admin.from('stripe_comptes').select('compte, pret').eq('agence_id', profil.agence_id).maybeSingle(),
    supabase.from('agences').select('nom, paiements, commission_pct').eq('id', profil.agence_id).single(),
  ]);
  if (!sc?.pret) throw new Error('Reliez d’abord votre compte Stripe dans Réglages, Paiements en ligne.');
  return { supabase, profil, admin, l: l as any, compte: sc.compte as string, agence: ag as any };
}

async function _demanderPaiement(locationId: string, type: 'location' | 'caution' | 'prolongation' | 'frais', formData: FormData): Promise<Resultat> {
  const { profil, admin, l, compte, agence } = await contexte(locationId);
  if (!(agence.paiements ?? {})[type]) throw new Error('Ce paiement n’est pas activé dans vos réglages.');
  const montant = nombre(formData.get('montant'));
  if (!montant || montant < 0.5) throw new Error('Indiquez un montant (0,50 € minimum).');
  const v = l.vehicules; const c = l.clients;
  const voiture = [v?.marque, v?.modele].filter(Boolean).join(' ') || v?.immatriculation || 'véhicule';
  const motif = texte(formData.get('motif'));
  const libelle = type === 'location' ? `Location ${voiture} · contrat n° ${l.numero}`
    : type === 'caution' ? `Caution · ${voiture} · contrat n° ${l.numero}`
    : type === 'prolongation' ? `Prolongation · ${voiture} · contrat n° ${l.numero}${motif ? ' · ' + motif : ''}`
    : `${motif || 'Frais'} · contrat n° ${l.numero}`;
  // Caution : empreinte si la location est courte, sinon carte enregistrée (une empreinte ne tient qu'environ 7 jours)
  const mode = type !== 'caution' ? 'paiement' : joursEntre(new Date().toISOString(), l.fin_prevue) <= JOURS_EMPREINTE ? 'empreinte' : 'carte';

  const { data: p, error } = await admin.from('paiements').insert({
    agence_id: profil.agence_id, location_id: l.id, client_id: c?.id ?? null, type, libelle, montant, mode, motif, auteur: profil.id,
  }).select('id').single();
  verifier(error);
  const o = origine();
  const meta = { paiement_id: p.id, agence_id: profil.agence_id, location_id: l.id };
  const retour = { success_url: `${o}/paye?r=ok&p=${p.id}`, cancel_url: `${o}/paye?r=annule&p=${p.id}` };
  const frais = Number(agence.commission_pct) > 0 && mode !== 'carte' ? Math.round(centimes(montant) * Number(agence.commission_pct) / 100) : undefined;
  let session: any;
  try {
    if (mode === 'carte') {
      const client = await stripe('customers', { email: c?.email || undefined, name: [c?.prenom, c?.nom].filter(Boolean).join(' ') || undefined, phone: c?.telephone || undefined, metadata: { client_id: c?.id ?? '' } }, { compte });
      session = await stripe('checkout/sessions', {
        mode: 'setup', customer: client.id, currency: 'eur', locale: 'fr', payment_method_types: ['card'], ...retour,
        setup_intent_data: { description: `${libelle} (${euros(montant)}, débitée seulement en cas de dégâts)`, metadata: meta },
        custom_text: { submit: { message: `Votre carte est enregistrée comme caution de ${euros(montant)} par ${agence.nom}. Elle ne sera débitée qu'en cas de dégâts ou de frais, après vous en avoir informé.` } },
        metadata: meta,
      }, { compte });
    } else {
      session = await stripe('checkout/sessions', {
        mode: 'payment', locale: 'fr', customer_email: c?.email || undefined, ...retour,
        line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: centimes(montant), product_data: { name: libelle } } }],
        payment_intent_data: {
          description: libelle, metadata: meta, application_fee_amount: frais,
          ...(mode === 'empreinte' ? { capture_method: 'manual' } : {}),
        },
        // Une caution se bloque uniquement sur une carte (Klarna, Revolut Pay… ne savent pas « bloquer puis libérer »)
        ...(mode === 'empreinte' ? { payment_method_types: ['card'] } : {}),
        ...(mode === 'empreinte' ? { custom_text: { submit: { message: `Ce montant est seulement bloqué sur votre carte comme caution. Il sera libéré au retour du véhicule si tout est en ordre.` } } } : {}),
        metadata: meta,
      }, { compte });
    }
  } catch (e) {
    await admin.from('paiements').update({ statut: 'echoue', updated_at: new Date().toISOString() }).eq('id', p.id);
    throw e;
  }
  await admin.from('paiements').update({ stripe_session: session.id, lien: session.url, expire_le: new Date(session.expires_at * 1000).toISOString() }).eq('id', p.id);
  await journal(admin, profil.agence_id, l.id, 'Lien de paiement', `${libelle} · ${euros(montant)}`, profil.id);
  rafraichir();
  return { message: 'Lien de paiement prêt : envoyez-le au client' };
}

// ---------------------------------------------------------------------------
// Actions sur un paiement existant
// ---------------------------------------------------------------------------
async function paiementDeLAgence(id: string) {
  const { supabase, profil } = await utilisateurCourant();
  const { data: p } = await supabase.from('paiements').select('*').eq('id', id).maybeSingle();
  if (!p) throw new Error('Paiement introuvable.');
  const admin = supabaseAdmin();
  const { data: sc } = await admin.from('stripe_comptes').select('compte').eq('agence_id', profil.agence_id).maybeSingle();
  if (!sc) throw new Error('Compte Stripe non relié.');
  return { p: p as any, admin, compte: sc.compte as string, profil, supabase };
}
const maintenant = () => new Date().toISOString();

// Garder tout ou partie de la caution
async function _retenirCaution(id: string, formData: FormData): Promise<Resultat> {
  const { p, admin, compte, profil } = await paiementDeLAgence(id);
  const montant = nombre(formData.get('montant'));
  const motif = texte(formData.get('motif'));
  if (!montant || montant < 0.5) throw new Error('Indiquez le montant à garder.');
  if (montant > Number(p.montant)) throw new Error(`Au maximum ${euros(p.montant)}.`);
  if (!motif) throw new Error('Indiquez le motif (rayure, carburant…).');
  if (p.mode === 'empreinte' && p.statut === 'autorise') {
    await stripe(`payment_intents/${p.stripe_intent}/capture`, { amount_to_capture: centimes(montant) }, { compte });
  } else if (p.mode === 'carte' && p.statut === 'carte_enregistree') {
    const pi = await stripe('payment_intents', {
      amount: centimes(montant), currency: 'eur', customer: p.stripe_client, payment_method: p.stripe_moyen,
      off_session: true, confirm: true, description: `Retenue sur caution · ${motif}`, metadata: { paiement_id: p.id },
    }, { compte, cle: `retenue-${p.id}-${centimes(montant)}` });
    if (pi.status !== 'succeeded') throw new Error('La banque du client demande une validation : envoyez-lui un lien de paiement pour ces frais.');
  } else throw new Error('Cette caution ne peut plus être retenue.');
  await admin.from('paiements').update({ statut: 'retenu', retenu: montant, motif, updated_at: maintenant() }).eq('id', p.id);
  if (p.location_id) await admin.from('locations').update({ caution_statut: 'encaissee', caution_retenue: montant, caution_motif: motif }).eq('id', p.location_id);
  await journal(admin, profil.agence_id, p.location_id, 'Caution retenue', `${euros(montant)} · ${motif}`, profil.id);
  rafraichir();
  return { message: `${euros(montant)} retenus sur la caution` };
}

// Rendre la caution (libérer l'empreinte ou ne plus garder la carte)
async function _libererCaution(id: string): Promise<Resultat> {
  const { p, admin, compte, profil } = await paiementDeLAgence(id);
  if (p.mode === 'empreinte' && p.statut === 'autorise') await stripe(`payment_intents/${p.stripe_intent}/cancel`, {}, { compte, methode: 'POST' });
  else if (p.mode === 'carte' && p.statut === 'carte_enregistree') { if (p.stripe_moyen) await stripe(`payment_methods/${p.stripe_moyen}/detach`, {}, { compte, methode: 'POST' }).catch(() => null); }
  else throw new Error('Cette caution n’est plus active.');
  await admin.from('paiements').update({ statut: 'libere', updated_at: maintenant() }).eq('id', p.id);
  if (p.location_id) await admin.from('locations').update({ caution_statut: 'rendue' }).eq('id', p.location_id);
  await journal(admin, profil.agence_id, p.location_id, 'Caution rendue', euros(p.montant), profil.id);
  rafraichir();
  return { message: 'Caution rendue au client' };
}

// Débiter des frais sur la carte enregistrée (caution longue durée)
async function _debiterCarte(locationId: string, formData: FormData): Promise<Resultat> {
  const { profil, admin, l, compte, agence } = await contexte(locationId);
  if (!(agence.paiements ?? {}).frais) throw new Error('Les frais après coup ne sont pas activés dans vos réglages.');
  const montant = nombre(formData.get('montant')); const motif = texte(formData.get('motif'));
  if (!montant || montant < 0.5) throw new Error('Indiquez un montant (0,50 € minimum).');
  if (!motif) throw new Error('Indiquez le motif des frais.');
  const { data: carte } = await admin.from('paiements').select('*').eq('location_id', l.id).eq('statut', 'carte_enregistree').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!carte) throw new Error('Pas de carte enregistrée pour cette location : envoyez un lien de paiement.');
  const libelle = `${motif} · contrat n° ${l.numero}`;
  const { data: p } = await admin.from('paiements').insert({ agence_id: profil.agence_id, location_id: l.id, client_id: carte.client_id, type: 'frais', libelle, montant, mode: 'paiement', motif, auteur: profil.id }).select('id').single();
  try {
    const pi = await stripe('payment_intents', {
      amount: centimes(montant), currency: 'eur', customer: carte.stripe_client, payment_method: carte.stripe_moyen, off_session: true, confirm: true,
      description: libelle, metadata: { paiement_id: p.id, agence_id: profil.agence_id, location_id: l.id },
      application_fee_amount: Number(agence.commission_pct) > 0 ? Math.round(centimes(montant) * Number(agence.commission_pct) / 100) : undefined,
    }, { compte, cle: `frais-${p.id}` });
    const ok = pi.status === 'succeeded';
    await admin.from('paiements').update({ statut: ok ? 'paye' : 'echoue', stripe_intent: pi.id, paye_le: ok ? maintenant() : null, updated_at: maintenant() }).eq('id', p.id);
    if (!ok) throw new Error('La banque du client demande une validation : envoyez-lui plutôt un lien de paiement.');
  } catch (e) {
    await admin.from('paiements').update({ statut: 'echoue', updated_at: maintenant() }).eq('id', p.id).eq('statut', 'en_attente');
    throw e;
  }
  await journal(admin, profil.agence_id, l.id, 'Frais débités', `${euros(montant)} · ${motif}`, profil.id);
  rafraichir();
  return { message: `${euros(montant)} débités sur la carte du client` };
}

async function _rembourser(id: string): Promise<Resultat> {
  const { p, admin, compte, profil } = await paiementDeLAgence(id);
  if (!['paye', 'retenu'].includes(p.statut) || !p.stripe_intent) throw new Error('Ce paiement ne peut pas être remboursé.');
  await stripe('refunds', { payment_intent: p.stripe_intent, metadata: { paiement_id: p.id } }, { compte, cle: `remb-${p.id}` });
  await admin.from('paiements').update({ statut: 'rembourse', rembourse: p.statut === 'retenu' ? p.retenu : p.montant, updated_at: maintenant() }).eq('id', p.id);
  await journal(admin, profil.agence_id, p.location_id, 'Remboursement', `${p.libelle} · ${euros(p.statut === 'retenu' ? p.retenu : p.montant)}`, profil.id);
  rafraichir();
  return { message: 'Remboursement envoyé au client' };
}

async function _annulerLien(id: string): Promise<Resultat> {
  const { p, admin, compte, profil } = await paiementDeLAgence(id);
  if (p.statut !== 'en_attente') throw new Error('Ce lien n’est plus en attente.');
  if (p.stripe_session) await stripe(`checkout/sessions/${p.stripe_session}/expire`, {}, { compte, methode: 'POST' }).catch(() => null);
  await admin.from('paiements').update({ statut: 'annule', updated_at: maintenant() }).eq('id', p.id);
  await journal(admin, profil.agence_id, p.location_id, 'Lien de paiement annulé', p.libelle, profil.id);
  rafraichir();
  return { message: 'Lien annulé' };
}

export const connecterStripe = proteger(_connecterStripe);
export const connecterExistant = proteger(_connecterExistant);
export const optionsPaiement = proteger(_optionsPaiement);
export const demanderPaiement = proteger(_demanderPaiement);
export const retenirCaution = proteger(_retenirCaution);
export const libererCaution = proteger(_libererCaution);
export const debiterCarte = proteger(_debiterCarte);
export const rembourser = proteger(_rembourser);
export const annulerLien = proteger(_annulerLien);
