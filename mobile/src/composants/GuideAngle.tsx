// Croquis de guidage : la voiture vue de dessus, l'endroit où se placer et la zone à photographier
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

type Pose = { cam: [number, number]; cible: [number, number]; zone?: 'avant' | 'arriere' | 'gauche_av' | 'gauche_ar' | 'droit_av' | 'droit_ar'; roue?: [number, number] };
const POSES: Record<string, Pose> = {
  face_avant: { cam: [50, 5], cible: [50, 16], zone: 'avant' },
  face_arriere: { cam: [50, 95], cible: [50, 84], zone: 'arriere' },
  lateral_gauche_avant: { cam: [10, 20], cible: [33, 34], zone: 'gauche_av' },
  lateral_gauche_arriere: { cam: [10, 80], cible: [33, 66], zone: 'gauche_ar' },
  lateral_droit_avant: { cam: [90, 20], cible: [67, 34], zone: 'droit_av' },
  lateral_droit_arriere: { cam: [90, 80], cible: [67, 66], zone: 'droit_ar' },
  roue_avant_gauche: { cam: [14, 30], cible: [31, 30], roue: [33, 30] },
  roue_arriere_gauche: { cam: [14, 70], cible: [31, 70], roue: [33, 70] },
  roue_arriere_droite: { cam: [86, 70], cible: [69, 70], roue: [67, 70] },
  roue_avant_droite: { cam: [86, 30], cible: [69, 30], roue: [67, 30] },
};

export default function GuideAngle({ position, couleur, trait, taille = 64 }: { position: string; couleur: string; trait: string; taille?: number }) {
  if (position === 'compteur') {
    // Tableau de bord : compteur et jauge de carburant
    return (
      <Svg width={taille} height={taille} viewBox="0 0 100 100">
        <Rect x={8} y={26} width={84} height={50} rx={14} stroke={trait} strokeWidth={3} fill="none" />
        <Path d="M22 62a16 16 0 0 1 32 0" stroke={couleur} strokeWidth={4} fill="none" strokeLinecap="round" />
        <Line x1={38} y1={62} x2={46} y2={50} stroke={couleur} strokeWidth={4} strokeLinecap="round" />
        <Path d="M60 62a12 12 0 0 1 24 0" stroke={couleur} strokeWidth={4} fill="none" strokeLinecap="round" />
        <Line x1={72} y1={62} x2={66} y2={54} stroke={couleur} strokeWidth={3.5} strokeLinecap="round" />
        <Rect x={30} y={66} width={16} height={6} rx={2} fill={couleur} />
      </Svg>
    );
  }
  const p = POSES[position];
  if (!p) return null;
  const zones: Record<string, string> = {
    avant: 'M38 17 Q50 11 62 17', arriere: 'M38 83 Q50 89 62 83',
    gauche_av: 'M35 22 L35 48', gauche_ar: 'M35 52 L35 78', droit_av: 'M65 22 L65 48', droit_ar: 'M65 52 L65 78',
  };
  const [cx, cy] = p.cam, [tx, ty] = p.cible;
  const ang = Math.atan2(ty - cy, tx - cx), fx = tx - Math.cos(ang) * 4, fy = ty - Math.sin(ang) * 4;
  return (
    <Svg width={taille} height={taille} viewBox="0 0 100 100">
      {/* Voiture vue de dessus, l'avant en haut */}
      <Rect x={35} y={14} width={30} height={72} rx={11} stroke={trait} strokeWidth={2.5} fill="none" />
      <Path d="M39 33 Q50 28 61 33 L59 41 Q50 38 41 41 Z" stroke={trait} strokeWidth={2} fill="none" />
      <Path d="M41 66 Q50 69 59 66 L60 73 Q50 76 40 73 Z" stroke={trait} strokeWidth={2} fill="none" />
      {[[32, 30], [68, 30], [32, 70], [68, 70]].map(([x, y]) => (
        <Rect key={`${x}${y}`} x={x - 2.5} y={y - 6} width={5} height={12} rx={2} fill={p.roue && p.roue[0] === (x < 50 ? 33 : 67) && p.roue[1] === y ? couleur : trait} />
      ))}
      {p.zone && <Path d={zones[p.zone]} stroke={couleur} strokeWidth={5} strokeLinecap="round" fill="none" />}
      {/* Où se placer et dans quelle direction viser */}
      <Line x1={cx} y1={cy} x2={fx} y2={fy} stroke={couleur} strokeWidth={2} strokeDasharray="3 3" />
      <G>
        <Circle cx={cx} cy={cy} r={6.5} fill={couleur} />
        <Rect x={cx - 3.2} y={cy - 2.2} width={6.4} height={4.6} rx={1} fill="#fff" />
        <Circle cx={cx} cy={cy + 0.1} r={1.4} fill={couleur} />
      </G>
    </Svg>
  );
}
