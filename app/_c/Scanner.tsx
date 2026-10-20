'use client';
import { useRef, useState } from 'react';
import { supabaseNavigateur } from '@/lib/supabase-navigateur';
import { compresser } from '@/lib/image';

// Photo d'un papier : la photo est rangée dans le stockage (champ caché) et les champs du formulaire se remplissent seuls
export default function Scanner({ genre, agenceId, champChemin, libelle, lire: lecture = true }: {
  genre: 'carte_grise' | 'permis' | 'identite' | 'domicile' | 'fps' | 'amende'; agenceId: string; champChemin: string; libelle: string; lire?: boolean;
}) {
  const bouton = useRef<HTMLButtonElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const [etat, setEtat] = useState('');

  async function lire(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const formulaire = bouton.current?.closest('form');
    setEtat(lecture ? 'Lecture du document…' : 'Envoi de la photo…');
    try {
      // PDF (avis reçu par e-mail) : déposé tel quel, puis lu sur le serveur
      if (f.type === 'application/pdf') {
        const chemin = `${agenceId}/scans/${genre}-${Date.now()}.pdf`;
        const { error } = await supabaseNavigateur().storage.from('documents').upload(chemin, f, { contentType: 'application/pdf' });
        if (error) throw error;
        const cache = formulaire?.querySelector<HTMLInputElement>(`input[name="${champChemin}"]`);
        if (cache) cache.value = chemin;
        if (!lecture) { setEtat('Document enregistré ✓'); return; }
        const rep = await fetch('/api/lire', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chemin, genre }) });
        const res = await rep.json();
        if (!rep.ok) { setEtat('Document enregistré. ' + (res.erreur ?? 'Lecture impossible.')); return; }
        remplir(res.champs ?? {});
        return;
      }
      const blob = await compresser(f, 1800);
      const chemin = `${agenceId}/scans/${genre}-${Date.now()}.jpg`;
      const envoi = supabaseNavigateur().storage.from('documents').upload(chemin, blob, { contentType: 'image/jpeg' });
      if (!lecture) {
        const { error } = await envoi;
        if (error) throw error;
        const cache = formulaire?.querySelector<HTMLInputElement>(`input[name="${champChemin}"]`);
        if (cache) cache.value = chemin;
        setEtat('Photo enregistrée ✓');
        return;
      }
      const image: string = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(blob); });
      const [rep, { error }] = await Promise.all([fetch('/api/lire', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image, genre }) }), envoi]);
      if (!error && formulaire) {
        const cache = formulaire.querySelector<HTMLInputElement>(`input[name="${champChemin}"]`);
        if (cache) cache.value = chemin;
      }
      const res = await rep.json();
      if (!rep.ok) { setEtat((error ? '' : 'Photo enregistrée. ') + (res.erreur ?? 'Lecture impossible.')); return; }
      remplir(res.champs ?? {});
    } catch (err: any) {
      setEtat('Échec : ' + (err?.message ?? 'erreur'));
    } finally {
      if (champ.current) champ.current.value = '';
    }
  }

  function remplir(champs: Record<string, unknown>) {
    const formulaire = bouton.current?.closest('form');
    let n = 0;
    Object.entries(champs).forEach(([cle, valeur]) => {
      if (valeur === null || valeur === undefined || valeur === '') return;
      const el = formulaire?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${cle}"]`);
      if (!el || (el as HTMLInputElement).value) return; // on n'écrase pas une saisie
      el.value = String(valeur); n++;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    setEtat(n ? `${n} champ${n > 1 ? 's' : ''} rempli${n > 1 ? 's' : ''} : vérifiez avant d’enregistrer.` : 'Rien de lisible : reprenez la photo bien à plat.');
  }

  return (
    <div className="pleine scanner">
      <button ref={bouton} type="button" className="bouton" onClick={() => champ.current?.click()}>📷 {libelle}</button>
      {etat && <span className={etat.startsWith('Échec') ? 'erreur' : 'gris'}>{etat}</span>}
      <input ref={champ} type="file" accept={genre === 'fps' || genre === 'amende' ? 'image/*,application/pdf' : 'image/*'} capture={genre === 'fps' || genre === 'amende' ? undefined : 'environment'} hidden onChange={lire} />
    </div>
  );
}
