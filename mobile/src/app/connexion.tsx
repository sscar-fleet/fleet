// Connexion : mêmes identifiants que le site. Le téléphone garde la session ensuite.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { supabase, configure } from '@/lib/supabase';
import { useCouleurs, T } from '@/lib/theme';
import { GrosBouton } from '@/composants/ui';

export default function Connexion() {
  const c = useCouleurs();
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState('');
  const [attente, setAttente] = useState(false);

  const champ = { backgroundColor: c.panneau, color: c.texte, borderColor: c.bord, borderWidth: 1, borderRadius: T.rayon, minHeight: 58, paddingHorizontal: 16, fontSize: 18 };

  async function entrer() {
    setErreur(''); setAttente(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: mdp });
    setAttente(false);
    if (error) setErreur(error.message.includes('Invalid') ? 'E-mail ou mot de passe incorrect.' : 'Connexion impossible : vérifiez le réseau.');
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.fond, justifyContent: 'center', padding: 24, gap: 14 }}>
      <View style={{ marginBottom: 18 }}>
        <Text style={{ color: c.accent, fontSize: 15, fontWeight: '800', letterSpacing: 2 }}>SS CAR FLEET</Text>
        <Text style={{ color: c.texte, fontSize: 32, fontWeight: '800', marginTop: 6 }}>Bonjour</Text>
        <Text style={{ color: c.gris, fontSize: 16, marginTop: 4 }}>Les mêmes identifiants que sur le site.</Text>
      </View>
      {!configure && <Text style={{ color: c.orange }}>Appli pas encore reliée à la base : la clé Supabase est à coller dans le fichier .env.</Text>}
      <TextInput style={champ} placeholder="E-mail" placeholderTextColor={c.gris} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" value={email} onChangeText={setEmail} />
      <TextInput style={champ} placeholder="Mot de passe" placeholderTextColor={c.gris} secureTextEntry autoComplete="password" textContentType="password" value={mdp} onChangeText={setMdp} onSubmitEditing={entrer} />
      {erreur ? <Text style={{ color: c.rouge, fontSize: 15 }}>{erreur}</Text> : null}
      <GrosBouton titre={attente ? 'Connexion…' : 'Se connecter'} onPress={entrer} desactive={attente || !email || !mdp} />
    </KeyboardAvoidingView>
  );
}
