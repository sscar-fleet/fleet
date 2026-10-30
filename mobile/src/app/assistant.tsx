// Fleet AI dans l'appli : un vrai fil de discussion. On écrit ou on dicte, il répond avec les vraies données
// et prépare les actions ; rien ne change sans un toucher sur le bouton de confirmation.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Icone from '@/composants/Icone';
import { useCouleurs } from '@/lib/theme';
import { api } from '@/lib/site';
import { useDictee } from '@/lib/dictee';
import { garder, relire } from '@/lib/hors-ligne';

type Proposition = { type: string; libelle: string; lien?: string; telephone?: string; [k: string]: any };
type Bulle = { role: 'user' | 'assistant'; content: string; propositions?: Proposition[]; erreur?: boolean };
const IDEES = ['Qui rend une voiture aujourd’hui ?', 'Quelles locations sont en retard ?', 'Quelles voitures sont libres demain ?', 'Combien j’ai encaissé ce mois ?', 'Qu’est-ce que j’ai à traiter en amendes et FPS ?'];

// Lien du logiciel -> écran de l'appli
function ouvrirLien(lien: string) {
  const m = lien.match(/^\/(locations|vehicules|clients)\/([0-9a-f-]{36})/);
  if (m) {
    const chemin = m[1] === 'locations' ? '/location/[id]' : m[1] === 'vehicules' ? '/vehicule/[id]' : '/client/[id]';
    router.push({ pathname: chemin as any, params: { id: m[2] } });
  } else if (lien.startsWith('/amendes') || lien.startsWith('/fps')) router.push('/(onglets)/amendes' as any);
  else if (lien.startsWith('/locations')) router.push('/(onglets)/locations' as any);
  else if (lien.startsWith('/vehicules') || lien.startsWith('/carte')) router.push('/(onglets)/flotte' as any);
}

// Bas de l'écran au-dessus du clavier de l'iPhone (le navigateur ne le fait pas tout seul)
function useClavier() {
  const [hauteur, setHauteur] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const maj = () => setHauteur(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener('resize', maj); vv.addEventListener('scroll', maj);
    return () => { vv.removeEventListener('resize', maj); vv.removeEventListener('scroll', maj); };
  }, []);
  return hauteur;
}

export default function Assistant() {
  const c = useCouleurs();
  const marges = useSafeAreaInsets();
  const clavier = useClavier();
  const fil = useRef<any>(null);
  const [bulles, setBulles] = useState<Bulle[]>([]);
  const [saisie, setSaisie] = useState('');
  const [attente, setAttente] = useState(false);
  const [faits, setFaits] = useState<Record<string, string>>({});
  const dictee = useDictee((t) => setSaisie(t));
  const { dicter, q } = useLocalSearchParams<{ dicter?: string; q?: string }>();
  const qEnvoyee = useRef<string | null>(null);

  // La conversation reste quand on revient sur l'écran
  // (sauf si on arrive avec une question touchée sur la Journée : nouveau fil)
  useEffect(() => { if (q) return; relire<Bulle[]>('fleet-ai').then((r) => { if (r?.valeur?.length) setBulles(r.valeur); }).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (bulles.length) garder('fleet-ai', bulles.slice(-30)).catch(() => {}); }, [bulles]);
  useEffect(() => { if (dicter && dictee.dispo) dictee.demarrer(); }, [dicter, dictee.dispo]); // eslint-disable-line react-hooks/exhaustive-deps
  // Question touchée depuis l'écran Journée : elle part tout de suite
  useEffect(() => { if (q && qEnvoyee.current !== q) { const t = setTimeout(() => { qEnvoyee.current = String(q); envoyer(String(q)); }, 350); return () => clearTimeout(t); } }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => fil.current?.scrollToEnd({ animated: true }), 60); return () => clearTimeout(t); }, [bulles, attente, clavier]);

  async function envoyer(texte: string) {
    const q = texte.trim();
    if (!q || attente) return;
    if (dictee.ecoute) dictee.arreter();
    const suite: Bulle[] = [...bulles, { role: 'user', content: q }];
    setBulles(suite); setSaisie(''); setAttente(true);
    try {
      const r = await api<{ reponse: string; propositions: Proposition[] }>('ia', { messages: suite.filter((b) => !b.erreur).slice(-12).map(({ role, content }) => ({ role, content })) });
      setBulles([...suite, { role: 'assistant', content: r.reponse || 'Fleet AI ne répond pas pour le moment. Réessayez dans un instant.', propositions: r.propositions }]);
      Haptics.selectionAsync().catch(() => {});
    } catch (e: any) {
      setBulles([...suite, { role: 'assistant', content: e?.message ?? 'Fleet AI ne répond pas pour le moment. Vérifiez le réseau.', erreur: true }]);
    }
    setAttente(false);
  }

  async function agir(p: Proposition, cle: string) {
    if (p.type === 'whatsapp' && p.lien) return Linking.openURL(p.lien);
    if (p.type === 'appeler' && p.telephone) return Linking.openURL(`tel:${p.telephone.replace(/\s/g, '')}`);
    if (p.type === 'ouvrir' && p.lien) return ouvrirLien(p.lien);
    setFaits((f) => ({ ...f, [cle]: 'envoi' }));
    try { const r = await api<{ message: string }>('ia/action', { proposition: p }); setFaits((f) => ({ ...f, [cle]: '✓ ' + (r.message || 'Fait') })); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }
    catch (e: any) { setFaits((f) => ({ ...f, [cle]: '✗ ' + (e?.message ?? 'Action impossible') })); }
  }

  // Texte avec liens [texte](/chemin) touchables, gras **texte** et retours à la ligne
  const rendu = (t: string, couleur: string): ReactNode[] => t.split(/(\[[^\]]+\]\(\/[^)\s]*\)|\*\*[^*]+\*\*)/g).map((m, i) => {
    const l = m.match(/^\[([^\]]+)\]\((\/[^)\s]*)\)$/);
    if (l) return <Text key={i} onPress={() => ouvrirLien(l[2])} style={{ color: c.accent, fontWeight: '800', textDecorationLine: 'underline' }}>{l[1]}</Text>;
    const g = m.match(/^\*\*([^*]+)\*\*$/);
    if (g) return <Text key={i} style={{ color: couleur, fontWeight: '800' }}>{rendu(g[1], couleur)}</Text>; // un lien peut être en gras
    return <Text key={i} style={{ color: couleur }}>{m}</Text>;
  });

  const peutEnvoyer = !!saisie.trim() && !attente;

  return (
    <View style={{ flex: 1, backgroundColor: c.fond, paddingBottom: clavier }}>
      {/* En-tête */}
      <View style={{ paddingTop: marges.top + 8, paddingHorizontal: 12, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: c.bord, backgroundColor: c.fond }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} accessibilityLabel="Retour"
          style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.panneau2, alignItems: 'center', justifyContent: 'center' }}>
          <Icone nom="retour" couleur={c.texte} taille={22} />
        </Pressable>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icone nom="ia" couleur={c.surAccent} taille={22} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.texte, fontSize: 18, fontWeight: '800' }}>Fleet AI</Text>
          <Text numberOfLines={1} style={{ color: c.gris, fontSize: 12.5 }}>Votre assistant · il prépare, vous confirmez</Text>
        </View>
        {bulles.length > 0 && (
          <Pressable onPress={() => { setBulles([]); setFaits({}); garder('fleet-ai', []).catch(() => {}); }} hitSlop={8}
            style={{ paddingHorizontal: 12, height: 36, borderRadius: 18, borderWidth: 1, borderColor: c.bord, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: c.texte2, fontWeight: '700', fontSize: 13.5 }}>Nouvelle</Text>
          </Pressable>
        )}
      </View>

      {/* Fil */}
      <ScrollView ref={fil} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 14, gap: 10, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        {!bulles.length && (
          <View style={{ gap: 10, paddingTop: 6 }}>
            <Text style={{ color: c.texte, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 }}>Que voulez-vous savoir ?</Text>
            <Text style={{ color: c.gris, fontSize: 15, lineHeight: 21 }}>Posez une question sur la flotte ou demandez une action : « prolonge Karim de 2 jours », « préviens le client de la Clio que son retour est demain 9 h ».</Text>
            {IDEES.map((i) => (
              <Pressable key={i} onPress={() => envoyer(i)} style={({ pressed }) => ({ paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: c.bord, backgroundColor: pressed ? c.panneau2 : c.panneau })}>
                <Text style={{ color: c.texte, fontSize: 15 }}>{i}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {bulles.map((b, i) => {
          const moi = b.role === 'user';
          return (
            <View key={i} style={{ alignSelf: moi ? 'flex-end' : 'flex-start', maxWidth: '88%', gap: 8 }}>
              <View style={{ paddingVertical: 10, paddingHorizontal: 13, borderRadius: 18, borderBottomRightRadius: moi ? 6 : 18, borderBottomLeftRadius: moi ? 18 : 6,
                backgroundColor: moi ? c.accent : b.erreur ? c.rouge + '1f' : c.panneau, borderWidth: moi ? 0 : 1, borderColor: b.erreur ? c.rouge + '66' : c.bord }}>
                <Text selectable style={{ fontSize: 15.5, lineHeight: 22 }}>{rendu(b.content, moi ? c.surAccent : c.texte)}</Text>
              </View>
              {!!b.propositions?.length && b.propositions.map((p, j) => {
                const cle = `${i}-${j}`;
                const etat = faits[cle];
                const lien = ['whatsapp', 'appeler', 'ouvrir'].includes(p.type);
                const ok = etat?.startsWith('✓');
                return (
                  <View key={cle} style={{ gap: 4 }}>
                    <Pressable disabled={!lien && !!etat && etat !== '' && !etat.startsWith('✗')} onPress={() => agir(p, cle)}
                      style={({ pressed }) => ({ minHeight: 46, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
                        backgroundColor: ok ? c.vert + '22' : lien ? c.panneau2 : c.accent, borderWidth: lien || ok ? 1 : 0, borderColor: ok ? c.vert : c.bord, opacity: pressed ? 0.85 : 1 })}>
                      {etat === 'envoi' ? <ActivityIndicator color={c.surAccent} /> : <Icone nom={ok ? 'ok' : p.type === 'whatsapp' ? 'whatsapp' : p.type === 'appeler' ? 'tel' : p.type === 'ouvrir' ? 'chevron' : 'ok'} couleur={ok ? c.vert : lien ? c.texte : c.surAccent} taille={18} />}
                      <Text numberOfLines={2} style={{ flex: 1, color: ok ? c.vert : lien ? c.texte : c.surAccent, fontWeight: '800', fontSize: 15 }}>{p.libelle}</Text>
                    </Pressable>
                    {etat && etat !== 'envoi' ? <Text style={{ color: ok ? c.vert : c.rouge, fontSize: 13, paddingHorizontal: 4 }}>{etat.slice(2)}</Text> : null}
                  </View>
                );
              })}
            </View>
          );
        })}
        {attente && (
          <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: c.panneau, borderWidth: 1, borderColor: c.bord }}>
            <ActivityIndicator color={c.accent} size="small" /><Text style={{ color: c.gris }}>Je regarde vos données…</Text>
          </View>
        )}
      </ScrollView>

      {/* Saisie */}
      <View style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: (clavier ? 8 : marges.bottom + 8), borderTopWidth: 1, borderTopColor: c.bord, backgroundColor: c.fond }}>
        {dictee.ecoute ? <Text style={{ color: c.rouge, fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 6 }}>● Je vous écoute… touchez le micro quand vous avez fini</Text>
          : dictee.erreur ? <Text style={{ color: c.orange, fontSize: 13, textAlign: 'center', marginBottom: 6 }}>{dictee.erreur}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
          {dictee.dispo && (
            <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); dictee.basculer(saisie); }} accessibilityLabel={dictee.ecoute ? 'Arrêter la dictée' : 'Dicter'}
              style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: dictee.ecoute ? c.rouge : c.panneau2, borderWidth: 1, borderColor: dictee.ecoute ? c.rouge : c.bord }}>
              <Icone nom="micro" couleur={dictee.ecoute ? '#fff' : c.texte} taille={22} />
            </Pressable>
          )}
          <TextInput value={saisie} onChangeText={setSaisie} placeholder={dictee.ecoute ? 'Parlez…' : 'Écrivez ou dictez…'} placeholderTextColor={c.gris} multiline
            onKeyPress={(e: any) => { if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) { e.preventDefault?.(); envoyer(saisie); } }}
            style={{ flex: 1, minHeight: 48, maxHeight: 130, borderRadius: 24, borderWidth: 1, borderColor: dictee.ecoute ? c.rouge : c.bord, backgroundColor: c.panneau, color: c.texte,
              paddingHorizontal: 16, paddingTop: 13, paddingBottom: 13, fontSize: 16, outlineStyle: 'none' as never }} />
          <Pressable onPress={() => envoyer(saisie)} disabled={!peutEnvoyer} accessibilityLabel="Envoyer"
            style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: peutEnvoyer ? c.accent : c.panneau2, opacity: peutEnvoyer ? 1 : 0.6 }}>
            {attente ? <ActivityIndicator color={c.surAccent} /> : <Icone nom="envoyer" couleur={peutEnvoyer ? c.surAccent : c.gris} taille={22} />}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
