'use client';
import { useEffect, useRef, useState } from 'react';

type Client = { id: string; nom: string; prenom: string | null; telephone: string | null; email: string | null; date_permis: string | null; liste_noire: boolean; permis_path: string | null };

// Choix d'un client déjà connu : sa fiche s'affiche et le bloc « nouveau client » disparaît
export default function ChoixClient({ clients, defaut }: { clients: Client[]; defaut?: string }) {
  const [id, setId] = useState(defaut ?? '');
  const ref = useRef<HTMLDivElement>(null);
  const c = clients.find((x) => x.id === id);
  useEffect(() => {
    const bloc = ref.current?.closest('form')?.querySelector<HTMLElement>('[data-nouveau-client]');
    if (bloc) bloc.hidden = !!id;
  }, [id]);
  return (
    <div ref={ref} className="pleine" style={{ display: 'grid', gap: 10 }}>
      <label>Client déjà connu<select name="client_id" value={id} onChange={(e) => setId(e.target.value)}>
        <option value="">— Nouveau client —</option>
        {clients.map((x) => <option key={x.id} value={x.id}>{x.nom} {x.prenom ?? ''}{x.telephone ? ' · ' + x.telephone : ''}{x.liste_noire ? ' ⚑ LISTE NOIRE' : ''}</option>)}
      </select></label>
      {c && (
        <div className={`fiche-client ${c.liste_noire ? 'noire' : ''}`}>
          <b>{c.prenom} {c.nom}</b>
          <span>{c.telephone ?? 'Pas de téléphone'}{c.email ? ' · ' + c.email : ''}</span>
          <span className="gris">{c.date_permis ? `Permis depuis le ${new Date(c.date_permis).toLocaleDateString('fr-FR')}` : 'Date du permis inconnue'} · {c.permis_path ? 'permis scanné ✓' : 'permis à scanner'}</span>
          {c.liste_noire && <span className="retard">⚑ Client en liste noire</span>}
        </div>
      )}
    </div>
  );
}
