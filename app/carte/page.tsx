import { utilisateurCourant } from '@/lib/agence';
import { suiviAgence, kmEstime, depuis } from '@/lib/telematique';
import { km } from '@/lib/format';
import Cadre from '../_c/Cadre';
import CarteGps, { type PointGps } from '../_c/CarteGps';

export const dynamic = 'force-dynamic';

// Toute la flotte sur une carte, en direct
export default async function CarteFlotte() {
  const { supabase } = await utilisateurCourant();
  const [{ data: vehicules }, suivi] = await Promise.all([
    supabase.from('vehicules').select('id, immatriculation, marque, modele, statut, km, traceurs(*)').neq('statut', 'sorti').order('immatriculation'),
    suiviAgence(supabase),
  ]);

  const lignes = (vehicules ?? []).map((v: any) => {
    const t = v.traceurs;
    const e = t ? suivi.etats.get(String(t.imei)) : undefined;
    const etat: PointGps['etat'] = !e ? 'hors_ligne' : t.moteur_coupe ? 'coupe' : !e.enLigne ? 'hors_ligne' : e.enMouvement ? 'roule' : 'arret';
    return { v, t, e, etat, estime: kmEstime(t, e) };
  });
  const points: PointGps[] = lignes.filter((x) => x.e?.lat != null && x.e?.lng != null).map((x) => ({
    id: x.v.id, lat: x.e!.lat!, lng: x.e!.lng!, titre: x.v.immatriculation, lien: `/vehicules/${x.v.id}`, etat: x.etat,
    detail: [[x.v.marque, x.v.modele].filter(Boolean).join(' '), x.etat === 'roule' ? `${x.e!.vitesse} km/h` : null, depuis(x.e!.le)].filter(Boolean).join(' · '),
  }));
  const libelles: Record<PointGps['etat'], string> = { roule: 'Roule', arret: 'À l’arrêt', coupe: 'Moteur coupé', hors_ligne: 'Hors ligne' };
  const sansTraceur = lignes.filter((x) => !x.t).length;

  return (
    <Cadre titre="Carte GPS" tables={['vehicules']}>
      {!suivi.actif && <div className="alerte-bandeau">{suivi.raison}</div>}
      {suivi.actif && <CarteGps points={points} hauteur={460} />}
      <section className="carte" style={{ marginTop: 16 }}>
        <h2>Véhicules suivis ({lignes.length - sansTraceur})</h2>
        {lignes.filter((x) => x.t).map((x) => (
          <a key={x.v.id} href={`/vehicules/${x.v.id}`} className="fichier">
            <span>{x.v.immatriculation} <span className="gris">{[x.v.marque, x.v.modele].filter(Boolean).join(' ')}</span>
              <br /><span className="gris">{x.e ? depuis(x.e.le) : 'pas de signal'}{x.estime != null ? ` · ${km(x.estime)}` : ''}</span></span>
            <span className={`pastille gps-${x.etat}`}>{libelles[x.etat]}{x.etat === 'roule' ? ` · ${x.e!.vitesse} km/h` : ''}</span>
          </a>
        ))}
        {sansTraceur > 0 && <p className="gris" style={{ marginBottom: 0 }}>{sansTraceur} véhicule(s) sans traceur : reliez un boîtier depuis la fiche du véhicule.</p>}
      </section>
    </Cadre>
  );
}
