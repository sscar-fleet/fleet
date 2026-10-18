import { utilisateurCourant } from '@/lib/agence';
import Entete from './Entete';

export const dynamic = 'force-dynamic';

export default async function Accueil() {
  const { supabase, profil } = await utilisateurCourant();
  const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0);
  const finJour = new Date(); finJour.setHours(23, 59, 59, 999);
  const maintenant = new Date().toISOString();

  const compter = async (q: any) => (await q).count ?? 0;
  const [departs, retours, retards, amendes, maintenance] = await Promise.all([
    compter(supabase.from('locations').select('id', { count: 'exact', head: true })
      .eq('statut', 'reservee').gte('debut', debutJour.toISOString()).lte('debut', finJour.toISOString())),
    compter(supabase.from('locations').select('id', { count: 'exact', head: true })
      .eq('statut', 'en_cours').gte('fin_prevue', debutJour.toISOString()).lte('fin_prevue', finJour.toISOString())),
    compter(supabase.from('locations').select('id', { count: 'exact', head: true })
      .eq('statut', 'en_cours').lt('fin_prevue', maintenant)),
    compter(supabase.from('amendes').select('id', { count: 'exact', head: true }).eq('statut', 'a_designer')),
    compter(supabase.from('vehicules').select('id', { count: 'exact', head: true }).eq('statut', 'maintenance')),
  ]);

  const tuiles = [
    { titre: 'Départs du jour', valeur: departs, lien: '/vehicules' },
    { titre: 'Retours du jour', valeur: retours, lien: '/vehicules' },
    { titre: 'En retard', valeur: retards, lien: '/vehicules', alerte: true },
    { titre: 'En maintenance', valeur: maintenance, lien: '/vehicules?statut=maintenance' },
    { titre: 'Amendes à désigner', valeur: amendes, lien: '/', alerte: true },
  ];

  return (
    <main className="page">
      <Entete agence={(profil as any).agences?.nom ?? ''} />
      <h1>Bonjour {profil.nom}</h1>
      <section className="compteurs">
        {tuiles.map((t) => (
          <a key={t.titre} href={t.lien} className={`compteur ${t.alerte && t.valeur > 0 ? 'alerte' : ''}`}>
            <span>{t.titre}</span>
            <b>{t.valeur}</b>
          </a>
        ))}
      </section>
    </main>
  );
}
