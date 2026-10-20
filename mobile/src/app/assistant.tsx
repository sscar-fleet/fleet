// Fleet AI dans l'appli : on demande, il répond avec les vraies données et prépare les actions à confirmer
import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ecran, GrosBouton } from '@/composants/ui';
import Icone from '@/composants/Icone';
import { useDictee } from '@/lib/dictee';
import { useCouleurs } from '@/lib/theme';
import { api } from '@/lib/site';

type Proposition = { type: string; libelle: string; lien?: string; telephone?: string; [k: string]: any };
type Bulle = { role: 'user' | 'assistant'; content: string; propositions?: Proposition[]; erreur?: boolean };
const IDEES = ['Qui rend une voiture aujourd’hui ?', 'Quelles locations sont en retard ?', 'Combien j’ai encaissé ce mois ?', 'Qu’est-ce que j’ai à traiter en amendes et FPS ?'];

// Lien du logiciel -> écran de l'appli
function ouvrirLien(lien: string) {
  const m = lien.match(/^\/(locations|vehicules|clients)\/([0-9a-f-]{36})/);
  if (!m) return;
  const chemin = m[1] === 'locations' ? '/location/[id]' : m[1] === 'vehicules' ? '/vehicule/[id]' : '/client/[id]';
  router.push({ pathname: chemin as any, params: { id: m[2] } });
}

export default function Assistant() {
  const c = useCouleurs();
  const [bulles, setBulles] = useState<Bulle[]>([]);
  const [saisie, setSaisie] = useState('');
  const [attente, setAttente] = useState(false);
  const [faits, setFaits] = useState<Record<string, string>>({});
  const dictee = useDictee((t) => setSaisie(t), (t) => envoyer(t));
  const { dicter } = useLocalSearchParams<{ dicter?: string }>();
  useEffect(() => { if (dicter && dictee.dispo) dictee.demarrer(); }, [dicter, dictee.dispo]); // eslint-disable-line react-hooks/exhaustive-deps

  async function envoyer(texte: string) {
    const q = texte.trim();
    if (!q || attente) return;
    const suite: Bulle[] = [...bulles, { role: 'user', content: q }];
    setBulles(suite); setSaisie(''); setAttente(true);
    try {
      const r = await api<{ reponse: string; propositions: Proposition[] }>('ia', { messages: suite.filter((b) => !b.erreur).map(({ role, content }) => ({ role, content })) });
      setBulles([...suite, { role: 'assistant', content: r.reponse || '…', propositions: r.propositions }]);
    } catch (e: any) {
      setBulles([...suite, { role: 'assistant', content: e?.message ?? 'Fleet AI ne répond pas pour le moment.', erreur: true }]);
    }
    setAttente(false);
  }

  async function agir(p: Proposition, cle: string) {
    if (p.type === 'whatsapp' && p.lien) return Linking.openURL(p.lien);
    if (p.type === 'appeler' && p.telephone) return Linking.openURL(`tel:${p.telephone.replace(/\s/g, '')}`);
    if (p.type === 'ouvrir' && p.lien) return ouvrirLien(p.lien);
    setFaits((f) => ({ ...f, [cle]: 'En cours…' }));
    try { const r = await api<{ message: string }>('ia/action', { proposition: p }); setFaits((f) => ({ ...f, [cle]: '✓ ' + r.message })); }
    catch (e: any) { setFaits((f) => ({ ...f, [cle]: e?.message ?? 'Action impossible' })); }
  }

  // Le texte avec ses liens [texte](/chemin) rendus touchables
  const rendu = (t: string, couleur: string) => t.split(/(\[[^\]]+\]\(\/[^)\s]*\))/g).map((m, i) => {
    const l = m.match(/^\[([^\]]+)\]\((\/[^)\s]*)\)$/);
    return l ? <Text key={i} onPress={() => ouvrirLien(l[2])} style={{ color: c.accent, fontWeight: '800' }}>{l[1]}</Text>
      : <Text key={i} style={{ color: couleur }}>{m.replace(/\*\*/g, '')}</Text>;
  });

  return (
    <Ecran retour titre="Fleet AI" sousTitre="Il répond et prépare les actions, vous confirmez"
      bas={<View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        {dictee.dispo && <Pressable onPress={() => dictee.basculer(saisie)} accessibilityLabel={dictee.ecoute ? 'Arrêter la dictée' : 'Dicter'}
          style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: dictee.ecoute ? c.rouge : c.bord, backgroundColor: dictee.ecoute ? c.rouge : c.panneau }}>
          <Icone nom="micro" couleur={dictee.ecoute ? '#fff' : c.texte} />
        </Pressable>}
        <TextInput value={saisie} onChangeText={setSaisie} placeholder={dictee.ecoute ? 'Je vous écoute…' : 'Demandez à Fleet AI…'} placeholderTextColor={c.gris} multiline
          onSubmitEditing={() => envoyer(saisie)} blurOnSubmit returnKeyType="send"
          style={{ flex: 1, minHeight: 52, maxHeight: 120, borderRadius: 16, borderWidth: 1.5, borderColor: c.bord, backgroundColor: c.panneau, color: c.texte, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16 }} />
        <GrosBouton titre={attente ? '…' : 'Envoyer'} desactive={attente || !saisie.trim()} onPress={() => envoyer(saisie)} style={{ width: 110 }} />
      </View>}>
      {!bulles.length && <View style={{ gap: 8 }}>
        <Text style={{ color: c.gris, fontSize: 15 }}>Touchez le micro et parlez, ou écrivez. Posez une question sur votre flotte, ou demandez une action : « prolonge Karim de 2 jours », « préviens le client de la Clio que son retour est demain 9 h ».</Text>
        {IDEES.map((i) => (
          <Pressable key={i} onPress={() => envoyer(i)} style={{ padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c.bord, backgroundColor: c.panneau }}>
            <Text style={{ color: c.texte, fontSize: 15 }}>{i}</Text>
          </Pressable>
        ))}
      </View>}
      {bulles.map((b, i) => (
        <View key={i} style={{ alignSelf: b.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%', padding: 12, borderRadius: 16,
          backgroundColor: b.role === 'user' ? c.accent : b.erreur ? c.rouge + '22' : c.panneau, gap: 10 }}>
          <Text style={{ fontSize: 15.5, lineHeight: 22 }}>{rendu(b.content, b.role === 'user' ? c.surAccent : c.texte)}</Text>
          {!!b.propositions?.length && <View style={{ gap: 8 }}>
            {b.propositions.map((p, j) => {
              const cle = `${i}-${j}`;
              return (
                <View key={cle} style={{ gap: 4 }}>
                  <GrosBouton petit secondaire={['ouvrir', 'appeler'].includes(p.type)} titre={faits[cle]?.startsWith('✓') ? '✓ ' + p.libelle : p.libelle}
                    desactive={!!faits[cle] && !['whatsapp', 'appeler', 'ouvrir'].includes(p.type)} onPress={() => agir(p, cle)} />
                  {faits[cle] ? <Text style={{ color: faits[cle].startsWith('✓') ? c.vert : c.gris, fontSize: 13 }}>{faits[cle]}</Text> : null}
                </View>
              );
            })}
          </View>}
        </View>
      ))}
      {attente && <Text style={{ color: c.gris }}>Fleet AI réfléchit…</Text>}
    </Ecran>
  );
}
