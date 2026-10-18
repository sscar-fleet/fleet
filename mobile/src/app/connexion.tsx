// Connexion : mêmes identifiants que le site. Le téléphone garde la session ensuite.
import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop, Path, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase, configure } from '@/lib/supabase';
import { useCouleurs, T } from '@/lib/theme';
import { GrosBouton } from '@/composants/ui';
import Logo from '@/composants/Logo';

const SITE = process.env.EXPO_PUBLIC_FLEET_URL || '';

function IconeChamp({ nom, couleur }: { nom: 'mail' | 'cle'; couleur: string }) {
  const p = { stroke: couleur, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      {nom === 'mail' ? <><Rect x={3} y={5} width={18} height={14} rx={3} {...p} /><Path d="m4 7 8 6 8-6" {...p} /></>
        : <><Rect x={4} y={10.5} width={16} height={10} rx={2.5} {...p} /><Path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" {...p} /><Circle cx={12} cy={15.5} r={1.4} fill={couleur} /></>}
    </Svg>
  );
}

export default function Connexion() {
  const c = useCouleurs();
  const marges = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [voir, setVoir] = useState(false);
  const [focus, setFocus] = useState<'email' | 'mdp' | null>(null);
  const [erreur, setErreur] = useState('');
  const [attente, setAttente] = useState(false);

  async function entrer() {
    setErreur(''); setAttente(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: mdp });
    setAttente(false);
    if (error) setErreur(error.message.includes('Invalid') ? 'E-mail ou mot de passe incorrect.' : 'Connexion impossible : vérifiez le réseau.');
  }

  const champ = (actif: boolean) => ({
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, backgroundColor: c.panneau,
    borderColor: actif ? c.accent : c.bord, borderWidth: 1.5, borderRadius: 18, minHeight: 60, paddingHorizontal: 18,
  });
  const saisie = { flex: 1, color: c.texte, fontSize: 18, paddingVertical: 16, outlineStyle: 'none' as never };

  return (
    <View style={{ flex: 1, backgroundColor: c.fond }}>
      {/* Halo turquoise derrière le logo */}
      <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          <RadialGradient id="halo" cx="50%" cy="22%" rx="75%" ry="40%">
            <Stop offset="0" stopColor={c.accent} stopOpacity={0.22} />
            <Stop offset="1" stopColor={c.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#halo)" />
      </Svg>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: marges.top + 24, paddingBottom: marges.bottom + 24, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
          <View style={{ alignItems: 'center', marginBottom: 36 }}>
            <Logo largeur={Math.min(250, width * 0.62)} />
            <Text style={{ color: c.texte, fontSize: 26, fontWeight: '800', marginTop: 28, textAlign: 'center' }}>Votre agence dans la poche</Text>
            <Text style={{ color: c.gris, fontSize: 16, marginTop: 8, textAlign: 'center', lineHeight: 22 }}>Départs, retours et états des lieux en quelques gestes.</Text>
          </View>

          {!configure && <Text style={{ color: c.orange, marginBottom: 12, textAlign: 'center' }}>Appli pas encore reliée à la base.</Text>}

          <View style={{ gap: 14 }}>
            <View style={champ(focus === 'email')}>
              <IconeChamp nom="mail" couleur={focus === 'email' ? c.accent : c.gris} />
              <TextInput style={saisie} placeholder="E-mail" placeholderTextColor={c.gris} autoCapitalize="none" autoComplete="email" keyboardType="email-address"
                textContentType="username" value={email} onChangeText={setEmail} onFocus={() => setFocus('email')} onBlur={() => setFocus(null)} returnKeyType="next" />
            </View>
            <View style={champ(focus === 'mdp')}>
              <IconeChamp nom="cle" couleur={focus === 'mdp' ? c.accent : c.gris} />
              <TextInput style={saisie} placeholder="Mot de passe" placeholderTextColor={c.gris} secureTextEntry={!voir} autoComplete="password" textContentType="password"
                value={mdp} onChangeText={setMdp} onFocus={() => setFocus('mdp')} onBlur={() => setFocus(null)} onSubmitEditing={entrer} returnKeyType="go" />
              <Pressable onPress={() => setVoir((v) => !v)} hitSlop={12}>
                <Text style={{ color: c.accent, fontWeight: '700', fontSize: 14 }}>{voir ? 'Masquer' : 'Voir'}</Text>
              </Pressable>
            </View>

            {erreur ? <Text style={{ color: c.rouge, fontSize: 15, textAlign: 'center' }}>{erreur}</Text> : null}

            <GrosBouton titre={attente ? 'Connexion…' : 'Se connecter'} onPress={entrer} desactive={attente || !email || !mdp} style={{ marginTop: 6 }} />

            <Pressable onPress={() => Linking.openURL(`${SITE}/login`)} style={{ alignItems: 'center', padding: 12 }}>
              <Text style={{ color: c.gris, fontSize: 15 }}>Mot de passe oublié ?</Text>
            </Pressable>
          </View>

          <Text style={{ color: c.gris, fontSize: 13, textAlign: 'center', marginTop: 28, opacity: 0.7 }}>Les mêmes identifiants que sur le site · SS CAR SYSTEM</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
