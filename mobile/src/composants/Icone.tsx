// Jeu d'icônes de l'appli, dessinées au trait (24 × 24)
import Svg, { Path, Circle, Rect } from 'react-native-svg';

export type NomIcone =
  | 'jour' | 'locations' | 'flotte' | 'amendes' | 'plus' | 'tel' | 'message' | 'whatsapp' | 'mail' | 'photo' | 'carte' | 'itineraire'
  | 'moteur' | 'cle' | 'ok' | 'alerte' | 'ajout' | 'chevron' | 'retour' | 'horloge' | 'euro' | 'bouclier' | 'doc' | 'signature'
  | 'jauge' | 'carburant' | 'recherche' | 'actualiser' | 'client' | 'voiture' | 'calendrier' | 'cadenas' | 'envoyer' | 'nuage'
  | 'fermer' | 'eclair' | 'outil' | 'depart' | 'arrivee' | 'prolonger' | 'degat' | 'carteId' | 'sync' | 'site' | 'sortie' | 'micro';

export default function Icone({ nom, couleur, taille = 24, epaisseur = 2 }: { nom: NomIcone; couleur: string; taille?: number; epaisseur?: number }) {
  const p = { stroke: couleur, strokeWidth: epaisseur, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const plein = { fill: couleur };
  return (
    <Svg width={taille} height={taille} viewBox="0 0 24 24">
      {nom === 'jour' && <><Rect x={3} y={4.5} width={18} height={16} rx={3} {...p} /><Path d="M3 9.5h18M8 2.5v4M16 2.5v4" {...p} /><Circle cx={12} cy={15} r={2} {...plein} /></>}
      {nom === 'calendrier' && <><Rect x={3} y={4.5} width={18} height={16} rx={3} {...p} /><Path d="M3 9.5h18M8 2.5v4M16 2.5v4M7.5 13.5h3M13.5 13.5h3M7.5 17h3" {...p} /></>}
      {(nom === 'locations' || nom === 'voiture') && <><Path d="M5 16.5V12l2-5h10l2 5v4.5" {...p} /><Path d="M3.5 16.5h17v2.5h-17z" {...p} /><Circle cx={7.5} cy={13.5} r={1} {...plein} /><Circle cx={16.5} cy={13.5} r={1} {...plein} /></>}
      {nom === 'flotte' && <><Rect x={3} y={3} width={7.5} height={7.5} rx={2} {...p} /><Rect x={13.5} y={3} width={7.5} height={7.5} rx={2} {...p} /><Rect x={3} y={13.5} width={7.5} height={7.5} rx={2} {...p} /><Rect x={13.5} y={13.5} width={7.5} height={7.5} rx={2} {...p} /></>}
      {nom === 'amendes' && <><Path d="M6 3h9l4 4v14H6z" {...p} /><Path d="M14.5 3v4.5H19M9 12h7M9 16h5" {...p} /></>}
      {nom === 'doc' && <><Path d="M6 3h9l4 4v14H6z" {...p} /><Path d="M14.5 3v4.5H19M9 12h7M9 16h7" {...p} /></>}
      {nom === 'plus' && <><Circle cx={5} cy={12} r={1.6} {...plein} /><Circle cx={12} cy={12} r={1.6} {...plein} /><Circle cx={19} cy={12} r={1.6} {...plein} /></>}
      {nom === 'micro' && <><Rect x={9} y={3} width={6} height={11} rx={3} {...p} /><Path d="M5 11a7 7 0 0 0 14 0M12 18v3" {...p} /></>}
      {nom === 'tel' && <Path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" {...p} />}
      {nom === 'message' && <Path d="M4 5h16v11H9l-5 4z" {...p} />}
      {nom === 'whatsapp' && <><Path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" {...p} /><Path d="M9.2 9.3c.2 2.6 2.6 5 5.4 5.4l1-1.2-1.6-.9-.8.7c-.9-.4-1.8-1.3-2.2-2.2l.7-.8-.9-1.6z" {...plein} /></>}
      {nom === 'mail' && <><Rect x={3} y={5} width={18} height={14} rx={2.5} {...p} /><Path d="M3.5 6.5L12 13l8.5-6.5" {...p} /></>}
      {nom === 'photo' && <><Path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" {...p} /><Circle cx={12} cy={13} r={3.5} {...p} /></>}
      {nom === 'carte' && <><Path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" {...p} /><Path d="M9 4v14M15 6v14" {...p} /></>}
      {nom === 'itineraire' && <><Path d="M12 2.5l8 19-8-4.5-8 4.5z" {...p} /></>}
      {nom === 'moteur' && <><Path d="M12 3v8" {...p} /><Path d="M7 6.3a7.5 7.5 0 1 0 10 0" {...p} /></>}
      {nom === 'cle' && <><Circle cx={8} cy={15} r={4} {...p} /><Path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2" {...p} /></>}
      {nom === 'ok' && <Path d="M4.5 12.5l5 5 10-11" {...p} />}
      {nom === 'alerte' && <><Path d="M12 3.5l9.5 16.5h-19z" {...p} /><Path d="M12 10v4.5" {...p} /><Circle cx={12} cy={17.3} r={1.1} {...plein} /></>}
      {nom === 'ajout' && <Path d="M12 5v14M5 12h14" {...p} />}
      {nom === 'chevron' && <Path d="M9 5l7 7-7 7" {...p} />}
      {nom === 'retour' && <Path d="M15 5l-7 7 7 7" {...p} />}
      {nom === 'fermer' && <Path d="M6 6l12 12M18 6L6 18" {...p} />}
      {nom === 'horloge' && <><Circle cx={12} cy={12} r={8.5} {...p} /><Path d="M12 7.5V12l3 2" {...p} /></>}
      {nom === 'euro' && <><Path d="M17 6.5A6.5 6.5 0 1 0 17 17.5" {...p} /><Path d="M4.5 10.5h8M4.5 13.5h8" {...p} /></>}
      {nom === 'bouclier' && <><Path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z" {...p} /><Path d="M8.5 12l2.5 2.5 4.5-5" {...p} /></>}
      {nom === 'signature' && <><Path d="M3 17c3-6 5-9 6.5-9S9 14 11 14s2.5-3 4-3 1 3 2.5 3H21" {...p} /><Path d="M3 20.5h18" {...p} /></>}
      {nom === 'jauge' && <><Path d="M3.5 17a8.5 8.5 0 1 1 17 0" {...p} /><Path d="M12 17l4-6" {...p} /><Circle cx={12} cy={17} r={1.4} {...plein} /></>}
      {nom === 'carburant' && <><Path d="M5 20V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 14 5v15M3.5 20h12M5 10h9" {...p} /><Path d="M14 8.5h2l2 2V17a1.5 1.5 0 0 0 3 0V8l-3-3" {...p} /></>}
      {nom === 'recherche' && <><Circle cx={11} cy={11} r={6.5} {...p} /><Path d="M16 16l4.5 4.5" {...p} /></>}
      {(nom === 'actualiser' || nom === 'sync') && <><Path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" {...p} /><Path d="M4 3.5V8h4.5M4 13a8 8 0 0 0 14.5 4.5L20 16" {...p} /><Path d="M20 20.5V16h-4.5" {...p} /></>}
      {nom === 'client' && <><Circle cx={12} cy={8} r={4} {...p} /><Path d="M4 20.5c1.2-4 4.3-6 8-6s6.8 2 8 6" {...p} /></>}
      {nom === 'carteId' && <><Rect x={2.5} y={5} width={19} height={14} rx={2.5} {...p} /><Circle cx={8.5} cy={11} r={2.2} {...p} /><Path d="M5.5 16c.6-1.5 1.7-2.2 3-2.2s2.4.7 3 2.2M14 10h4.5M14 13.5h3" {...p} /></>}
      {nom === 'cadenas' && <><Rect x={5} y={10.5} width={14} height={10} rx={2.5} {...p} /><Path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" {...p} /></>}
      {nom === 'envoyer' && <Path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" {...p} />}
      {nom === 'nuage' && <Path d="M7 18.5a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5 4 4 0 0 1-.5 7.5z" {...p} />}
      {nom === 'eclair' && <Path d="M13 2.5L4.5 13.5H12l-1 8 8.5-11H12z" {...p} />}
      {nom === 'outil' && <Path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5zM14.5 6.5L17 4" {...p} />}
      {nom === 'depart' && <><Path d="M5 21V4M5 4h11l-2 3.5 2 3.5H5" {...p} /></>}
      {nom === 'arrivee' && <><Path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" {...p} /><Circle cx={12} cy={10} r={2.3} {...p} /></>}
      {nom === 'prolonger' && <><Circle cx={11} cy={12} r={7.5} {...p} /><Path d="M11 8v4l2.5 1.5M19 4v4h-4" {...p} /></>}
      {nom === 'degat' && <><Path d="M4 20l5-6 3 3 4-7 4 10z" {...p} /><Path d="M14 4l1.5 2.5L18 5l-.5 3" {...p} /></>}
      {nom === 'site' && <><Rect x={3} y={4} width={18} height={13} rx={2} {...p} /><Path d="M8 21h8M12 17v4" {...p} /></>}
      {nom === 'sortie' && <><Path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" {...p} /><Path d="M10 8l-4 4 4 4M6 12h10" {...p} /></>}
    </Svg>
  );
}
