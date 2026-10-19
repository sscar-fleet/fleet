// Les locations en cours et à venir, les plus proches en premier
import { router } from 'expo-router';
import { Ecran, Titre, Vide, Chargement, BandeauHorsLigne, GrosBouton } from '@/composants/ui';
import CarteLocation from '@/composants/CarteLocation';
import { chargerLocations } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';

export default function Locations() {
  const { donnees, horsLigne, majLe, enChargement, recharger } = useDonnees(chargerLocations);
  const enCours = (donnees ?? []).filter((l) => l.statut === 'en_cours').sort((a, b) => a.fin_prevue.localeCompare(b.fin_prevue));
  const aVenir = (donnees ?? []).filter((l) => l.statut === 'reservee');
  return (
    <Ecran titre="Locations" rafraichir={recharger} enChargement={enChargement && !!donnees} bas={<GrosBouton titre="+ Nouvelle location" onPress={() => router.push('/nouvelle')} />}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      {!donnees ? <Chargement /> : <>
        <Titre>En cours ({enCours.length})</Titre>
        {enCours.length ? enCours.map((l) => <CarteLocation key={l.id} l={l} genre="retour" />) : <Vide titre="Aucune voiture dehors" />}
        <Titre>À venir ({aVenir.length})</Titre>
        {aVenir.length ? aVenir.map((l) => <CarteLocation key={l.id} l={l} genre="depart" />) : <Vide titre="Aucune réservation" texte="Touchez « Nouvelle location » : voiture, client, dates, c'est fait." />}
      </>}
    </Ecran>
  );
}
