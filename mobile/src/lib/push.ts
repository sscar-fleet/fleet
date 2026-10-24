// Notifications sur le téléphone : on demande l'autorisation une fois, on enregistre le téléphone auprès du
// logiciel, et un toucher sur une notification ouvre directement le bon écran.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api } from './site';
import { DEMO } from './demo';
import { ouvrir } from './lien';

// Appli ouverte : la notification s'affiche quand même en bannière, avec le son
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let dernierJeton: string | null = null;

export async function inscrirePush(): Promise<'ok' | 'refuse' | 'impossible'> {
  if (DEMO || Platform.OS === 'web' || !Device.isDevice) return 'impossible';
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('alertes', { name: 'Alertes', importance: Notifications.AndroidImportance.MAX, sound: 'default' });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'refuse';
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    const { data: jeton } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    dernierJeton = jeton;
    await api('mobile/push', { jeton, plateforme: Platform.OS, actif: true });
    return 'ok';
  } catch { return 'impossible'; }
}

// État pour l'écran Compte : 'ok' (activées), 'refuse' (à réactiver dans Réglages), 'impossible' (web, démo)
export async function etatPush(): Promise<'ok' | 'refuse' | 'demander' | 'impossible'> {
  if (DEMO || Platform.OS === 'web' || !Device.isDevice) return 'impossible';
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'ok' : canAskAgain ? 'demander' : 'refuse';
}

// À la déconnexion : ce téléphone ne reçoit plus les alertes de l'agence
export async function desinscrirePush() {
  if (!dernierJeton) return;
  await api('mobile/push', { jeton: dernierJeton, actif: false }).catch(() => {});
}

// Toucher une notification (appli fermée ou ouverte) : on ouvre l'écran indiqué
export function ecouterTouchers(): () => void {
  if (Platform.OS === 'web') return () => {};
  const ouvrirDepuis = (r: Notifications.NotificationResponse | null) => {
    const href = r?.notification.request.content.data?.href;
    if (typeof href === 'string') setTimeout(() => ouvrir(href), 300);
  };
  Notifications.getLastNotificationResponseAsync().then(ouvrirDepuis).catch(() => {});
  const abo = Notifications.addNotificationResponseReceivedListener(ouvrirDepuis);
  return () => abo.remove();
}
