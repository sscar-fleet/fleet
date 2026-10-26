// Photo du permis envoyée par le chauffeur (preuve de validité demandée tous les 3 mois). Marche sans réseau.
import { useState } from 'react';
import { Image, Text } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ecran, GrosBouton, Carte } from '@/composants/ui';
import { useToast } from '@/composants/Toast';
import { useSession } from '@/lib/session';
import { useCouleurs } from '@/lib/theme';
import { prendrePhoto } from '@/lib/photo';
import { envoyerPermis } from '@/lib/transport';

export default function Permis() {
  const c = useCouleurs();
  const toast = useToast();
  const { profil } = useSession();
  const [photo, setPhoto] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function envoyer() {
    if (!profil?.chauffeur_id || !photo) return;
    setEnvoi(true);
    try {
      await envoyerPermis({ id: profil.chauffeur_id, agence_id: profil.agence_id }, photo);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Merci, c’est envoyé', 'ok');
      router.back();
    } catch (e: any) { toast(e?.message ?? 'Envoi impossible', 'alerte'); setEnvoi(false); }
  }

  return (
    <Ecran titre="Photo de mon permis" sousTitre="Demandée tous les 3 mois par ton responsable" fermer>
      <Carte>
        <Text style={{ color: c.texte2, fontSize: 15 }}>Pose ton permis bien à plat, le recto (côté photo) visible, sans reflet.</Text>
        {photo ? <Image source={{ uri: photo }} style={{ width: '100%', aspectRatio: 85.6 / 54, borderRadius: 12, marginTop: 8 }} resizeMode="cover" /> : null}
      </Carte>
      <GrosBouton titre={photo ? 'Reprendre la photo' : 'Prendre la photo'} icone="photo" onPress={async () => { const r = await prendrePhoto({ qualite: 0.7 }); if (r) setPhoto(r.uri); }} />
      {photo && <GrosBouton titre={envoi ? 'Envoi…' : 'Envoyer'} icone="envoyer" desactive={envoi} onPress={envoyer} />}
    </Ecran>
  );
}
