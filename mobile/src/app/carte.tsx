// Toute la flotte sur une carte, actualisée toutes les 30 secondes
import { Linking, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ecran, Carte, Etiquette, Vide, Rangee } from '@/composants/ui';
import MiniCarte from '@/composants/MiniCarte';
import { chargerVehicules } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { useCouleurs } from '@/lib/theme';
import { useGps, libelleGps, couleurGps, depuis, itineraire } from '@/lib/gps';
import { km, nomVehicule } from '@/lib/format';

export default function CarteFlotte() {
  const c = useCouleurs();
  const { gps, rafraichirGps } = useGps();
  const { donnees } = useDonnees(chargerVehicules);
  const suivis = (donnees ?? []).map((v) => ({ v, e: gps.parVehicule[v.id] })).filter((x) => x.e);
  const points = suivis.filter((x) => x.e.lat != null && x.e.lng != null)
    .map((x) => ({ id: x.v.id, lat: x.e.lat!, lng: x.e.lng!, couleur: couleurGps(x.e, c), titre: x.v.immatriculation, onPress: () => router.push({ pathname: '/vehicule/[id]', params: { id: x.v.id } }) }));
  const roulent = suivis.filter((x) => x.e.etat === 'roule').length;

  return (
    <Ecran retour titre="Carte GPS" sousTitre={`${suivis.length} véhicule${suivis.length > 1 ? 's' : ''} suivi${suivis.length > 1 ? 's' : ''} · ${roulent} en mouvement`} rafraichir={rafraichirGps}>
      {!gps.actif && <Vide icone="carte" titre="Suivi GPS pas encore activé" texte={gps.raison ?? 'Le suivi s’active avec les traceurs posés par SS CAR SYSTEM.'} />}
      {gps.demo && <Etiquette titre="Aperçu avec des positions fictives" couleur={c.bleu} />}
      {points.length > 0 && <MiniCarte points={points} hauteur={380} zoomMax={15} onPress={() => {}} />}
      {points.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {(['roule', 'arret', 'coupe', 'hors_ligne'] as const).map((k) => <Etiquette key={k} titre={{ roule: 'Roule', arret: 'À l’arrêt', coupe: 'Moteur coupé', hors_ligne: 'Hors ligne' }[k]} couleur={couleurGps({ etat: k } as any, c)} />)}
      </View>}
      {suivis.length > 0 && <Carte style={{ paddingVertical: 4 }}>
        {suivis.map((x, i) => (
          <Rangee key={x.v.id} fin={i === suivis.length - 1} icone="voiture" couleur={couleurGps(x.e, c)} titre={`${x.v.immatriculation} · ${nomVehicule(x.v)}`}
            sous={`${libelleGps(x.e)} · ${depuis(x.e.le)}${x.e.km_estime != null ? ` · ${km(x.e.km_estime)}` : ''}`}
            droite={x.e.lat != null ? <Text onPress={() => Linking.openURL(itineraire(x.e.lat!, x.e.lng!))} style={{ color: c.accent, fontWeight: '800' }}>Y aller</Text> : undefined}
            onPress={() => router.push({ pathname: '/vehicule/[id]', params: { id: x.v.id } })} />
        ))}
      </Carte>}
    </Ecran>
  );
}
