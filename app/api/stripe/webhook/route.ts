import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifierSignature, stripe, rafraichirCompte } from '@/lib/stripe';
import { euros } from '@/lib/format';

export const dynamic = 'force-dynamic';

// Notifications Stripe (comptes connectés des loueurs) : paiement reçu, caution bloquée, carte enregistrée, lien expiré…
export async function POST(request: Request) {
  const corps = await request.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !verifierSignature(corps, request.headers.get('stripe-signature'), secret)) return new NextResponse('signature', { status: 400 });
  const evt = JSON.parse(corps);
  const admin = supabaseAdmin();
  const o = evt.data?.object ?? {};
  const compte: string | undefined = evt.account;
  const maintenant = new Date().toISOString();

  // Le paiement visé, en vérifiant qu'il appartient bien au loueur dont le compte envoie la notification
  async function paiement(id?: string) {
    if (!id || !compte) return null;
    const { data: p } = await admin.from('paiements').select('*').eq('id', id).maybeSingle();
    if (!p) return null;
    const { data: sc } = await admin.from('stripe_comptes').select('compte').eq('agence_id', p.agence_id).maybeSingle();
    return sc?.compte === compte ? p : null;
  }
  const journal = (p: any, action: string, detail: string) => admin.from('historique').insert({ agence_id: p.agence_id, location_id: p.location_id, action, detail });

  try {
    switch (evt.type) {
      case 'checkout.session.completed': {
        const p = await paiement(o.metadata?.paiement_id);
        if (!p || p.statut !== 'en_attente') break;
        if (o.mode === 'setup') {
          const si = await stripe(`setup_intents/${o.setup_intent}`, {}, { compte, methode: 'GET' });
          await admin.from('paiements').update({ statut: 'carte_enregistree', stripe_intent: si.id, stripe_client: o.customer, stripe_moyen: si.payment_method, paye_le: maintenant, updated_at: maintenant }).eq('id', p.id);
          if (p.location_id) await admin.from('locations').update({ caution_statut: 'prise', caution_montant: p.montant }).eq('id', p.location_id);
          await journal(p, 'Caution en ligne', `Carte enregistrée en garantie (${euros(p.montant)})`);
        } else {
          const pi = await stripe(`payment_intents/${o.payment_intent}`, {}, { compte, methode: 'GET' });
          const autorise = pi.status === 'requires_capture';
          const paye = pi.status === 'succeeded';
          if (!autorise && !paye) break;
          await admin.from('paiements').update({ statut: autorise ? 'autorise' : 'paye', stripe_intent: pi.id, paye_le: maintenant, updated_at: maintenant }).eq('id', p.id);
          if (p.type === 'caution' && p.location_id) await admin.from('locations').update({ caution_statut: 'prise', caution_montant: p.montant }).eq('id', p.location_id);
          await journal(p, autorise ? 'Caution en ligne' : 'Paiement reçu', `${p.libelle} · ${euros(p.montant)}${autorise ? ' bloqués sur la carte' : ''}`);
        }
        break;
      }
      case 'checkout.session.expired': {
        const p = await paiement(o.metadata?.paiement_id);
        if (p?.statut === 'en_attente') await admin.from('paiements').update({ statut: 'expire', updated_at: maintenant }).eq('id', p.id);
        break;
      }
      case 'payment_intent.canceled': {
        // Empreinte arrivée à expiration chez la banque (environ 7 jours) : la caution n'est plus bloquée
        const p = await paiement(o.metadata?.paiement_id);
        if (p?.statut === 'autorise' && o.cancellation_reason === 'automatic') {
          await admin.from('paiements').update({ statut: 'expire', updated_at: maintenant }).eq('id', p.id);
          if (p.location_id) await admin.from('locations').update({ caution_statut: 'a_prendre' }).eq('id', p.location_id).eq('caution_statut', 'prise');
          await journal(p, 'Caution expirée', `L'empreinte de ${euros(p.montant)} a expiré : reprenez une caution`);
        }
        break;
      }
      case 'charge.refunded': {
        const { data: p } = await admin.from('paiements').select('*').eq('stripe_intent', o.payment_intent).maybeSingle();
        if (p && (await paiement(p.id)) && p.statut !== 'rembourse') await admin.from('paiements').update({ statut: 'rembourse', rembourse: (o.amount_refunded ?? 0) / 100, updated_at: maintenant }).eq('id', p.id);
        break;
      }
      case 'account.updated':
        if (compte || o.id) await rafraichirCompte(admin, compte ?? o.id);
        break;
      case 'account.application.deauthorized':
        if (compte) await admin.from('stripe_comptes').update({ pret: false, virements: false, updated_at: maintenant }).eq('compte', compte);
        break;
    }
  } catch (e: any) {
    console.error('[stripe webhook]', evt.type, e?.message);
    return new NextResponse('erreur', { status: 500 }); // Stripe renverra la notification
  }
  return NextResponse.json({ recu: true });
}
