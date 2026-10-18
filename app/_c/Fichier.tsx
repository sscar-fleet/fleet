'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavigateur } from '@/lib/supabase-navigateur';
import { compresser } from '@/lib/image';

// Envoi d'un document ou d'une photo dans le stockage privé de l'agence,
// puis enregistrement du chemin dans la fiche (action serveur).
export default function Fichier({
  agenceId, dossier, nom, action, libelle, lien, accept = 'image/*,application/pdf', camera = false, compact = false,
}: {
  agenceId: string; dossier: string; nom: string;
  action: (chemin: string) => Promise<{ erreur?: string } | void>;
  libelle: string; lien?: string | null; accept?: string; camera?: boolean; compact?: boolean;
}) {
  const router = useRouter();
  const champ = useRef<HTMLInputElement>(null);
  const [etat, setEtat] = useState('');

  async function envoyer(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setEtat('Envoi…');
    try {
      const contenu = await compresser(fichier);
      const ext = contenu.type === 'image/jpeg' ? 'jpg' : (fichier.name.split('.').pop() || 'bin').toLowerCase();
      const chemin = `${agenceId}/${dossier}/${nom}-${Date.now()}.${ext}`;
      const { error } = await supabaseNavigateur().storage.from('documents')
        .upload(chemin, contenu, { contentType: contenu.type || fichier.type, upsert: true });
      if (error) throw error;
      const r = await action(chemin);
      if (r && r.erreur) throw new Error(r.erreur);
      setEtat('');
      router.refresh();
    } catch (err: any) {
      setEtat('Échec de l’envoi : ' + (err?.message ?? 'erreur'));
    } finally {
      if (champ.current) champ.current.value = '';
    }
  }

  return (
    <div className={compact ? 'fichier compact' : 'fichier'}>
      <span className="fichier-titre">{libelle}</span>
      <span className="fichier-actions">
        {lien ? <a className="lien" href={lien} target="_blank" rel="noreferrer">Voir</a> : <span className="gris">Aucun</span>}
        <button type="button" className="bouton petit" onClick={() => champ.current?.click()}>
          {lien ? 'Remplacer' : camera ? 'Photo' : 'Ajouter'}
        </button>
      </span>
      {etat && <span className={etat.startsWith('Échec') ? 'erreur' : 'gris'}>{etat}</span>}
      <input ref={champ} type="file" accept={accept} capture={camera ? 'environment' : undefined} hidden onChange={envoyer} />
    </div>
  );
}
