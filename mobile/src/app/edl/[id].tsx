// État des lieux en 3 étapes, au pouce : photos guidées → compteur et carburant → vérifications.
// Marche sans réseau : tout est envoyé dès que le réseau revient.
import { useEffect, useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { Ecran, GrosBouton, Ligne, Texte, Titre } from '@/composants/ui';
import { useCouleurs, T } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { relire } from '@/lib/hors-ligne';
import { POSITIONS, VOYANTS, ouvrirEdl, ajouterPhoto, terminerEdl } from '@/lib/edl';
import type { LocationLigne } from '@/lib/donnees';

const ETAPES = ['Photos', 'Compteur', 'Vérifications'] as const;

export default function EtatDesLieux() {
  const c = useCouleurs();
  const { id, type } = useLocalSearchParams<{ id: string; type: 'depart' | 'retour' }>();
  const { profil } = useSession();
  const [edlId, setEdlId] = useState<string>();
  const [vehiculeId, setVehiculeId] = useState<string>();
  const [etape, setEtape] = useState(0);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [km, setKm] = useState('');
  const [carburant, setCarburant] = useState(4); // sur 8
  const [checklist, setChecklist] = useState<Record<string, boolean | string>>({ proprete: true });

  useEffect(() => {
    if (!profil) return;
    ouvrirEdl(id, type, profil.agence_id, profil.id).then(setEdlId);
    relire<LocationLigne>('location-' + id).then((r) => setVehiculeId(r?.valeur.vehicules?.id));
  }, [id, type, profil]);

  async function photographier(position: string) {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted || !edlId || !profil) return;
    const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (r.canceled) return;
    const uri = r.assets[0].uri;
    setPhotos((x) => ({ ...x, [position]: uri }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await ajouterPhoto(edlId, profil.agence_id, position, uri);
  }

  async function terminer() {
    if (!edlId || !vehiculeId) return;
    let pos: Location.LocationObject | null = null;
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.granted) pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    } catch {}
    await terminerEdl({ edlId, type, locationId: id, vehiculeId, km: Number(km), carburant: Math.round((carburant / 8) * 100), checklist,
      latitude: pos?.coords.latitude, longitude: pos?.coords.longitude });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
  }

  const prises = POSITIONS.filter((p) => photos[p.position]).length;
  const suivante = POSITIONS.find((p) => !photos[p.position]);

  const bas = etape === 0
    ? (suivante ? <GrosBouton titre={`Photo : ${suivante.libelle}`} onPress={() => photographier(suivante.position)} />
      : <GrosBouton titre="Suivant : compteur" onPress={() => setEtape(1)} />)
    : etape === 1 ? <GrosBouton titre="Suivant : vérifications" desactive={!km} onPress={() => setEtape(2)} />
    : <GrosBouton titre={type === 'depart' ? 'Terminer et faire partir' : 'Terminer le retour'} onPress={terminer} />;

  return (
    <Ecran titre={type === 'depart' ? 'État des lieux de départ' : 'État des lieux de retour'} sousTitre={`Étape ${etape + 1} sur 3 · ${ETAPES[etape]}`} bas={bas}>
      <Ligne>
        {ETAPES.map((e, i) => (
          <Pressable key={e} onPress={() => setEtape(i)} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= etape ? c.accent : c.bord }} />
        ))}
      </Ligne>
      <Pressable onPress={() => router.back()}><Texte gris taille={15}>Fermer (rien n'est perdu)</Texte></Pressable>

      {etape === 0 && <>
        <Texte gris>{prises} photo{prises > 1 ? 's' : ''} sur {POSITIONS.length}. Le gros bouton vous guide dans l'ordre ; touchez une case pour reprendre une photo.</Texte>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {POSITIONS.map((p) => (
            <Pressable key={p.position} onPress={() => photographier(p.position)}
              style={{ width: '48%', aspectRatio: 4 / 3, borderRadius: 14, overflow: 'hidden', backgroundColor: c.panneau, borderWidth: 2, borderColor: photos[p.position] ? c.vert : suivante?.position === p.position ? c.accent : c.bord, justifyContent: 'flex-end' }}>
              {photos[p.position] ? <Image source={{ uri: photos[p.position] }} style={{ position: 'absolute', width: '100%', height: '100%' }} /> : null}
              <Text style={{ color: photos[p.position] ? '#fff' : c.texte2, backgroundColor: photos[p.position] ? 'rgba(0,0,0,.45)' : 'transparent', padding: 8, fontSize: 14, fontWeight: '700' }}>{p.libelle}</Text>
            </Pressable>
          ))}
        </View>
      </>}

      {etape === 1 && <>
        <Titre>Kilométrage</Titre>
        <TextInput value={km} onChangeText={(t) => setKm(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="000000" placeholderTextColor={c.bord}
          style={{ backgroundColor: '#000', color: c.accent, fontSize: 44, fontWeight: '800', letterSpacing: 8, textAlign: 'center', borderRadius: T.rayon, paddingVertical: 16, fontVariant: ['tabular-nums'] }} />
        <Titre>Carburant</Titre>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {Array.from({ length: 8 }, (_, i) => (
            <Pressable key={i} onPress={() => { setCarburant(i + 1); Haptics.selectionAsync().catch(() => {}); }}
              style={{ flex: 1, height: 64, borderRadius: 8, backgroundColor: i < carburant ? (carburant <= 2 ? c.orange : c.accent) : c.panneau2 }} />
          ))}
        </View>
        <Texte gris>{carburant}/8 · {Math.round((carburant / 8) * 100)} %</Texte>
      </>}

      {etape === 2 && <>
        {[['voyant', 'Voyant allumé'], ['badge', 'Badge parking'], ['kit', 'Kit anti-crevaison'], ['accessoires', 'Accessoires (siège bébé…)'], ['proprete', 'Véhicule propre']].map(([cle, lib]) => (
          <Pressable key={cle} onPress={() => setChecklist((x) => ({ ...x, [cle]: !x[cle] }))}
            style={{ minHeight: T.bouton, borderRadius: T.rayon, backgroundColor: checklist[cle] ? c.accent + '22' : c.panneau, borderWidth: 1, borderColor: checklist[cle] ? c.accent : c.bord, paddingHorizontal: 16, justifyContent: 'center' }}>
            <Texte gras>{checklist[cle] ? '✓  ' : '○  '}{lib}</Texte>
          </Pressable>
        ))}
        {checklist.voyant ? <>
          <Titre>Quel voyant ?</Titre>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(VOYANTS).map(([cle, lib]) => (
              <Pressable key={cle} onPress={() => setChecklist((x) => ({ ...x, voyant_type: cle }))}
                style={{ paddingHorizontal: 14, minHeight: T.cible, justifyContent: 'center', borderRadius: 99, backgroundColor: checklist.voyant_type === cle ? c.orange : c.panneau2 }}>
                <Texte gras couleur={checklist.voyant_type === cle ? '#fff' : undefined}>{lib}</Texte>
              </Pressable>
            ))}
          </View>
        </> : null}
        <Texte gris>La signature du client et la comparaison automatique des photos par l'IA arrivent à l'étape suivante.</Texte>
      </>}
    </Ecran>
  );
}
