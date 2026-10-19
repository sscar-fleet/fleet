// Plaque d'immatriculation française, pour reconnaître la voiture d'un coup d'œil
import { Text, View } from 'react-native';

export const formatImmat = (i?: string | null) => { const s = (i ?? '').toUpperCase().replace(/[\s-]/g, ''); return /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(s) ? `${s.slice(0, 2)}-${s.slice(2, 5)}-${s.slice(5)}` : s; };

export default function Plaque({ immat, taille = 1 }: { immat?: string | null; taille?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 5 * taille, borderWidth: 1.5, borderColor: '#1b1b1b', overflow: 'hidden', height: 30 * taille }}>
      <View style={{ width: 16 * taille, backgroundColor: '#1e4fbf', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 2 * taille }}>
        <Text style={{ color: '#fff', fontSize: 10 * taille, fontWeight: '800' }}>F</Text>
      </View>
      <Text style={{ color: '#111', fontSize: 17 * taille, fontWeight: '800', letterSpacing: 1.2 * taille, paddingHorizontal: 9 * taille, alignSelf: 'center', fontVariant: ['tabular-nums'] }}>{formatImmat(immat)}</Text>
      <View style={{ width: 16 * taille, backgroundColor: '#1e4fbf' }} />
    </View>
  );
}
