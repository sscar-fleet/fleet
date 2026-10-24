import { useColorScheme } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { LOGO_BLANC, LOGO_NOIR, FLEET_BLANC, FLEET_NOIR } from './logos';

// « complet » = SS CAR FLEET (454 × 190) ; « fleet » = FLEET seul (887 × 269). La ligne turquoise fait partie de la charte.
export default function Logo({ largeur = 220, variante = 'complet' }: { largeur?: number; variante?: 'complet' | 'fleet' }) {
  const clair = useColorScheme() === 'light';
  if (variante === 'fleet') return <SvgXml xml={clair ? FLEET_NOIR : FLEET_BLANC} width={largeur} height={(largeur * 269) / 887} />;
  return <SvgXml xml={clair ? LOGO_NOIR : LOGO_BLANC} width={largeur} height={(largeur * 190) / 454} />;
}
