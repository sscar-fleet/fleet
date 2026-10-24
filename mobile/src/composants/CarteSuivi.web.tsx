// Carte du Suivi dans le navigateur : la même page de carte, dans un iframe.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View } from 'react-native';
import { CARTE_HTML } from './carteHtml';
import type { CarteSuiviProps, CarteSuiviRef } from './CarteSuivi';
export type { CarteSuiviRef, CarteSuiviProps, PointCarte } from './CarteSuivi';

const CarteSuivi = forwardRef<CarteSuiviRef, CarteSuiviProps>(function CarteSuivi({ points, choisi, sombre, satellite, marges, onChoisir, onFond }, ref) {
  const cadre = useRef<HTMLIFrameElement | null>(null);
  const [prete, setPrete] = useState(false);
  const envoyer = (m: object) => cadre.current?.contentWindow?.postMessage({ carteSuivi: m }, '*');
  useImperativeHandle(ref, () => ({ cadrer: () => envoyer({ type: 'cadrer' }), viser: (id) => envoyer({ type: 'viser', id }) }));
  useEffect(() => {
    const ecoute = (e: MessageEvent) => {
      if (e.source !== cadre.current?.contentWindow || !e.data?.carteSuivi) return;
      const m = e.data.carteSuivi;
      if (m.type === 'pret') setPrete(true); else if (m.type === 'choisir') onChoisir(m.id); else if (m.type === 'fond') onFond();
    };
    window.addEventListener('message', ecoute);
    return () => window.removeEventListener('message', ecoute);
  }, [onChoisir, onFond]);
  useEffect(() => { if (prete) envoyer({ type: 'maj', points, choisi, sombre, satellite, marges }); }, [prete, points, choisi, sombre, satellite, marges.haut, marges.bas]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0b0f12' }}>
      <iframe ref={cadre} srcDoc={CARTE_HTML} title="Carte du suivi" style={{ border: 0, width: '100%', height: '100%', display: 'block' }} />
    </View>
  );
});

export default CarteSuivi;
