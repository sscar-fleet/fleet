// Icônes des onglets, dessinées simplement
import Svg, { Path, Circle, Rect } from 'react-native-svg';

export default function Icone({ nom, couleur, taille = 26 }: { nom: 'jour' | 'locations' | 'flotte' | 'amendes' | 'plus'; couleur: string; taille?: number }) {
  const p = { stroke: couleur, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={taille} height={taille} viewBox="0 0 24 24">
      {nom === 'jour' && <><Rect x={3} y={4.5} width={18} height={16} rx={3} {...p} /><Path d="M3 9.5h18M8 2.5v4M16 2.5v4" {...p} /><Circle cx={12} cy={15} r={2} fill={couleur} /></>}
      {nom === 'locations' && <><Path d="M5 16.5V12l2-5h10l2 5v4.5" {...p} /><Path d="M3.5 16.5h17v2.5h-17z" {...p} /><Circle cx={7.5} cy={13.5} r={1} fill={couleur} /><Circle cx={16.5} cy={13.5} r={1} fill={couleur} /></>}
      {nom === 'flotte' && <><Rect x={3} y={3} width={7.5} height={7.5} rx={2} {...p} /><Rect x={13.5} y={3} width={7.5} height={7.5} rx={2} {...p} /><Rect x={3} y={13.5} width={7.5} height={7.5} rx={2} {...p} /><Rect x={13.5} y={13.5} width={7.5} height={7.5} rx={2} {...p} /></>}
      {nom === 'amendes' && <><Path d="M6 3h9l4 4v14H6z" {...p} /><Path d="M14.5 3v4.5H19M9 12h7M9 16h5" {...p} /></>}
      {nom === 'plus' && <><Circle cx={5} cy={12} r={1.6} fill={couleur} /><Circle cx={12} cy={12} r={1.6} fill={couleur} /><Circle cx={19} cy={12} r={1.6} fill={couleur} /></>}
    </Svg>
  );
}
