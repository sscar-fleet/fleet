import Logo from '../../_c/Logo';
import { redirect } from 'next/navigation';
import { supabaseServeur } from '@/lib/supabase';
import Rejoindre from './Rejoindre';

export const dynamic = 'force-dynamic';

export default async function Invitation({ params }: { params: { jeton: string } }) {
  const supabase = supabaseServeur();
  const { data } = await supabase.rpc('voir_invitation', { le_jeton: params.jeton });
  const inv = Array.isArray(data) ? data[0] : null;
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    const { data: deja } = await supabase.from('utilisateurs').select('id').eq('id', auth.user.id).maybeSingle();
    if (deja) redirect('/');
  }

  async function accepter() {
    'use server';
    const { error } = await supabaseServeur().rpc('accepter_invitation', { le_jeton: params.jeton });
    if (error) return { erreur: error.message };
    redirect('/');
  }

  return (
    <main className="connexion">
      <Logo />
      {!inv ? <p className="erreur">Ce lien d&apos;invitation n&apos;existe pas.</p>
        : inv.utilisee ? <><p className="gris">Cette invitation a déjà été utilisée.</p><a className="bouton principal" href="/login">Se connecter</a></>
        : <Rejoindre jeton={params.jeton} email={inv.email} nom={inv.nom} agence={inv.agence} connecte={auth.user?.email ?? null} accepter={accepter} />}
    </main>
  );
}
