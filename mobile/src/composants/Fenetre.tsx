// Question au centre de l'écran (ex. « Aucune caution n'est remplie, êtes-vous sûr ? »)
import { Modal, Pressable, Text, View } from 'react-native';
import { useCouleurs } from '@/lib/theme';
import { GrosBouton } from './ui';

export default function Fenetre({ visible, question, oui, non, onOui, onNon }: {
  visible: boolean; question: string; oui: string; non: string; onOui: () => void; onNon: () => void;
}) {
  const c = useCouleurs();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onNon}>
      <Pressable onPress={onNon} style={{ flex: 1, backgroundColor: 'rgba(8,12,20,.6)', justifyContent: 'center', padding: 20 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: c.panneau, borderRadius: 22, padding: 22, gap: 14, maxWidth: 440, width: '100%', alignSelf: 'center' }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.orange + '26', alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: c.orange, fontSize: 26, fontWeight: '900' }}>!</Text>
          </View>
          <Text style={{ color: c.texte, fontSize: 19, fontWeight: '700', textAlign: 'center', lineHeight: 26 }}>{question}</Text>
          <GrosBouton titre={non} onPress={onNon} />
          <GrosBouton secondaire titre={oui} onPress={onOui} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
