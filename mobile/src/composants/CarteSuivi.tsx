// Carte du Suivi sur iPhone : la même carte que le logiciel (page carteHtml dans une WebView).
// On déplace, on zoome, on touche une voiture pour l'ouvrir ; un toucher ailleurs referme la fiche.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView as WebViewBrut } from 'react-native-webview';
import { CARTE_HTML, type PointCarte } from './carteHtml';
export type { PointCarte } from './carteHtml';

// Les types de react-native-webview 14 se contredisent avec React 19 : on type nous-mêmes ce qu'on utilise
type RefWeb = { injectJavaScript: (js: string) => void };
const WebView = WebViewBrut as unknown as React.ComponentType<Record<string, unknown> & { ref?: React.Ref<RefWeb> }>;

export type CarteSuiviRef = { cadrer: () => void; viser: (id: string) => void };
export type CarteSuiviProps = {
  points: PointCarte[]; choisi: string | null; sombre: boolean; satellite: boolean; marges: { haut: number; bas: number };
  onChoisir: (id: string) => void; onFond: () => void;
};

const CarteSuivi = forwardRef<CarteSuiviRef, CarteSuiviProps>(function CarteSuivi({ points, choisi, sombre, satellite, marges, onChoisir, onFond }, ref) {
  const web = useRef<RefWeb>(null);
  const [prete, setPrete] = useState(false);
  const envoyer = (m: object) => web.current?.injectJavaScript(`window.recevoir && window.recevoir(${JSON.stringify(JSON.stringify(m))}); true;`);
  useImperativeHandle(ref, () => ({ cadrer: () => envoyer({ type: 'cadrer' }), viser: (id) => envoyer({ type: 'viser', id }) }));
  useEffect(() => { if (prete) envoyer({ type: 'maj', points, choisi, sombre, satellite, marges }); }, [prete, points, choisi, sombre, satellite, marges.haut, marges.bas]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0b0f12' }}>
      <WebView ref={web} source={{ html: CARTE_HTML, baseUrl: 'https://fleet.sscarsystem.com' }} originWhitelist={['*']}
        style={{ flex: 1, backgroundColor: '#0b0f12' }} scrollEnabled={false} bounces={false} overScrollMode="never"
        javaScriptEnabled domStorageEnabled setSupportMultipleWindows={false} allowsLinkPreview={false}
        onMessage={(e: any) => {
          let m: any; try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
          if (m.type === 'pret') setPrete(true);
          else if (m.type === 'choisir') onChoisir(m.id);
          else if (m.type === 'fond') onFond();
        }} />
    </View>
  );
});

export default CarteSuivi;
