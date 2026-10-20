// Toute la flotte sur une carte, actualisée toutes les 30 secondes
import { Linking, Pressable, Text, View } from 'react-native';
import LogoMarque from '@/composants/LogoMarque';
import Plaque from '@/composants/Plaque';
import Icone from '@/composants/Icone';
import { router } from 'expo-router';
import { Ecran, Carte, Etiquette, Vide } from '@/composants/ui';
import MiniCarte from '@/composants/MiniCarte';
import { logoMarque } from '@/lib/logoMarque';
import { chargerVehicules } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { useCouleurs } from '@/lib/theme';
import { useGps, libelleGps, couleurGps, depuis, itineraire } from '@/lib/gps';
import { km, nomVehicule, plaque } from '@/lib/format';

export default function CarteFlotte() {
  const c = useCouleurs();
  const { gps, rafraichirGps } = useGps();
  const { donnees } = useDonnees(chargerVehicules);
  const suivis = (donnees ?? []).map((v) => ({ v, e: gps.parVehicule[v.id] })).filter((x) => x.e);
  const points = suivis.filter((x) => x.e.lat != null && x.e.lng != null)
    .map((x) => ({ id: x.v.id, lat: x.e.lat!, lng: x.e.lng!, couleur: couleurGps(x.e, c), titre: x.v.immatriculation, logo: logoMarque(x.v.marque, x.v.modele), onPress: () => router.push({ pathname: '/vehicule/[id]', params: { id: x.v.id } }) }));
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
          <Pressable key={x.v.id} onPress={() => router.push({ pathname: '/vehicule/[id]', params: { id: x.v.id } })}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: i === suivis.length - 1 ? 0 : 1, borderBottomColor: c.bord, opacity: pressed ? 0.7 : 1 })}>
            <View>
              <LogoMarque marque={x.v.marque} modele={x.v.modele} taille={46} />
              <View style={{ position: 'absolute', right: -3, bottom: -3, width: 16, height: 16, borderRadius: 8, backgroundColor: couleurGps(x.e, c), borderWidth: 3, borderColor: c.panneau }} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text numberOfLines={1} style={{ color: c.texte, fontSize: 16, fontWeight: '800' }}>{nomVehicule(x.v)}</Text>
              <Plaque immat={plaque(x.v.immatriculation)} taille={0.62} />
              <Text numberOfLines={1} style={{ color: c.gris, fontSize: 13 }}>{libelleGps(x.e)} · {depuis(x.e.le)}{x.e.km_estime != null ? ` · ${km(x.e.km_estime)}` : ''}</Text>
            </View>
            {x.e.lat != null ? <Pressable hitSlop={8} onPress={() => Linking.openURL(itineraire(x.e.lat!, x.e.lng!))}
              style={{ paddingHorizontal: 12, height: 40, borderRadius: 20, backgroundColor: c.accent + '1f', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icone nom="itineraire" couleur={c.accent} taille={16} /><Text style={{ color: c.accent, fontWeight: '800' }}>Y aller</Text></Pressable> : null}
          </Pressable>
        ))}
      </Carte>}
    </Ecran>
  );
}
