import { supabaseAdmin, adminConfigure } from '@/lib/supabaseAdmin';
import { euros } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Paiement', robots: { index: false } };

// Page publique où revient le client après la page de paiement Stripe
export default async function Paye({ searchParams }: { searchParams: { r?: string; p?: string } }) {
  const id = /^[0-9a-f-]{36}$/i.test(searchParams.p ?? '') ? searchParams.p! : null;
  let p: any = null; let agence = '';
  if (id && adminConfigure()) {
    const { data } = await supabaseAdmin().from('paiements').select('libelle, montant, mode, type, agences(nom, telephone)').eq('id', id).maybeSingle();
    p = data; agence = (data as any)?.agences?.nom ?? '';
  }
  const ok = searchParams.r === 'ok';
  const titre = !ok ? 'Paiement non effectué' : p?.mode === 'carte' ? 'Carte enregistrée' : p?.mode === 'empreinte' ? 'Caution bloquée' : 'Paiement reçu';
  const texte = !ok ? 'Vous avez quitté la page de paiement. Vous pouvez rouvrir le lien envoyé par votre loueur pour réessayer.'
    : p?.mode === 'carte' ? `Votre carte est enregistrée comme caution de ${euros(p.montant)}. Elle ne sera débitée qu'en cas de dégâts ou de frais.`
    : p?.mode === 'empreinte' ? `${euros(p.montant)} sont bloqués sur votre carte comme caution. Ils seront libérés au retour du véhicule si tout est en ordre.`
    : p ? `Merci, votre paiement de ${euros(p.montant)} est bien reçu.` : 'Merci, votre paiement est bien reçu.';
  return (
    <main className="signer">
      <section className="signer-carte">
        <h1>{titre}</h1>
        {p && <p className="gris" style={{ marginTop: 0 }}>{p.libelle}</p>}
        <p>{texte}</p>
        {agence && <p className="gris">{agence}{(p as any)?.agences?.telephone ? ` · ${(p as any).agences.telephone}` : ''}</p>}
        <p className="gris" style={{ fontSize: 13 }}>Paiement sécurisé par Stripe. Vous pouvez fermer cette page.</p>
      </section>
    </main>
  );
}
