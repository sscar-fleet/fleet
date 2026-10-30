import { NextResponse } from 'next/server';
import { supabaseServeur } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { rafraichirCompte, stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

// Retour du loueur après son inscription Stripe : on relit l'état du compte, ou on relance l'inscription si le lien a expiré
export async function GET(request: Request) {
  const url = new URL(request.url);
  const vers = (q: string) => NextResponse.redirect(new URL(`/parametres?stripe=${q}#paiements`, request.url));
  const supabase = supabaseServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL('/login', request.url));
  const { data: u } = await supabase.from('utilisateurs').select('agence_id, role').eq('id', auth.user.id).maybeSingle();
  if (!u || u.role !== 'gerant') return vers('refus');
  const admin = supabaseAdmin();
  const { data: sc } = await admin.from('stripe_comptes').select('compte').eq('agence_id', u.agence_id).maybeSingle();
  if (!sc) return vers('absent');
  try {
    if (url.searchParams.get('relancer')) {
      const o = `${url.protocol}//${url.host}`;
      const lien = await stripe('account_links', { account: sc.compte, type: 'account_onboarding', refresh_url: `${o}/api/stripe/retour?relancer=1`, return_url: `${o}/api/stripe/retour` });
      return NextResponse.redirect(lien.url);
    }
    const a = await rafraichirCompte(admin, sc.compte);
    return vers(a.charges_enabled ? 'ok' : 'incomplet');
  } catch { return vers('erreur'); }
}
