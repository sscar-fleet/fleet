// Question au centre de l'écran (ex. « Couper le moteur ? »). Le choix prudent est toujours le gros bouton.
import { Modal, Pressable, Text, View } from 'react-native';
import { useCouleurs } from '@/lib/theme';
import { GrosBouton } from './ui';
import Icone, { type NomIcone } from './Icone';

export default function Fenetre({ visible, question, detail, oui, non, onOui, onNon, danger = false, icone = 'alerte', ouiEnAvant = false }: {
  visible: boolean; question: string; detail?: string; oui: string; non: string; onOui: () => void; onNon: () => void; danger?: boolean; icone?: NomIcone; ouiEnAvant?: boolean;
}) {
  const c = useCouleurs();
  const coul = danger ? c.rouge : c.orange;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onNon}>
      <Pressable onPress={onNon} style={{ flex: 1, backgroundColor: c.voile, justifyContent: 'center', padding: 20 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: c.panneau, borderRadius: 24, padding: 22, gap: 12, maxWidth: 440, width: '100%', alignSelf: 'center', borderWidth: 1, borderColor: c.bord }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: coul + '26', alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }}>
            <Icone nom={icone} couleur={coul} taille={28} />
          </View>
          <Text style={{ color: c.texte, fontSize: 19, fontWeight: '800', textAlign: 'center', lineHeight: 26 }}>{question}</Text>
          {detail ? <Text style={{ color: c.gris, fontSize: 15, textAlign: 'center', lineHeight: 21 }}>{detail}</Text> : null}
          <View style={{ gap: 8, marginTop: 6 }}>
            {ouiEnAvant ? <>
              <GrosBouton titre={oui} danger={danger} onPress={onOui} />
              <GrosBouton secondaire titre={non} onPress={onNon} />
            </> : <>
              <GrosBouton titre={non} onPress={onNon} />
              <GrosBouton secondaire titre={oui} onPress={onOui} />
            </>}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
