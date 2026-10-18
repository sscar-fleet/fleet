// Le reste, en court : compte, synchro, position des véhicules (quand les traceurs seront branchés)
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ecran, Carte, GrosBouton, Texte, Titre } from '@/composants/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';
import { enAttente, envoyerFile } from '@/lib/hors-ligne';
import { telematiqueActive } from '@/lib/telematique';

const FLEET = process.env.EXPO_PUBLIC_FLEET_URL || '/';

export default function Plus() {
  const { profil, session } = useSession();
  const [attente, setAttente] = useState(0);
  useFocusEffect(useCallback(() => { enAttente().then(setAttente).catch(() => {}); }, []));

  return (
    <Ecran titre="Plus">
      <Carte>
        <Texte gras>{profil?.nom ?? session?.user.email}</Texte>
        <Texte gris>{profil?.agence} · {profil?.role === 'gerant' ? 'Gérant' : 'Employé'}</Texte>
      </Carte>

      <Titre>Envoi des données</Titre>
      <Carte>
        <Texte>{attente ? `${attente} élément${attente > 1 ? 's' : ''} en attente de réseau` : 'Tout est envoyé'}</Texte>
        {attente > 0 && <GrosBouton secondaire titre="Réessayer maintenant" onPress={() => envoyerFile().then(() => enAttente().then(setAttente))} />}
      </Carte>

      <Titre>Véhicules en direct</Titre>
      <Carte>
        <Texte>{telematiqueActive() ? 'Position et kilométrage des véhicules' : 'Bientôt : position, kilométrage automatique et coupure à distance, dès que les traceurs Seeworld ou Teltonika seront reliés.'}</Texte>
      </Carte>

      <Titre>Sur le site</Titre>
      <GrosBouton secondaire titre="Pilotage, devis, réglages" onPress={() => Linking.openURL(FLEET)} />
      <GrosBouton secondaire titre="Se déconnecter" onPress={() => supabase.auth.signOut()} style={{ marginTop: 18 }} />
    </Ecran>
  );
}
