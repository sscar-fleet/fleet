
// Dictée vocale du navigateur (Chrome, Safari, Edge) : on parle, le texte s'écrit, et on l'envoie à la fin.
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export function dicteeDisponible() {
  return Platform.OS === 'web' && typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export function useDictee(surTexte: (t: string) => void, surFin: (t: string) => void) {
  const [ecoute, setEcoute] = useState(false);
  const [dispo, setDispo] = useState(false);
  const rec = useRef<any>(null);
  const texte = useRef('');
  const rappels = useRef({ surTexte, surFin });
  rappels.current = { surTexte, surFin };
  useEffect(() => { setDispo(dicteeDisponible()); return () => rec.current?.abort?.(); }, []);

  function demarrer(depart = '') {
    const R = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!R) return;
    const r = new R();
    r.lang = 'fr-FR'; r.interimResults = true; r.continuous = false;
    const base = depart ? depart.trimEnd() + ' ' : '';
    texte.current = depart;
    r.onresult = (e: any) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      texte.current = base + t;
      rappels.current.surTexte(texte.current);
    };
    r.onerror = () => setEcoute(false);
    r.onend = () => { setEcoute(false); rec.current = null; if (texte.current.trim() && texte.current !== depart) rappels.current.surFin(texte.current); };
    rec.current = r; setEcoute(true); r.start();
  }
  function arreter() { rec.current?.stop(); }
  return { ecoute, dispo, demarrer, arreter, basculer: (depart = '') => (ecoute ? arreter() : demarrer(depart)) };
}
