'use client';
// Barre du haut : un mot ou une plaque lance la recherche, une vraie question part à Fleet AI. Le micro dicte une question.
import { useEffect, useState } from 'react';
import { dicteeDisponible } from '@/lib/dictee';
import { Micro } from './FleetAI';

export default function BarreRecherche() {
  const [micro, setMicro] = useState(false);
  useEffect(() => setMicro(dicteeDisponible()), []);
  return (
    <form action="/recherche" className={`recherche ${micro ? 'avec-micro' : ''}`} role="search" onSubmit={(e) => {
      const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
      if (q.includes('?') || q.split(/\s+/).length >= 3) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('fleet-ai', { detail: q }));
        (e.currentTarget.querySelector('input') as HTMLInputElement).value = '';
      }
    }}>
      <input name="q" type="search" placeholder="Rechercher, ou demander à Fleet AI : « qui rend une voiture demain ? »" aria-label="Rechercher ou demander à Fleet AI" />
      {micro && <button type="button" className="recherche-micro" aria-label="Dicter une question à Fleet AI" title="Dicter une question à Fleet AI"
        onClick={() => window.dispatchEvent(new CustomEvent('fleet-ai', { detail: '__dictee__' }))}><Micro /></button>}
    </form>
  );
}
