// L'ancienne page « Carte GPS » renvoie vers l'espace Suivi, qui contient maintenant la carte plein écran
import { Redirect } from 'expo-router';

export default function CarteFlotte() {
  return <Redirect href="/(onglets)/flotte" />;
}
