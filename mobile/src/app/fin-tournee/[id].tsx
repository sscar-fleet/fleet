// Fin de tournée par le chauffeur : livrés, absents, photos des bons de livraison. Marche sans réseau.
import { useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ecran, GrosBouton, Carte } from '@/composants/ui';
import { useToast } from '@/composants/Toast';
import Icone from '@/composants/Icone';
import { useSession } from '@/lib/session';
import { useCouleurs } from '@/lib/theme';
import { prendrePhoto } from '@/lib/photo';
import { terminerTournee } from '@/lib/transport';

function Compteur({ libelle, valeur, onChange, couleur }: { libelle: string; valeur: number; onChange: (n: number) => void; couleur: string }) {
  const c = useCouleurs();
  const bouton = (signe: string, d: number) => (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(Math.max(0, valeur + d)); }} accessibilityLabel={`${libelle} ${signe}`}
      style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, backgroundColor: c.panneau2, borderWidth: 1, borderColor: c.bord, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ color: c.texte, fontSize: 26, fontWeight: '800' }}>{signe}</Text>
    </Pressable>
  );
  return (
    <Carte>
      <Text style={{ color: c.gris, fontWeight: '800', fontSize: 13, letterSpacing: 0.4 }}>{libelle}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {bouton('−', -1)}
        <TextInput value={String(valeur)} onChangeText={(t) => onChange(Math.max(0, Number(t.replace(/\D/g, '')) || 0))} keyboardType="number-pad"
          style={{ color: couleur, fontSize: 40, fontWeight: '900', textAlign: 'center', minWidth: 100 }} accessibilityLabel={libelle} />
        {bouton('+', 1)}
      </View>
    </Carte>
  );
}

export default function FinTournee() {
  const c = useCouleurs();
  const toast = useToast();
  const { profil } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [livres, setLivres] = useState(0);
  const [absents, setAbsents] = useState(0);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);

  async function envoyer() {
    if (!profil || !id) return;
    setEnvoi(true);
    try {
      await terminerTournee({ id: String(id), agence_id: profil.agence_id }, { livres, absents, note: note.trim() || null }, photos);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Tournée terminée, merci !', 'ok');
      router.back();
    } catch (e: any) { toast(e?.message ?? 'Envoi impossible', 'alerte'); setEnvoi(false); }
  }

  return (
    <Ecran titre="Fin de tournée" sousTitre="Ça remplace le message WhatsApp" fermer>
      <Compteur libelle="CLIENTS LIVRÉS" valeur={livres} onChange={setLivres} couleur={c.vert} />
      <Compteur libelle="ABSENTS" valeur={absents} onChange={setAbsents} couleur={absents ? c.orange : c.texte} />
      <Carte>
        <Text style={{ color: c.gris, fontWeight: '800', fontSize: 13, letterSpacing: 0.4 }}>BONS DE LIVRAISON</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {photos.map((p, i) => (
            <Pressable key={i} onPress={() => setPhotos(photos.filter((_, k) => k !== i))} accessibilityLabel="Retirer la photo">
              <Image source={{ uri: p }} style={{ width: 84, height: 84, borderRadius: 12 }} />
            </Pressable>
          ))}
          <Pressable onPress={async () => { const r = await prendrePhoto({ qualite: 0.5 }); if (r) setPhotos([...photos, r.uri]); }} accessibilityLabel="Prendre une photo"
            style={({ pressed }) => ({ width: 84, height: 84, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <Icone nom="photo" couleur={c.accent} taille={28} />
          </Pressable>
        </View>
        {photos.length > 0 && <Text style={{ color: c.gris, fontSize: 12.5 }}>Touchez une photo pour la retirer.</Text>}
      </Carte>
      <Carte>
        <Text style={{ color: c.gris, fontWeight: '800', fontSize: 13, letterSpacing: 0.4 }}>UN SOUCI ? (facultatif)</Text>
        <TextInput value={note} onChangeText={setNote} placeholder="Colis abîmé, adresse introuvable, problème sur le camion…" placeholderTextColor={c.gris} multiline
          style={{ color: c.texte, fontSize: 16, minHeight: 70, textAlignVertical: 'top' }} />
      </Carte>
      <GrosBouton titre={envoi ? 'Envoi…' : 'Envoyer'} icone="envoyer" desactive={envoi} onPress={envoyer} />
    </Ecran>
  );
}
