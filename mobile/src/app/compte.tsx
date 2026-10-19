// Compte, envoi des données, suivi GPS, accès au site
import { useCallback, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ecran, Carte, GrosBouton, Titre, Rangee, Etiquette } from '@/composants/ui';
import Logo from '@/composants/Logo';
import { useToast } from '@/composants/Toast';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';
import { useCouleurs } from '@/lib/theme';
import { enAttente, envoyerFile, dernierRefus } from '@/lib/hors-ligne';
import { useGps } from '@/lib/gps';
import { urlSite } from '@/lib/site';

export default function Compte() {
  const c = useCouleurs();
  const toast = useToast();
  const { profil, session } = useSession();
  const { gps } = useGps();
  const [attente, setAttente] = useState(0);
  useFocusEffect(useCallback(() => { enAttente().then(setAttente).catch(() => {}); }, []));
  const nbSuivis = Object.keys(gps.parVehicule).length;

  return (
    <Ecran retour titre={profil?.nom ?? session?.user.email ?? 'Mon compte'} sousTitre={`${profil?.agence ?? ''} · ${profil?.role === 'gerant' ? 'Gérant' : 'Employé'}`}>
      <Titre>Envoi des données</Titre>
      <Carte style={{ paddingVertical: 4 }}>
        <Rangee fin icone={attente ? 'nuage' : 'ok'} couleur={attente ? c.orange : c.vert} titre={attente ? `${attente} élément${attente > 1 ? 's' : ''} en attente de réseau` : 'Tout est envoyé'}
          sous={attente ? 'Photos, signatures et états des lieux partent tout seuls au retour du réseau' : dernierRefus ? `Dernier refus : ${dernierRefus}` : 'Vous pouvez travailler sans réseau, rien n’est perdu'}
          droite={attente ? <Text onPress={() => envoyerFile().then(() => enAttente().then((n) => { setAttente(n); toast(n ? 'Toujours pas de réseau' : 'Tout est envoyé', n ? 'alerte' : 'ok'); }))} style={{ color: c.accent, fontWeight: '800' }}>Réessayer</Text> : undefined} />
      </Carte>

      <Titre>Suivi GPS</Titre>
      <Carte style={{ paddingVertical: 4 }}>
        <Rangee fin icone="carte" couleur={gps.actif ? c.vert : c.gris} titre={gps.actif ? `${nbSuivis} véhicule${nbSuivis > 1 ? 's' : ''} suivi${nbSuivis > 1 ? 's' : ''}` : 'Pas encore activé'}
          sous={gps.actif ? (gps.demo ? 'Aperçu avec des positions fictives' : 'Position, kilométrage et coupure moteur') : gps.raison ?? 'S’active avec les traceurs posés par SS CAR SYSTEM'}
          droite={gps.demo ? <Etiquette titre="Aperçu" couleur={c.bleu} /> : undefined} onPress={gps.actif ? () => router.push('/carte') : undefined} />
      </Carte>

      <Titre>Raccourcis</Titre>
      <Carte style={{ paddingVertical: 4 }}>
        <Rangee icone="client" couleur={c.bleu} titre="Clients" onPress={() => router.push('/clients')} />
        <Rangee icone="amendes" couleur={c.orange} titre="Ajouter une amende" onPress={() => router.push('/amende')} />
        <Rangee fin icone="site" couleur={c.accent} titre="Ouvrir le site" sous="Pilotage, devis, factures, réglages" onPress={() => Linking.openURL(urlSite('/'))} />
      </Carte>

      <GrosBouton secondaire icone="sortie" titre="Se déconnecter" onPress={() => supabase.auth.signOut()} style={{ marginTop: 18 }} />
      <View style={{ alignItems: 'center', marginTop: 20, opacity: 0.7 }}><Logo largeur={110} /></View>
    </Ecran>
  );
}
