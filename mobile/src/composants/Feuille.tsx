// Panneau qui monte du bas de l'écran (choix rapides, détails)
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCouleurs } from '@/lib/theme';

export default function Feuille({ visible, titre, onFermer, children }: { visible: boolean; titre: string; onFermer: () => void; children: ReactNode }) {
  const c = useCouleurs();
  const marges = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onFermer}>
      <Pressable onPress={onFermer} style={{ flex: 1, backgroundColor: c.voile, justifyContent: 'flex-end' }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: c.panneau, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '88%', width: '100%', maxWidth: 720, alignSelf: 'center', borderWidth: 1, borderColor: c.bord }}>
          <View style={{ alignItems: 'center', paddingTop: 10 }}><View style={{ width: 42, height: 5, borderRadius: 3, backgroundColor: c.bord }} /></View>
          <Text style={{ color: c.texte, fontSize: 20, fontWeight: '800', paddingHorizontal: 20, paddingTop: 12 }}>{titre}</Text>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: marges.bottom + 24, gap: 10 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
