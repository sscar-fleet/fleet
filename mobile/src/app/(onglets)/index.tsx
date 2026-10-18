// Écran d'ouverture : qui part, qui revient, ce qui bloque. Rien à chercher.
import { router } from 'expo-router';
import { Ecran, GrosBouton, Titre, Vide, Chargement, BandeauHorsLigne, Texte } from '@/composants/ui';
import CarteLocation from '@/composants/CarteLocation';
import { chargerAujourdhui, voyantsDepart } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { useSession } from '@/lib/session';

export default function Aujourdhui() {
  const { profil } = useSession();
  const { donnees, horsLigne, majLe, erreur, enChargement, recharger } = useDonnees(chargerAujourdhui);
  const departs = donnees?.departs ?? [];
  const retours = donnees?.retours ?? [];
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  // Le bouton principal propose la prochaine chose à faire
  const prochain = [...departs.map((l) => ({ l, genre: 'depart' as const, quand: l.debut })), ...retours.map((l) => ({ l, genre: 'retour' as const, quand: l.fin_prevue }))]
    .sort((a, b) => a.quand.localeCompare(b.quand))[0];

  return (
    <Ecran titre={`Bonjour${profil?.nom ? ' ' + profil.nom.split(' ')[0] : ''}`} sousTitre={`${date} · ${profil?.agence ?? ''}`} rafraichir={recharger} enChargement={enChargement && !!donnees}
      bas={prochain ? <GrosBouton titre={prochain.genre === 'depart' ? `Faire partir ${prochain.l.vehicules?.immatriculation ?? ''}` : `Récupérer ${prochain.l.vehicules?.immatriculation ?? ''}`}
        onPress={() => router.push({ pathname: '/location/[id]', params: { id: prochain.l.id } })} /> : undefined}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      {!donnees && !erreur && <Chargement />}
      {erreur && !donnees && <Vide titre="Impossible de charger la journée" texte={erreur} />}
      {donnees && (
        <>
          <Texte gris>{departs.length} départ{departs.length > 1 ? 's' : ''} · {retours.length} retour{retours.length > 1 ? 's' : ''}
            {departs.some((l) => voyantsDepart(l).some((v) => !v.ok)) ? ' · des points à régler avant certains départs' : ''}</Texte>
          <Titre>Départs</Titre>
          {departs.length ? departs.map((l) => <CarteLocation key={l.id} l={l} genre="depart" />) : <Vide titre="Aucun départ aujourd'hui" />}
          <Titre>Retours</Titre>
          {retours.length ? retours.map((l) => <CarteLocation key={l.id} l={l} genre="retour" />) : <Vide titre="Aucun retour aujourd'hui" />}
        </>
      )}
    </Ecran>
  );
}
