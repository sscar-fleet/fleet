// Carte du Suivi dans le navigateur : la même page de carte, dans un iframe (adresse blob).
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { CARTE_HTML } from './carteHtml';
import type { CarteSuiviProps, CarteSuiviRef } from './CarteSuivi';
export type { CarteSuiviRef, CarteSuiviProps, PointCarte } from './CarteSuivi';

const CarteSuivi = forwardRef<CarteSuiviRef, CarteSuiviProps>(function CarteSuivi({ points, choisi, trace, sombre, satellite, marges, onChoisir, onFond, etiquettes = false }, ref) {
  const cadre = useRef<HTMLIFrameElement | null>(null);
  const [prete, setPrete] = useState(false);
  // Page de carte servie par une adresse blob et non par srcdoc : dans un iframe srcdoc, MapLibre ne charge jamais
  // ses tuiles (fond vide, seulement les repères). Vérifié dans Chrome le 28/10.
  const adresse = useMemo(() => URL.createObjectURL(new Blob([CARTE_HTML], { type: 'text/html' })), []);
  useEffect(() => () => URL.revokeObjectURL(adresse), [adresse]);
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
  useEffect(() => { if (prete) envoyer({ type: 'maj', points, choisi, sombre, satellite, marges, trace: trace ?? null, etiquettes }); }, [prete, points, choisi, trace, sombre, satellite, marges.haut, marges.bas, etiquettes]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0b0f12' }}>
      <iframe ref={cadre} src={adresse} title="Carte du suivi" style={{ border: 0, width: '100%', height: '100%', display: 'block' }} />
    </View>
  );
});

export default CarteSuivi;
