'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavigateur } from '@/lib/supabase-navigateur';
import { compresser } from '@/lib/image';

// Zone où l'on glisse (ou choisit) une ou plusieurs factures : PDF ou photos
export default function Depot({ agenceId, dossier, action, pieces = [], libelle = 'Factures et justificatifs' }: {
  agenceId: string; dossier: string;
  action: (chemin: string, nom: string) => Promise<{ erreur?: string } | void>;
  pieces?: { id: string; nom: string; lien?: string | null }[]; libelle?: string;
}) {
  const router = useRouter();
  const champ = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [etat, setEtat] = useState('');

  async function envoyer(fichiers: FileList | File[]) {
    const liste = Array.from(fichiers).filter((f) => f.type === 'application/pdf' || f.type.startsWith('image/'));
    if (!liste.length) return setEtat('Seuls les PDF et les photos sont acceptés.');
    try {
      for (const [i, f] of liste.entries()) {
        setEtat(`Envoi ${i + 1}/${liste.length}…`);
        const contenu = f.type === 'application/pdf' ? f : await compresser(f, 2000);
        const ext = f.type === 'application/pdf' ? 'pdf' : 'jpg';
        const chemin = `${agenceId}/${dossier}/${Date.now()}-${i}.${ext}`;
        const { error } = await supabaseNavigateur().storage.from('documents').upload(chemin, contenu, { contentType: contenu.type || f.type });
        if (error) throw error;
        const r = await action(chemin, f.name);
        if (r && r.erreur) throw new Error(r.erreur);
      }
      setEtat('');
      router.refresh();
    } catch (err: any) {
      setEtat('Échec : ' + (err?.message ?? 'erreur'));
    } finally {
      if (champ.current) champ.current.value = '';
    }
  }

  return (
    <div className="depot-bloc">
      {pieces.length > 0 && (
        <div className="pieces">
          {pieces.map((p) => (
            <a key={p.id} className="piece" href={p.lien ?? '#'} target="_blank" rel="noreferrer" title={p.nom}>📄 {p.nom}</a>
          ))}
        </div>
      )}
      <div className={`depot ${survol ? 'survol' : ''}`}
        onClick={() => champ.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setSurvol(true); }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => { e.preventDefault(); setSurvol(false); envoyer(e.dataTransfer.files); }}>
        <span>{etat || <>Glisser ici les {libelle.toLowerCase()} <span className="gris">(PDF ou photo) · ou toucher pour choisir</span></>}</span>
      </div>
      <input ref={champ} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => e.target.files && envoyer(e.target.files)} />
    </div>
  );
}
