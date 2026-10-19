// Calendrier du mois : premier toucher = départ, second toucher = retour. Les jours entre les deux sont surlignés.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useCouleurs, T } from '@/lib/theme';
import Icone from './Icone';

const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const jourSeul = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };

export default function Calendrier({ debut, fin, onChange, retourSeul = false }: { debut: Date; fin: Date; onChange: (debut: Date, fin: Date) => void; retourSeul?: boolean }) {
  const c = useCouleurs();
  const [mois, setMois] = useState(() => { const r = retourSeul ? fin : debut; return new Date(r.getFullYear(), r.getMonth(), 1); });
  const [attenteRetour, setAttenteRetour] = useState(false);
  const aujourdhui = jourSeul(new Date());
  const premier = (mois.getDay() + 6) % 7; // lundi = 0
  const nb = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate();
  const cases: (Date | null)[] = [...Array(premier).fill(null), ...Array.from({ length: nb }, (_, i) => new Date(mois.getFullYear(), mois.getMonth(), i + 1))];
  while (cases.length % 7) cases.push(null);
  const d0 = jourSeul(debut), d1 = jourSeul(fin);
  const avecHeure = (jour: Date, modele: Date) => { const x = new Date(jour); x.setHours(modele.getHours(), modele.getMinutes(), 0, 0); return x; };

  function toucher(jour: Date) {
    Haptics.selectionAsync().catch(() => {});
    const t = jourSeul(jour);
    if (!retourSeul && (!attenteRetour || t < d0)) {
      // Nouveau départ : on garde la durée si elle tient, sinon 1 jour
      const nd = avecHeure(jour, debut);
      const duree = Math.max(864e5, fin.getTime() - debut.getTime());
      onChange(nd, new Date(nd.getTime() + duree));
      setAttenteRetour(true);
    } else {
      let nf = avecHeure(jour, fin);
      if (nf <= debut) nf = new Date(debut.getTime() + 864e5);
      onChange(debut, nf);
      setAttenteRetour(false);
    }
  }
  const changerMois = (n: number) => setMois(new Date(mois.getFullYear(), mois.getMonth() + n, 1));
  const passe = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getTime() < aujourdhui;

  return (
    <View style={{ backgroundColor: c.panneau, borderRadius: T.rayon, borderWidth: 1, borderColor: c.bord, padding: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable hitSlop={10} disabled={passe || (mois.getFullYear() === new Date().getFullYear() && mois.getMonth() === new Date().getMonth())} onPress={() => changerMois(-1)}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.panneau2, alignItems: 'center', justifyContent: 'center' }}>
          <Icone nom="retour" couleur={c.texte} taille={18} />
        </Pressable>
        <Text style={{ color: c.texte, fontSize: 18, fontWeight: '800', textTransform: 'capitalize' }}>{mois.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</Text>
        <Pressable hitSlop={10} onPress={() => changerMois(1)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.panneau2, alignItems: 'center', justifyContent: 'center' }}>
          <Icone nom="chevron" couleur={c.texte} taille={18} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {JOURS.map((j, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.gris, fontSize: 12, fontWeight: '800' }}>{j}</Text>)}
      </View>
      {Array.from({ length: cases.length / 7 }, (_, l) => (
        <View key={l} style={{ flexDirection: 'row' }}>
          {cases.slice(l * 7, l * 7 + 7).map((jour, i) => {
            if (!jour) return <View key={i} style={{ flex: 1, height: 44 }} />;
            const t = jour.getTime();
            const estDebut = t === d0, estFin = t === d1, dedans = t > d0 && t < d1;
            const ancien = t < aujourdhui || (retourSeul && t < d0);
            const borne = estDebut || estFin;
            return (
              <Pressable key={i} disabled={ancien} onPress={() => toucher(jour)} style={{ flex: 1, height: 44, justifyContent: 'center' }}>
                {(dedans || (estDebut && d1 > d0) || (estFin && d1 > d0)) && (
                  <View style={{ position: 'absolute', top: 5, bottom: 5, left: estDebut ? '50%' : 0, right: estFin ? '50%' : 0, backgroundColor: c.accent + '26' }} />
                )}
                <View style={{ alignSelf: 'center', width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: borne ? c.accent : 'transparent',
                  borderWidth: t === aujourdhui && !borne ? 1.5 : 0, borderColor: c.accent }}>
                  <Text style={{ color: borne ? c.surAccent : ancien ? c.bord : c.texte, fontSize: 16, fontWeight: borne ? '900' : '600' }}>{jour.getDate()}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <Text style={{ color: attenteRetour ? c.accent : c.gris, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>
        {retourSeul ? 'Touchez le nouveau jour de retour' : attenteRetour ? 'Touchez maintenant le jour du retour' : 'Touchez le jour du départ, puis celui du retour'}
      </Text>
    </View>
  );
}
