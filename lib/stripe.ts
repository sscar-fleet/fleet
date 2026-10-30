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

function encoder(obj: Record<string, any>, prefixe = ''): string[] {
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

// Met à jour l'état du compte Stripe d'un loueur (après inscription ou notification)
export async function rafraichirCompte(admin: any, compte: string) {
  const a = await stripe(`accounts/${compte}`, {}, { methode: 'GET' });
  await admin.from('stripe_comptes').update({ pret: !!a.charges_enabled, virements: !!a.payouts_enabled, updated_at: new Date().toISOString() }).eq('compte', compte);
  return a;
}
