// Stripe Connect (comptes « standard ») : chaque loueur encaisse sur son propre compte Stripe.
// Fleet appelle Stripe au nom du loueur (en-tête Stripe-Account) ; l'argent ne passe jamais par Fleet.
import crypto from 'crypto';

export const stripeConfigure = () => !!process.env.STRIPE_SECRET_KEY;
export const modeTest = () => (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test');

export type OptionsPaiement = { location?: boolean; caution?: boolean; prolongation?: boolean; frais?: boolean };
export const OPTIONS: { cle: keyof OptionsPaiement; titre: string; detail: string }[] = [
  { cle: 'location', titre: 'Paiement de la location', detail: 'Le client paie sa location en ligne, par un lien.' },
  { cle: 'caution', titre: 'Caution par carte', detail: 'Montant bloqué sur la carte (ou carte enregistrée pour les longues locations), débité seulement en cas de souci.' },
  { cle: 'prolongation', titre: 'Prolongations', detail: 'Lien de paiement envoyé quand le client prolonge.' },
  { cle: 'frais', titre: 'Frais après coup', detail: 'Dégâts, carburant, retard, frais d’amende : lien de paiement ou débit de la carte enregistrée.' },
];

// Une empreinte bancaire ne tient qu'environ 7 jours : au-delà, on enregistre la carte à la place
export const JOURS_EMPREINTE = 6;

export function encoder(obj: Record<string, any>, prefixe = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const cle = prefixe ? `${prefixe}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => typeof x === 'object' ? out.push(...encoder(x, `${cle}[${i}]`)) : out.push(`${encodeURIComponent(`${cle}[${i}]`)}=${encodeURIComponent(String(x))}`));
    else if (typeof v === 'object') out.push(...encoder(v, cle));
    else out.push(`${encodeURIComponent(cle)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export class ErreurStripe extends Error { code?: string; constructor(m: string, code?: string) { super(m); this.code = code; } }

// Appel à l'API Stripe. compte = acct_… du loueur (appel en son nom).
export async function stripe<T = any>(chemin: string, params: Record<string, any> = {}, { compte, methode, cle }: { compte?: string; methode?: 'GET' | 'POST' | 'DELETE'; cle?: string } = {}): Promise<T> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new ErreurStripe('Les paiements en ligne ne sont pas encore activés sur Fleet.');
  const m = methode ?? (Object.keys(params).length ? 'POST' : 'GET');
  const corps = encoder(params).join('&');
  const url = `https://api.stripe.com/v1/${chemin}${m === 'GET' && corps ? `?${corps}` : ''}`;
  const r = await fetch(url, {
    method: m, cache: 'no-store', signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20',
      ...(compte ? { 'Stripe-Account': compte } : {}), ...(cle ? { 'Idempotency-Key': cle } : {}),
    },
    body: m === 'GET' ? undefined : corps,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErreurStripe(traduire(j?.error), j?.error?.code);
  return j as T;
}

// Messages Stripe les plus courants, en français
function traduire(e: any): string {
  const code = e?.decline_code || e?.code;
  const t: Record<string, string> = {
    card_declined: 'La carte a été refusée.', insufficient_funds: 'Fonds insuffisants sur la carte.', expired_card: 'La carte a expiré.',
    authentication_required: 'La banque du client demande une validation : envoyez-lui plutôt un lien de paiement.',
    amount_too_small: 'Montant trop faible (minimum 0,50 €).', payment_intent_unexpected_state: 'Ce paiement a déjà été traité.',
    account_invalid: 'Le compte Stripe du loueur n’est plus relié.', charge_already_refunded: 'Déjà remboursé.',
  };
  return (code && t[code]) || e?.message || 'Stripe ne répond pas pour le moment. Réessayez.';
}

export const centimes = (euros: number) => Math.round(euros * 100);

// Vérification de la signature des notifications Stripe (webhook)
export function verifierSignature(corps: string, entete: string | null, secret: string, tolerance = 300): boolean {
  if (!entete) return false;
  const parts = Object.fromEntries(entete.split(',').map((p) => p.split('=') as [string, string]).filter((x) => x.length === 2));
  const t = Number(parts.t); const v1s = entete.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !v1s.length || Math.abs(Date.now() / 1000 - t) > tolerance) return false;
  const attendu = crypto.createHmac('sha256', secret).update(`${t}.${corps}`).digest('hex');
  return v1s.some((v) => v.length === attendu.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(attendu)));
}

// Jeton signé pour le retour de la connexion d'un compte Stripe existant (anti-détournement)
export function signerEtat(agenceId: string): string {
  const t = Date.now().toString(36);
  const s = crypto.createHmac('sha256', process.env.STRIPE_SECRET_KEY ?? '').update(`${agenceId}.${t}`).digest('hex').slice(0, 32);
  return `${agenceId}.${t}.${s}`;
}
export function lireEtat(etat: string | null): string | null {
  const [a, t, s] = (etat ?? '').split('.');
  if (!a || !t || !s) return null;
  if (Date.now() - parseInt(t, 36) > 3600_000) return null;
  const attendu = crypto.createHmac('sha256', process.env.STRIPE_SECRET_KEY ?? '').update(`${a}.${t}`).digest('hex').slice(0, 32);
  return attendu === s ? a : null;
}

// API Stripe « v2 » (JSON) : création des comptes connectés et liens d'inscription (Accounts v2)
const VERSION_V2 = '2026-09-30.preview';
export async function stripeV2<T = any>(chemin: string, corps?: Record<string, any>, { methode, cle }: { methode?: 'GET' | 'POST'; cle?: string } = {}): Promise<T> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new ErreurStripe('Les paiements en ligne ne sont pas encore activés sur Fleet.');
  const m = methode ?? (corps ? 'POST' : 'GET');
  const r = await fetch(`https://api.stripe.com/v2/${chemin}`, {
    method: m, cache: 'no-store', signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', 'Stripe-Version': VERSION_V2, ...(cle ? { 'Idempotency-Key': cle } : {}) },
    body: m === 'GET' ? undefined : JSON.stringify(corps ?? {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErreurStripe(traduire(j?.error), j?.error?.code);
  return j as T;
}

// Compte du loueur : il encaisse lui-même (marchand), a son propre tableau de bord Stripe complet,
// paie lui-même les frais Stripe et Stripe porte le risque (Fleet ne porte aucune perte).
export async function creerCompteLoueur(a: { agenceId: string; nom?: string | null; email?: string | null }) {
  return stripeV2<{ id: string }>('core/accounts', {
    contact_email: a.email || undefined,
    display_name: a.nom || undefined,
    dashboard: 'full',
    // Plateforme en France : les informations d'identité (raison sociale, type d'entreprise…) ne peuvent pas être envoyées par Fleet,
    // c'est le loueur qui les saisit lui-même dans le formulaire d'inscription Stripe.
    configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
    defaults: { currency: 'eur', locales: ['fr-FR'], responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' } },
    metadata: { agence_id: a.agenceId, origine: 'SS CAR FLEET' },
  }, { cle: `compte-v2b-${a.agenceId}` });
}

export async function lienInscription(compte: string, origine: string) {
  const l = await stripeV2<{ url: string }>('core/account_links', {
    account: compte,
    use_case: { type: 'account_onboarding', account_onboarding: {
      collection_options: { fields: 'currently_due' },
      return_url: `${origine}/api/stripe/retour`, refresh_url: `${origine}/api/stripe/retour?relancer=1`,
    } },
  });
  return l.url;
}

// Met à jour l'état du compte Stripe d'un loueur (après inscription ou notification)
export async function rafraichirCompte(admin: any, compte: string) {
  let pret = false; let virements = false;
  try {
    const a = await stripeV2(`core/accounts/${compte}?include=configuration.merchant&include=requirements`, undefined, { methode: 'GET' });
    const cap = a?.configuration?.merchant?.capabilities ?? {};
    pret = cap?.card_payments?.status === 'active';
    virements = pret && !(a?.requirements?.entries ?? []).some((e: any) => ['currently_due', 'past_due'].includes(e?.minimum_deadline?.status));
  } catch {
    // Compte relié par l'ancienne méthode (compte Stripe existant) : lecture classique
    const a = await stripe(`accounts/${compte}`, {}, { methode: 'GET' });
    pret = !!a.charges_enabled; virements = !!a.payouts_enabled;
  }
  await admin.from('stripe_comptes').update({ pret, virements, updated_at: new Date().toISOString() }).eq('compte', compte);
  return { charges_enabled: pret, payouts_enabled: virements };
}
