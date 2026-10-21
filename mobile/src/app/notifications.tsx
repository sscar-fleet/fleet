// Notifications dans l'appli : le point du jour écrit par l'IA, puis seulement ce qui compte, avec le bouton pour le régler
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ecran, Chargement } from '@/composants/ui';
import Icone from '@/composants/Icone';
import { useCouleurs } from '@/lib/theme';
import { api, urlSite } from '@/lib/site';
import { ouvrirWhatsApp } from '@/lib/messages';

type Action = { type: 'lien'; libelle: string; href: string } | { type: 'tel'; libelle: string; numero: string } | { type: 'whatsapp'; libelle: string; numero: string; texte: string }
  | { type: 'faire'; libelle: string; action: string; id: string; jours?: number };
type Notif = { cle: string; niveau: 'rouge' | 'orange' | 'gris'; titre: string; detail: string; actions: Action[] };
const GROUPES = [{ niveau: 'rouge', titre: 'URGENT' }, { niveau: 'orange', titre: 'CETTE SEMAINE' }, { niveau: 'gris', titre: 'À SAVOIR' }] as const;

// Lien du logiciel -> écran de l'appli quand il existe
function ouvrir(href: string) {
  if (href.startsWith('http')) return Linking.openURL(href);
  const m = href.match(/^\/(locations|vehicules|clients)\/([0-9a-f-]{36})/);
  if (m) return router.push({ pathname: (m[1] === 'locations' ? '/location/[id]' : m[1] === 'vehicules' ? '/vehicule/[id]' : '/client/[id]') as any, params: { id: m[2] } });
  if (href.startsWith('/amendes') || href.startsWith('/fps')) return router.push('/(onglets)/amendes' as any);
  if (href.startsWith('/locations/nouvelle')) { const v = href.match(/vehicule=([0-9a-f-]{36})/); return router.push({ pathname: '/nouvelle', params: v ? { vehicule: v[1] } : {} }); }
  if (href.startsWith('/carte')) return router.push('/(onglets)/flotte' as any);
  return Linking.openURL(urlSite(href)); // fiche maintenance, prêts, réglages : dans le logiciel
}

export default function Notifications() {
  const c = useCouleurs();
  const [donnees, setDonnees] = useState<{ notifications: Notif[]; resume: string | null } | null>(null);
  const [etat, setEtat] = useState<Record<string, string>>({});
  const [tout, setTout] = useState(false);
  const charger = useCallback(() => { api<{ notifications: Notif[]; resume: string | null }>('notifications?resume=1').then(setDonnees).catch(() => setDonnees((d) => d ?? { notifications: [], resume: 'Pas de réseau pour le moment.' })); }, []);
  useFocusEffect(charger);

  async function masquer(cle: string, mode: 'demain' | 'ignorer') {
    setDonnees((d) => d && { ...d, notifications: d.notifications.filter((n) => n.cle !== cle) });
    await api('notifications', { cle, mode }).catch(() => {});
  }
  async function agir(n: Notif, a: Action) {
    if (a.type === 'lien') return ouvrir(a.href);
    if (a.type === 'tel') return Linking.openURL(`tel:${a.numero.replace(/\s/g, '')}`);
    if (a.type === 'whatsapp') return ouvrirWhatsApp(a.numero, a.texte);
    setEtat((e) => ({ ...e, [n.cle + a.libelle]: '…' }));
    try {
      const r = await api<{ message: string }>('notifications/action', { action: a.action, id: a.id, jours: a.jours });
      setEtat((e) => ({ ...e, [n.cle]: '✓ ' + r.message, [n.cle + a.libelle]: '' }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(charger, 1200);
    } catch (err: any) { setEtat((e) => ({ ...e, [n.cle]: '✗ ' + (err?.message ?? 'Impossible'), [n.cle + a.libelle]: '' })); }
  }

  const liste = donnees?.notifications ?? [];
  const importantes = liste.filter((n) => n.niveau !== 'gris');
  const montrees = new Set((tout ? liste : [...importantes.slice(0, 5), ...liste.filter((n) => n.niveau === 'gris').slice(0, 2)]).map((n) => n.cle));
  const couleur = (n: string) => (n === 'rouge' ? c.rouge : n === 'orange' ? c.orange : c.gris);

  return (
    <Ecran retour titre="À faire" sousTitre="Seulement ce qui compte, trié par l’IA" rafraichir={charger}>
      {!donnees ? <Chargement /> : <>
        <View style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: 18, backgroundColor: c.accent + '14', borderWidth: 1, borderColor: c.accent + '44' }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><Icone nom="eclair" couleur={c.surAccent} taille={18} /></View>
          <Text style={{ flex: 1, color: c.texte, fontSize: 15.5, lineHeight: 22 }}>{donnees.resume ?? '…'}</Text>
        </View>
        {!liste.length && (
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 30 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.vert + '22', alignItems: 'center', justifyContent: 'center' }}><Icone nom="ok" couleur={c.vert} taille={28} epaisseur={3} /></View>
            <Text style={{ color: c.texte, fontSize: 18, fontWeight: '800' }}>Rien à faire pour le moment</Text>
          </View>
        )}
        {GROUPES.map((g) => {
          const items = liste.filter((n) => n.niveau === g.niveau && montrees.has(n.cle));
          if (!items.length) return null;
          return (
            <View key={g.niveau} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: couleur(g.niveau) }} />
                <Text style={{ color: c.gris, fontSize: 12.5, fontWeight: '800', letterSpacing: 0.6 }}>{g.titre}</Text>
              </View>
              {items.map((n) => (
                <View key={n.cle} style={{ padding: 14, gap: 10, borderRadius: 18, backgroundColor: c.panneau, borderWidth: 1, borderColor: c.bord, borderLeftWidth: 5, borderLeftColor: couleur(n.niveau) }}>
                  <View style={{ gap: 3 }}>
                    <Text style={{ color: c.texte, fontSize: 16, fontWeight: '800' }}>{n.titre}</Text>
                    <Text style={{ color: c.gris, fontSize: 14 }}>{n.detail}</Text>
                    {etat[n.cle] ? <Text style={{ color: etat[n.cle].startsWith('✓') ? c.vert : c.rouge, fontWeight: '700', fontSize: 14 }}>{etat[n.cle].slice(2)}</Text> : null}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {n.actions.map((a, i) => {
                      const principal = a.type === 'faire' || (i === 0 && n.niveau === 'rouge');
                      return (
                        <Pressable key={i} onPress={() => agir(n, a)} disabled={etat[n.cle + a.libelle] === '…'}
                          style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: principal ? c.accent : c.panneau2, opacity: pressed ? 0.8 : 1 })}>
                          {etat[n.cle + a.libelle] === '…' ? <ActivityIndicator color={c.surAccent} /> : <Text style={{ color: principal ? c.surAccent : c.texte, fontWeight: '800', fontSize: 14 }}>{a.libelle}</Text>}
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 4 }}>
                    <Pressable onPress={() => masquer(n.cle, 'demain')} hitSlop={6} style={{ paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: c.gris, fontSize: 13, fontWeight: '600' }}>Demain</Text></Pressable>
                    <Pressable onPress={() => masquer(n.cle, 'ignorer')} hitSlop={6} style={{ paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: c.gris, fontSize: 13, fontWeight: '600' }}>Ignorer</Text></Pressable>
                  </View>
                </View>
              ))}
            </View>
          );
        })}
        {liste.length > montrees.size && (
          <Pressable onPress={() => setTout(true)} style={{ padding: 14, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: c.bord, alignItems: 'center' }}>
            <Text style={{ color: c.texte2, fontWeight: '800' }}>Voir {liste.length - montrees.size} autre{liste.length - montrees.size > 1 ? 's' : ''}</Text>
          </Pressable>
        )}
      </>}
    </Ecran>
  );
}
