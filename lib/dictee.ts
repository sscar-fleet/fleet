'use client';
// Dictée vocale du navigateur (Chrome, Safari, Edge). On parle, le texte s'écrit ; on peut faire des pauses :
// la dictée s'arrête seule après 2,5 s de silence, ou d'un toucher sur le micro. Le texte reste dans le champ.
import { useEffect, useRef, useState } from 'react';

export function dicteeDisponible() {
  return typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

// Safari renvoie parfois des morceaux cumulés (« bonjour », « bonjour je », « bonjour je veux »…) : on ne garde pas les doublons
function assembler(results: any): string {
  let texte = '';
  for (let i = 0; i < results.length; i++) {
    const r = String(results[i][0]?.transcript ?? '').trim();
    if (!r) continue;
    const t = texte.trim();
    if (!t || r.toLowerCase().startsWith(t.toLowerCase())) texte = r;
    else if (t.toLowerCase().endsWith(r.toLowerCase())) continue;
    else texte = t + ' ' + r;
  }
  return texte.replace(/\s+/g, ' ').trim();
}

export function useDictee(surTexte: (t: string) => void, surFin?: (t: string) => void) {
  const [ecoute, setEcoute] = useState(false);
  const [dispo, setDispo] = useState(false);
  const [erreur, setErreur] = useState('');
  const rec = useRef<any>(null);
  const silence = useRef<any>(null);
  const texte = useRef('');
  const rappels = useRef({ surTexte, surFin });
  rappels.current = { surTexte, surFin };
  useEffect(() => { setDispo(dicteeDisponible()); return () => { clearTimeout(silence.current); rec.current?.abort?.(); }; }, []);

  function arreter() { clearTimeout(silence.current); try { rec.current?.stop(); } catch { /* déjà arrêté */ } }
  function demarrer(depart = '') {
    const R = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!R || rec.current) return;
    const r = new R();
    r.lang = 'fr-FR'; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1;
    const base = depart.trim() ? depart.trim() + ' ' : '';
    texte.current = depart;
    setErreur('');
    const relancerSilence = () => { clearTimeout(silence.current); silence.current = setTimeout(arreter, 2500); };
    r.onresult = (e: any) => {
      texte.current = base + assembler(e.results);
      rappels.current.surTexte(texte.current);
      relancerSilence();
    };
    r.onerror = (e: any) => {
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') setErreur('Autorisez le micro pour ce site dans les réglages du téléphone.');
      else if (e?.error === 'no-speech') setErreur('Je n’ai rien entendu. Réessayez.');
      else if (e?.error === 'network') setErreur('La dictée a besoin du réseau.');
    };
    r.onend = () => {
      clearTimeout(silence.current); rec.current = null; setEcoute(false);
      if (texte.current.trim() && texte.current !== depart) rappels.current.surFin?.(texte.current);
    };
    rec.current = r;
    try { r.start(); setEcoute(true); relancerSilence(); } catch { rec.current = null; }
  }
  return { ecoute, dispo, erreur, demarrer, arreter, basculer: (depart = '') => (rec.current ? arreter() : demarrer(depart)) };
}
