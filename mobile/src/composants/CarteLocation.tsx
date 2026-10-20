// Une location dans une liste : l'heure, qui, quelle voiture, ce qui manque, où elle est
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Carte, Etiquette, Pastille, Barre } from './ui';
import LogoMarque from './LogoMarque';
import { useCouleurs } from '@/lib/theme';
import { heure, jour, nomClient, nomVehicule, estAujourdhui, enRetard, relatif, plaque } from '@/lib/format';
import { voyantsDepart, type LocationLigne } from '@/lib/donnees';
import { couleurGps, libelleGps, type EtatGps } from '@/lib/gps';

export default function CarteLocation({ l, genre, gps }: { l: LocationLigne; genre: 'depart' | 'retour'; gps?: EtatGps }) {
  const c = useCouleurs();
  const quand = genre === 'depart' ? l.debut : l.fin_prevue;
  const retard = enRetard(quand);
  const voyants = genre === 'depart' ? voyantsDepart(l) : [];
  const manque = voyants.filter((v) => !v.ok);
  const coul = genre === 'retour' && retard ? c.rouge : genre === 'depart' && retard ? c.orange : genre === 'depart' ? c.accent : c.vert;
  const avancement = genre === 'retour' ? (Date.now() - new Date(l.debut).getTime()) / (new Date(l.fin_prevue).getTime() - new Date(l.debut).getTime()) : 0;
  const proche = Math.abs(new Date(quand).getTime() - Date.now()) < 36 * 3600e3;

  return (
    <Carte accent={coul} onPress={() => router.push({ pathname: '/location/[id]', params: { id: l.id } })}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ minWidth: 72 }}>
          <Text numberOfLines={1} style={{ color: c.texte, fontSize: 21, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{heure(quand)}</Text>
          <Text style={{ color: coul, fontSize: 12, fontWeight: '800' }}>{genre === 'depart' ? 'DÉPART' : 'RETOUR'}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={{ color: c.texte, fontSize: 17, fontWeight: '800' }}>{nomClient(l.clients)}</Text>
          <Text numberOfLines={1} style={{ color: c.gris, fontSize: 14 }}>{nomVehicule(l.vehicules)} · {plaque(l.vehicules?.immatriculation)}</Text>
        </View>
        <LogoMarque marque={l.vehicules?.marque} modele={l.vehicules?.modele} taille={42} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        {retard ? <Etiquette plein titre={genre === 'retour' ? `En retard ${relatif(quand).replace('depuis ', '')}` : `Attendu ${relatif(quand)}`} couleur={coul} icone="horloge" />
          : proche ? <Etiquette titre={estAujourdhui(quand) ? relatif(quand) : jour(quand)} couleur={c.texte2} icone="horloge" />
          : <Etiquette titre={jour(quand)} couleur={c.texte2} icone="calendrier" />}
        {genre === 'depart' && (manque.length ? manque.map((v) => <Pastille key={v.titre} ok={false} titre={v.titre} couleur={v.titre === 'Liste noire' ? c.rouge : undefined} />) : <Pastille ok titre="Tout est prêt" />)}
        {gps && genre === 'retour' && <Etiquette titre={libelleGps(gps)} couleur={couleurGps(gps, c)} />}
      </View>
      {genre === 'retour' && !retard && <View style={{ marginTop: 6 }}><Barre part={avancement} couleur={c.vert} hauteur={4} /></View>}
    </Carte>
  );
}
