'use client';
import { useEffect, useState } from 'react';

// Petit message vert en bas de l'écran après chaque action (« Enregistré », « Location créée »…)
export function annoncer(texte: string, erreur = false) {
  window.dispatchEvent(new CustomEvent('fleet:toast', { detail: { texte, erreur } }));
}

export default function Toast() {
  const [msg, setMsg] = useState<{ texte: string; erreur: boolean } | null>(null);
  useEffect(() => {
    let minuteur: ReturnType<typeof setTimeout>;
    const ecoute = (e: Event) => {
      setMsg((e as CustomEvent).detail);
      clearTimeout(minuteur);
      minuteur = setTimeout(() => setMsg(null), 2600);
    };
    window.addEventListener('fleet:toast', ecoute);
    return () => window.removeEventListener('fleet:toast', ecoute);
  }, []);
  if (!msg) return null;
  return <div className={`toast ${msg.erreur ? 'erreur-toast' : ''}`} role="status">{msg.erreur ? '' : '✓ '}{msg.texte}</div>;
}
