// « J'ai eu un accrochage » : le chauffeur prend les photos et le constat, le dossier sinistre se crée tout seul
// chez son responsable avec le bon camion et la bonne tournée. Marche sans réseau.
import { useState } from 'react';
import { Image, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ecran, GrosBouton, Carte } from '@/composants/ui';
import { useToast } from '@/composants/Toast';
import Icone from '@/composants/Icone';
import { useSession } from '@/lib/session';
import { useCouleurs } from '@/lib/theme';
import { prendrePhoto } from '@/lib/photo';
import { declarerAccrochage } from '@/lib/transport';

export default function Accrochage() {
  const c = useCouleurs();
  const toast = useToast();
  const { profil } = useSession();
  const { id, vehicule, plaque } = useLocalSearchParams<{ id: string; vehicule?: string; plaque?: string }>();
  const [photos, setPhotos] = useState<string[]>([]);
  const [constat, setConstat] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [lieu, setLieu] = useState('');
  const [tiers, setTiers] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const titreCarte = { color: c.gris, fontWeight: '800' as const, fontSize: 13, letterSpacing: 0.4 };

  async function envoyer() {
    if (!profil || !id) return;
    if (!photos.length && !description.trim()) { toast('Ajoute au moins une photo ou une phrase', 'alerte'); return; }
    setEnvoi(true);
    try {
      await declarerAccrochage({ id: String(id), agence_id: profil.agence_id, vehicule_id: vehicule ? String(vehicule) : null, chauffeur_id: profil.chauffeur_id ?? null },
        { description: description.trim() || null, lieu: lieu.trim() || null, tiers }, photos, constat);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('C’est envoyé à ton responsable', 'ok');
      router.back();
    } catch (e: any) { toast(e?.message ?? 'Envoi impossible', 'alerte'); setEnvoi(false); }
  }

  const ajout = (onPress: () => void, label: string) => (
    <Pressable onPress={onPress} accessibilityLabel={label}
      style={({ pressed }) => ({ width: 84, height: 84, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Icone nom="photo" couleur={c.accent} taille={28} />
    </Pressable>
  );

  return (
    <Ecran titre="J’ai eu un accrochage" sousTitre={plaque ? `Camion ${plaque}` : 'Ton responsable est prévenu tout de suite'} fermer>
      <Carte>
        <Text style={titreCarte}>PHOTOS DES DÉGÂTS</Text>
        <Text style={{ color: c.gris, fontSize: 13.5 }}>De loin pour voir tout le camion, puis de près. La plaque de l’autre véhicule s’il y en a un.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {photos.map((p, i) => (
            <Pressable key={i} onPress={() => setPhotos(photos.filter((_, k) => k !== i))} accessibilityLabel="Retirer la photo">
              <Image source={{ uri: p }} style={{ width: 84, height: 84, borderRadius: 12 }} />
            </Pressable>
          ))}
          {ajout(async () => { const r = await prendrePhoto({ qualite: 0.6 }); if (r) setPhotos([...photos, r.uri]); }, 'Prendre une photo des dégâts')}
        </View>
      </Carte>
      <Carte>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: c.texte, fontSize: 16, fontWeight: '700', flex: 1 }}>Un autre véhicule est impliqué</Text>
          <Switch value={tiers} onValueChange={setTiers} />
        </View>
        {tiers && <>
          <Text style={titreCarte}>CONSTAT AMIABLE (les deux côtés signés)</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {constat ? <Pressable onPress={() => setConstat(null)} accessibilityLabel="Retirer le constat"><Image source={{ uri: constat }} style={{ width: 84, height: 84, borderRadius: 12 }} /></Pressable>
              : ajout(async () => { const r = await prendrePhoto({ qualite: 0.7 }); if (r) setConstat(r.uri); }, 'Photographier le constat')}
          </View>
        </>}
      </Carte>
      <Carte>
        <Text style={titreCarte}>CE QUI S’EST PASSÉ</Text>
        <TextInput value={description} onChangeText={setDescription} placeholder="Marche arrière au dépôt, rétroviseur cassé…" placeholderTextColor={c.gris} multiline
          style={{ color: c.texte, fontSize: 16, minHeight: 70, textAlignVertical: 'top' }} />
        <TextInput value={lieu} onChangeText={setLieu} placeholder="Où (rue, ville, dépôt)" placeholderTextColor={c.gris} style={{ color: c.texte, fontSize: 16, paddingVertical: 8 }} />
      </Carte>
      <GrosBouton titre={envoi ? 'Envoi…' : 'Envoyer à mon responsable'} icone="envoyer" desactive={envoi} onPress={envoyer} />
    </Ecran>
  );
}
