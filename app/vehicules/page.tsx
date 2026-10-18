import { revalidatePath } from 'next/cache';
import { utilisateurCourant } from '@/lib/agence';
import Entete from '../Entete';

export const dynamic = 'force-dynamic';

const libelles: Record<string, string> = {
  disponible: 'Disponible', loue: 'Loué', maintenance: 'Maintenance', hors_service: 'Hors service',
};

async function ajouter(formData: FormData) {
  'use server';
  const { supabase, profil } = await utilisateurCourant();
  const nombre = (v: FormDataEntryValue | null) => (v ? Number(v) : null);
  const { error } = await supabase.from('vehicules').insert({
    agence_id: profil.agence_id,
    immatriculation: String(formData.get('immatriculation')).toUpperCase().replace(/\s/g, ''),
    marque: formData.get('marque') || null,
    modele: formData.get('modele') || null,
    km: nombre(formData.get('km')),
    prix_jour: nombre(formData.get('prix_jour')),
    assurance_echeance: formData.get('assurance_echeance') || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/vehicules');
}

function bientot(date: string | null) {
  if (!date) return false;
  return new Date(date).getTime() - Date.now() < 30 * 24 * 3600 * 1000;
}

export default async function Vehicules({ searchParams }: { searchParams: { statut?: string } }) {
  const { supabase, profil } = await utilisateurCourant();
  let requete = supabase
    .from('vehicules')
    .select('id, immatriculation, marque, modele, statut, km, assurance_echeance')
    .order('immatriculation');
  if (searchParams.statut) requete = requete.eq('statut', searchParams.statut);
  const { data: vehicules } = await requete;

  return (
    <main className="page">
      <Entete agence={(profil as any).agences?.nom ?? ''} />
      <h1>Véhicules</h1>

      <section className="carte" style={{ marginBottom: 20 }}>
        <form action={ajouter} className="grille">
          <label>Immatriculation<input name="immatriculation" placeholder="AB-123-CD" required /></label>
          <label>Marque<input name="marque" placeholder="Peugeot" /></label>
          <label>Modèle<input name="modele" placeholder="208" /></label>
          <label>Kilométrage<input name="km" type="number" min={0} /></label>
          <label>Prix / jour (€)<input name="prix_jour" type="number" min={0} step="0.01" /></label>
          <label>Fin d'assurance<input name="assurance_echeance" type="date" /></label>
          <button className="bouton principal" type="submit">Ajouter le véhicule</button>
        </form>
      </section>

      <table>
        <thead>
          <tr>
            <th>Immat</th><th>Véhicule</th><th>Statut</th>
            <th className="masque-mobile">Km</th><th className="masque-mobile">Assurance</th>
          </tr>
        </thead>
        <tbody>
          {(vehicules ?? []).map((v) => (
            <tr key={v.id}>
              <td><b>{v.immatriculation}</b></td>
              <td>{[v.marque, v.modele].filter(Boolean).join(' ')}</td>
              <td><span className={`pastille ${v.statut}`}>{libelles[v.statut]}</span></td>
              <td className="masque-mobile">{v.km?.toLocaleString('fr-FR') ?? '—'}</td>
              <td className={`masque-mobile ${bientot(v.assurance_echeance) ? 'echeance-proche' : ''}`}>
                {v.assurance_echeance ? new Date(v.assurance_echeance).toLocaleDateString('fr-FR') : '—'}
              </td>
            </tr>
          ))}
          {!vehicules?.length && (
            <tr><td colSpan={5} className="vide">Aucun véhicule. Ajoutez le premier avec le formulaire ci-dessus.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
