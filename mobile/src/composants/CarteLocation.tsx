// Une location sur l'écran du jour : qui, quelle voiture, à quelle heure, ce qui manque
import { router } from 'expo-router';
import { Carte, Ligne, Pastille, Texte } from './ui';
import { useCouleurs } from '@/lib/theme';
import { heure, jour, nomClient, nomVehicule, estAujourdhui, enRetard } from '@/lib/format';
import { voyantsDepart, type LocationLigne } from '@/lib/donnees';

export default function CarteLocation({ l, genre }: { l: LocationLigne; genre: 'depart' | 'retour' }) {
  const c = useCouleurs();
  const quand = genre === 'depart' ? l.debut : l.fin_prevue;
  const retard = genre === 'retour' && enRetard(quand);
  const voyants = genre === 'depart' ? voyantsDepart(l) : [];
  return (
    <Carte accent={retard ? c.rouge : genre === 'depart' ? c.accent : c.vert} onPress={() => router.push({ pathname: '/location/[id]', params: { id: l.id } })}>
      <Ligne style={{ justifyContent: 'space-between' }}>
        <Texte gras taille={22}>{heure(quand)}</Texte>
        <Texte gris taille={14}>{retard ? 'En retard' : estAujourdhui(quand) ? (genre === 'depart' ? 'Départ' : 'Retour') : jour(quand)}</Texte>
      </Ligne>
      <Texte gras>{nomClient(l.clients)}</Texte>
      <Texte gris>{nomVehicule(l.vehicules)} · {l.vehicules?.immatriculation}</Texte>
      {voyants.length > 0 && <Ligne style={{ marginTop: 4 }}>{voyants.map((v) => <Pastille key={v.titre} {...v} />)}</Ligne>}
    </Carte>
  );
}
