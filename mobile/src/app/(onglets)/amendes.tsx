// Amendes : photo de l'avis → l'IA lit tout → le conducteur est retrouvé → désignation
import { router } from 'expo-router';
import { Ecran, GrosBouton, Carte, Ligne, Texte, Titre, Vide, Chargement, BandeauHorsLigne } from '@/composants/ui';
import { chargerAmendes } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { euros, jour, nomClient, statutAmende } from '@/lib/format';
import { useCouleurs } from '@/lib/theme';

export default function Amendes() {
  const c = useCouleurs();
  const { donnees, horsLigne, majLe, enChargement, recharger } = useDonnees(chargerAmendes);
  const aTraiter = (donnees ?? []).filter((a) => ['a_designer', 'infos_manquantes'].includes(a.statut));
  const autres = (donnees ?? []).filter((a) => !['a_designer', 'infos_manquantes'].includes(a.statut));


  const ligne = (a: (typeof aTraiter)[number]) => (
    <Carte key={a.id} accent={a.statut === 'a_designer' ? c.orange : a.statut === 'infos_manquantes' ? c.rouge : c.bord}>
      <Ligne style={{ justifyContent: 'space-between' }}>
        <Texte gras>{a.vehicules?.immatriculation ?? 'Véhicule ?'}</Texte>
        <Texte gras>{euros(a.montant)}</Texte>
      </Ligne>
      <Texte gris>{jour(a.date_infraction)} · {a.type ?? 'Infraction'}{a.lieu ? ' · ' + a.lieu : ''}</Texte>
      <Texte>{a.clients ? 'Conducteur : ' + nomClient(a.clients) : 'Conducteur non retrouvé'} · {statutAmende[a.statut] ?? a.statut}</Texte>
    </Carte>
  );

  return (
    <Ecran titre="Amendes" rafraichir={recharger} enChargement={enChargement && !!donnees} bas={<GrosBouton titre="Ajouter une amende" onPress={() => router.push('/amende')} />}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      {!donnees ? <Chargement /> : <>
        <Titre>À traiter ({aTraiter.length})</Titre>
        {aTraiter.length ? aTraiter.map(ligne) : <Vide titre="Rien à traiter" texte="Photographiez un avis : l'immatriculation, la date et le conducteur sont retrouvés tout seuls." />}
        {autres.length > 0 && <><Titre>Traitées</Titre>{autres.map(ligne)}</>}
      </>}
    </Ecran>
  );
}
