'use client';
// Pendant la saisie d'un client : signale une fiche qui existe peut-être déjà. Rien de bloquant.
import { useEffect, useRef, useState } from 'react';
import { memePersonne, tel } from '@/lib/format';

type Fiche = { id: string; nom: string; prenom: string | null; telephone: string | null };

export default function AlerteDoublon({ clients, sauf }: { clients: Fiche[]; sauf?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [trouve, setTrouve] = useState<Fiche | null>(null);
  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!form) return;
    const lire = () => {
      const v = (n: string) => (form.querySelector(`[name="${n}"]`) as HTMLInputElement | null)?.value ?? '';
      const saisie = { nom: v('nom'), prenom: v('prenom'), telephone: v('telephone') };
      if (!saisie.nom && !saisie.telephone) { setTrouve(null); return; }
      setTrouve(clients.find((c) => c.id !== sauf && memePersonne(saisie, c)) ?? null);
    };
    form.addEventListener('input', lire);
    return () => form.removeEventListener('input', lire);
  }, [clients, sauf]);
  return (
    <div ref={ref} className="pleine" style={{ display: trouve ? 'block' : 'none' }}>
      {trouve && (
        <div className="alerte-doublon">
          Ce client existe peut-être déjà : <b>{[trouve.prenom, trouve.nom].filter(Boolean).join(' ')}</b>{trouve.telephone ? ` · ${tel(trouve.telephone)}` : ''}
          {' '}<a className="lien" href={`/clients/${trouve.id}`} target="_blank" rel="noreferrer">Voir la fiche</a>
        </div>
      )}
    </div>
  );
}
