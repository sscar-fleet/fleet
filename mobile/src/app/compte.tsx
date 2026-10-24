// Compte, envoi des données, suivi GPS, accès au site
import { useCallback, useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ecran, Carte, GrosBouton, Titre, Rangee, Etiquette } from '@/composants/ui';
import Logo from '@/composants/Logo';
import { useToast } from '@/composants/Toast';
import { desinscrirePush, etatPush, inscrirePush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';
import { useCouleurs } from '@/lib/theme';
import { enAttente, envoyerFile, dernierRefus } from '@/lib/hors-ligne';
import { useGps } from '@/lib/gps';
import { api, urlSite } from '@/lib/site';

export default function Compte() {
  const c = useCouleurs();
  const toast = useToast();
  const { profil, session } = useSession();
  const { gps } = useGps();
  const [attente, setAttente] = useState(0);
  const [notif, setNotif] = useState<'ok' | 'refuse' | 'demander' | 'impossible' | null>(null);
  useFocusEffect(useCallback(() => { enAttente().then(setAttente).catch(() => {}); etatPush().then(setNotif).catch(() => {}); }, []));
  type Famille = { cle: string; titre: string; detail: string };
  const [familles, setFamilles] = useState<Famille[]>([]);
  const [choix, setChoix] = useState<Record<string, boolean>>({});
  useFocusEffect(useCallback(() => {
    api<{ familles: Famille[]; choix: Record<string, boolean> }>('mobile/push/preferences').then((r) => { setFamilles(r.familles); setChoix(r.choix); }).catch(() => {});
  }, []));
  function basculer(cle: string, v: boolean) {
    const suivant = { ...choix, [cle]: v };
    setChoix(suivant);
    api('mobile/push/preferences', { choix: suivant }).catch(() => { setChoix(choix); toast('Pas de réseau, réessayez', 'alerte'); });
  }
  async function activerNotif() {
    if (notif === 'refuse') return Linking.openSettings();
    const r = await inscrirePush();
    setNotif(r === 'ok' ? 'ok' : r === 'refuse' ? 'refuse' : notif);
    toast(r === 'ok' ? 'Notifications activées' : 'Notifications non activées', r === 'ok' ? 'ok' : 'alerte');
  }
  const nbSuivis = Object.keys(gps.parVehicule).length;

  return (
    <Ecran retour titre={profil?.nom ?? session?.user.email ?? 'Mon compte'} sousTitre={`${profil?.agence ?? ''} · ${profil?.role === 'gerant' ? 'Gérant' : 'Employé'}`}>
      <Titre>Envoi des données</Titre>
      <Carte style={{ paddingVertical: 4 }}>
        <Rangee fin icone={attente ? 'nuage' : 'ok'} couleur={attente ? c.orange : c.vert} titre={attente ? `${attente} élément${attente > 1 ? 's' : ''} en attente de réseau` : 'Tout est envoyé'}
          sous={attente ? 'Photos, signatures et états des lieux partent tout seuls au retour du réseau' : dernierRefus ? `Dernier refus : ${dernierRefus}` : 'Vous pouvez travailler sans réseau, rien n’est perdu'}
          droite={attente ? <Text onPress={() => envoyerFile().then(() => enAttente().then((n) => { setAttente(n); toast(n ? 'Toujours pas de réseau' : 'Tout est envoyé', n ? 'alerte' : 'ok'); }))} style={{ color: c.accent, fontWeight: '800' }}>Réessayer</Text> : undefined} />
      </Carte>

      {notif && notif !== 'impossible' && <>
        <Titre>Notifications</Titre>
        <Carte style={{ paddingVertical: 4 }}>
          <Rangee fin icone="cloche" couleur={notif === 'ok' ? c.vert : c.orange} titre={notif === 'ok' ? 'Activées sur ce téléphone' : 'Désactivées sur ce téléphone'}
            sous={notif === 'ok' ? 'Alertes des boîtiers, urgences et point du matin' : notif === 'refuse' ? 'À réactiver dans les réglages du téléphone' : 'Pour être prévenu d’un vol, d’un retard ou d’une amende'}
            droite={notif === 'ok' ? undefined : <Text onPress={activerNotif} style={{ color: c.accent, fontWeight: '800' }}>{notif === 'refuse' ? 'Réglages' : 'Activer'}</Text>} />
        </Carte>
        {notif === 'ok' && familles.length > 0 && (
          <Carte style={{ paddingVertical: 2 }}>
            <Text style={{ color: c.gris, fontSize: 13, paddingTop: 10, paddingBottom: 4 }}>Gardez seulement ce qui vous sert : moins de notifications, plus on les lit.</Text>
            {familles.map((f, i) => (
              <View key={f.cle} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: c.bord }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: c.texte, fontSize: 15.5, fontWeight: '700' }}>{f.titre}</Text>
                  <Text style={{ color: c.gris, fontSize: 12.5, lineHeight: 17 }}>{f.detail}</Text>
                </View>
                <Switch value={!!choix[f.cle]} onValueChange={(v) => basculer(f.cle, v)} trackColor={{ true: c.accent, false: c.bord }} thumbColor="#fff" accessibilityLabel={f.titre} />
              </View>
            ))}
          </Carte>
        )}
      </>}

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

      <GrosBouton secondaire icone="sortie" titre="Se déconnecter" onPress={async () => { await desinscrirePush(); supabase.auth.signOut(); }} style={{ marginTop: 18 }} />
      <View style={{ alignItems: 'center', marginTop: 20, opacity: 0.7 }}><Logo largeur={110} /></View>
    </Ecran>
  );
}
