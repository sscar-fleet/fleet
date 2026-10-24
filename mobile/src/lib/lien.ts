// Lien du logiciel (« /locations/… », « /carte?vehicule=… ») ouvert sur l'écran de l'appli qui correspond.
// Sert à la cloche et au toucher d'une notification reçue sur le téléphone.
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { urlSite } from './site';

export function ouvrir(href: string) {
  if (href.startsWith('http')) return Linking.openURL(href);
  if (href === '/notifications') return router.push('/notifications' as any);
  const m = href.match(/^\/(locations|vehicules|clients)\/([0-9a-f-]{36})/);
  if (m) return router.push({ pathname: (m[1] === 'locations' ? '/location/[id]' : m[1] === 'vehicules' ? '/vehicule/[id]' : '/client/[id]') as any, params: { id: m[2] } });
  if (href.startsWith('/amendes') || href.startsWith('/fps')) return router.push('/(onglets)/amendes' as any);
  if (href.startsWith('/locations/nouvelle')) { const v = href.match(/vehicule=([0-9a-f-]{36})/); return router.push({ pathname: '/nouvelle', params: v ? { vehicule: v[1] } : {} }); }
  const carte = href.match(/^\/carte\?vehicule=([0-9a-f-]{36})/);
  if (carte) return router.push({ pathname: '/vehicule/[id]', params: { id: carte[1] } });
  if (href.startsWith('/carte')) return router.push('/(onglets)/flotte' as any);
  if (href.startsWith('/planning') || href === '/locations') return router.push('/(onglets)/locations' as any);
  return Linking.openURL(urlSite(href)); // fiche maintenance, prêts, réglages : dans le logiciel
}

