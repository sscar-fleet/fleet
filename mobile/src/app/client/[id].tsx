// Fiche client : contact en un geste, papiers à photographier, historique
import { useCallback } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ecran, Carte, GrosBouton, Ligne, Texte, Titre, Chargement, BandeauHorsLigne } from '@/composants/ui';
import CarteLocation from '@/composants/CarteLocation';
import { chargerClient } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { mettreEnFile } from '@/lib/hors-ligne';
import { useSession } from '@/lib/session';
import { useCouleurs } from '@/lib/theme';
import { nomClient, telInternational } from '@/lib/format';

const PAPIERS = [
  ['permis_path', 'Permis recto'], ['permis_verso_path', 'Permis verso'],
  ['piece_identite_path', 'Identité recto'], ['piece_identite_verso_path', 'Identité verso'],
  ['justificatif_domicile_path', 'Justificatif de domicile'],
] as const;

export default function FicheClient() {
  const c = useCouleurs();
  const { profil } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const charger = useCallback(() => chargerClient(id), [id]);
  const { donnees, horsLigne, majLe, recharger } = useDonnees(charger);
  if (!donnees?.client) return <Ecran retour titre="Client"><Chargement /></Ecran>;
  const { client: x, locations } = donnees;

  async function photographier(champ: string) {
    if (!profil) return;
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return;
    const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (r.canceled) return;
    const chemin = `${profil.agence_id}/clients/${x.id}/${champ.replace('_path', '')}-${Date.now()}.jpg`;
    await mettreEnFile({ genre: 'fichier', chemin, uri: r.assets[0].uri, type: 'image/jpeg', ensuite: { genre: 'maj', table: 'clients', id: x.id, champs: { [champ]: chemin } } });
    setTimeout(recharger, 1500);
  }

  return (
    <Ecran retour titre={nomClient(x)} sousTitre={x.liste_noire ? 'Liste noire' : x.telephone ?? undefined} rafraichir={recharger}
      bas={<GrosBouton titre="Nouvelle location pour ce client" onPress={() => router.push({ pathname: '/nouvelle', params: { client: x.id } })} />}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      <Ligne>
        {x.telephone ? <GrosBouton secondaire titre="WhatsApp" style={{ flex: 1 }} onPress={() => Linking.openURL(`https://wa.me/${telInternational(x.telephone)}`)} /> : null}
        {x.telephone ? <GrosBouton secondaire titre="Appeler" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${x.telephone}`)} /> : null}
        {x.email ? <GrosBouton secondaire titre="E-mail" style={{ flex: 1 }} onPress={() => Linking.openURL(`mailto:${x.email}`)} /> : null}
      </Ligne>

      <Titre>Papiers</Titre>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {PAPIERS.map(([champ, lib]) => {
          const ok = !!(x as any)[champ];
          return (
            <Pressable key={champ} onPress={() => photographier(champ)}
              style={{ width: '48%', minHeight: 88, borderRadius: 16, padding: 14, justifyContent: 'space-between', backgroundColor: ok ? c.vert + '1f' : c.panneau, borderWidth: 1.5, borderColor: ok ? c.vert : c.bord }}>
              <Text style={{ color: ok ? c.vert : c.orange, fontWeight: '800', fontSize: 13 }}>{ok ? '✓ Enregistré' : 'À photographier'}</Text>
              <Text style={{ color: c.texte, fontWeight: '700', fontSize: 16 }}>{lib}</Text>
            </Pressable>
          );
        })}
      </View>
      {x.adresse ? <Carte><Texte gris>Adresse</Texte><Texte>{x.adresse}</Texte></Carte> : null}
      {locations.length > 0 && <><Titre>Locations</Titre>{locations.map((l) => <CarteLocation key={l.id} l={l} genre={l.statut === 'en_cours' ? 'retour' : 'depart'} />)}</>}
    </Ecran>
  );
}
