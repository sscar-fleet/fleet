'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavigateur } from '@/lib/supabase-navigateur';
import { compresser } from '@/lib/image';

// Une case de l'état des lieux photo : ouvre l'appareil photo, envoie, affiche
export default function PhotoEdl({ agenceId, edlId, position, libelle, numero, url, reference, suivante, action }: {
  agenceId: string; edlId: string; position: string; libelle: string; numero?: number;
  url?: string | null; reference?: string | null; suivante?: boolean;
  action: (chemin: string) => Promise<{ erreur?: string } | void>;
}) {
  const router = useRouter();
  const champ = useRef<HTMLInputElement>(null);
  const [etat, setEtat] = useState('');
  const [apercu, setApercu] = useState<string | null>(null);

  async function envoyer(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setApercu(URL.createObjectURL(f));
    setEtat('Envoi…');
    try {
      const blob = await compresser(f);
      const chemin = `${agenceId}/edl/${edlId}/${position}-${Date.now()}.jpg`;
      const { error } = await supabaseNavigateur().storage.from('documents').upload(chemin, blob, { contentType: 'image/jpeg' });
      if (error) throw error;
      const r = await action(chemin);
      if (r && r.erreur) throw new Error(r.erreur);
      setEtat('');
      if (position === 'libre') setApercu(null);
      router.refresh();
    } catch (err: any) {
      setEtat('Échec : ' + (err?.message ?? 'erreur'));
    } finally {
      if (champ.current) champ.current.value = '';
    }
  }

  const image = apercu ?? url;
  return (
    <div className={`photo ${suivante && !image ? 'suivante' : ''}`} onClick={() => champ.current?.click()} style={{ cursor: 'pointer' }}>
      {image ? <img src={image} alt={libelle} /> : <div className="manque">{suivante ? '📷 Photo suivante' : '📷'}<br />{libelle}</div>}
      <div className="pied">
        <span>{numero ? `${numero}. ` : ''}{libelle}</span>
        {reference && <span className="gris">Départ : <a className="lien" href={reference} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>voir</a></span>}
        {etat ? <span className={etat.startsWith('Échec') ? 'erreur' : 'gris'}>{etat}</span> : image ? <span className="gris">Toucher pour refaire</span> : null}
      </div>
      <input ref={champ} type="file" accept="image/*" capture="environment" hidden onChange={envoyer} />
    </div>
  );
}
