import { redirect } from 'next/navigation';
import Logo from '../_c/Logo';
import Deconnexion from '../parametres/Deconnexion';
import { supabaseServeur } from '@/lib/supabase';
import { date } from '@/lib/format';

export const dynamic = 'force-dynamic';

// Compte pas encore ouvert, essai terminé ou suspendu : aucune donnée n'est perdue, l'accès revient à la réactivation
export default async function Compte() {
  const supabase = supabaseServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  const { data } = await supabase.rpc('etat_compte');
  const e = Array.isArray(data) ? data[0] : data;
  if (!e) redirect('/bienvenue');
  if (e.ouvert) redirect('/');
  const textes: Record<string, [string, string]> = {
    attente: ['Votre compte est en cours d’ouverture', 'Merci pour votre inscription. SS CAR FLEET vous contacte pour mettre en place votre agence avec vous. Dès que c’est fait, vous retrouverez tout ici, sans rien refaire.'],
    essai: ['Votre période d’essai est terminée', `L’essai de ${e.agence} s’est terminé le ${e.fin_essai ? date(e.fin_essai) : '—'}. Toutes vos données sont conservées : contactez-nous pour continuer.`],
    suspendu: ['Votre compte est suspendu', `L’accès de ${e.agence} est suspendu. Toutes vos données sont conservées : contactez-nous pour le réactiver.`],
  };
  const [titre, texte] = textes[e.statut] ?? textes.suspendu;
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="carte" style={{ maxWidth: 480, display: 'grid', gap: 14, textAlign: 'center' }}>
        <div style={{ margin: '0 auto' }}><Logo style={{ width: 220, maxWidth: '100%', height: 'auto' }} /></div>
        <h1 style={{ margin: 0, fontSize: 24 }}>{titre}</h1>
        <p className="gris" style={{ margin: 0 }}>{texte}</p>
        <a className="bouton principal" href="mailto:fleet@sscarsystem.com">Écrire à SS CAR FLEET</a>
        <div><Deconnexion /></div>
      </div>
    </main>
  );
}
