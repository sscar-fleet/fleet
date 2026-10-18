import { useColorScheme } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { LOGO_BLANC, LOGO_NOIR } from './logos';

// Le logo garde ses proportions (454 × 190) ; la ligne turquoise fait partie de la charte
export default function Logo({ largeur = 220 }: { largeur?: number }) {
  const clair = useColorScheme() === 'light';
  return <SvgXml xml={clair ? LOGO_NOIR : LOGO_BLANC} width={largeur} height={(largeur * 190) / 454} />;
}
