import { NextResponse } from 'next/server';
import { supabaseServeur } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { lireEtat, rafraichirCompte } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

// Retour de la connexion d'un compte Stripe que le loueur avait déjà
export async function GET(request: Request) {
  const url = new URL(request.url);
  const vers = (q: string) => NextResponse.redirect(new URL(`/parametres?stripe=${q}#paiements`, request.url));
  if (url.searchParams.get('error')) return vers('annule');
  const agence = lireEtat(url.searchParams.get('state'));
  const code = url.searchParams.get('code');
  if (!agence || !code) return vers('refus');
  const supabase = supabaseServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL('/login', request.url));
  const { data: u } = await supabase.from('utilisateurs').select('agence_id, role').eq('id', auth.user.id).maybeSingle();
  if (!u || u.role !== 'gerant' || u.agence_id !== agence) return vers('refus');
  const r = await fetch('https://connect.stripe.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_secret: process.env.STRIPE_SECRET_KEY ?? '' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.stripe_user_id) return vers('erreur');
  const admin = supabaseAdmin();
  const { error } = await admin.from('stripe_comptes').upsert({ agence_id: agence, compte: j.stripe_user_id, relie_par: 'existant', updated_at: new Date().toISOString() });
  if (error) return vers(error.code === '23505' ? 'deja' : 'erreur');
  const a = await rafraichirCompte(admin, j.stripe_user_id).catch(() => null);
  return vers(a?.charges_enabled ? 'ok' : 'incomplet');
}
