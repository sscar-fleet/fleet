'use client';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { supabaseNavigateur } from '@/lib/supabase-navigateur';
import { compresser } from '@/lib/image';

// Documents qu'on reçoit souvent par courrier : on peut aussi les photographier avec le téléphone (QR code)
const AVEC_TELEPHONE = ['fps', 'amende', 'carte_grise'];
const NOMS: Record<string, string> = { fps: 'l’avis de FPS', amende: 'l’avis de contravention', carte_grise: 'la carte grise', permis: 'le permis' };

// Photo d'un papier : la photo est rangée dans le stockage (champ caché) et les champs du formulaire se remplissent seuls
export default function Scanner({ genre, agenceId, champChemin, libelle, lire: lecture = true, telephone = false }: {
  genre: 'carte_grise' | 'permis' | 'identite' | 'domicile' | 'fps' | 'amende'; agenceId: string; champChemin: string; libelle: string; lire?: boolean;
  telephone?: boolean; // grande zone avec QR code même pour ce papier (ex. permis d'un chauffeur)
}) {
  const bouton = useRef<HTMLButtonElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const [etat, setEtat] = useState('');
  const grand = telephone || AVEC_TELEPHONE.includes(genre);
  const [survol, setSurvol] = useState(false);
  const [qr, setQr] = useState<{ id: string; image: string; expire: string } | null>(null);
  const [qrEtat, setQrEtat] = useState('');

  // Séance de scan par téléphone : le document arrive ici en direct et remplit le formulaire
  async function ouvrirTelephone() {
    setQrEtat('Préparation du QR code…');
    const r = await fetch('/api/scans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ genre }) });
    const res = await r.json();
    if (!r.ok) { setQrEtat(res.erreur ?? 'QR code impossible pour le moment.'); return; }
    setQr({ id: res.id, image: await QRCode.toDataURL(res.lien, { margin: 1, width: 440 }), expire: res.expire_le });
    setQrEtat('Visez le QR code avec l’appareil photo du téléphone');
  }
  useEffect(() => {
    if (!qr) return;
    const sb = supabaseNavigateur();
    let chemin = '', lu = '';
    const appliquer = (ligne: any) => {
      if (!ligne) return;
      const c = ligne.pieces?.document_path;
      if (c && c !== chemin) {
        chemin = c;
        const cache = bouton.current?.closest('form')?.querySelector<HTMLInputElement>(`input[name="${champChemin}"]`);
        if (cache) cache.value = c;
        setQrEtat('Photo reçue · lecture en cours…');
      }
      const champs = ligne.champs ?? {};
      const cle = JSON.stringify(champs);
      if (Object.keys(champs).length && cle !== lu) { lu = cle; remplir(champs); setQr(null); }
    };
    const lire = () => sb.from('scans').select('pieces, champs').eq('id', qr.id).maybeSingle().then(({ data }) => appliquer(data));
    const canal = sb.channel('scan-doc-' + qr.id)
      .on('postgres_changes' as any, { event: 'UPDATE', schema: 'public', table: 'scans', filter: `id=eq.${qr.id}` }, (e: any) => appliquer(e.new))
      .subscribe();
    const t = setInterval(lire, 3000);
    return () => { clearInterval(t); sb.removeChannel(canal); };
  }, [qr]); // eslint-disable-line react-hooks/exhaustive-deps

  async function lire(e: React.ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (f) await traiter(f); }
  async function traiter(f: File) {
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

  const accepte = grand ? 'image/*,application/pdf' : 'image/*';
  if (!grand) return (
    <div className="pleine scanner">
      <button ref={bouton} type="button" className="bouton" onClick={() => champ.current?.click()}>📷 {libelle}</button>
      {etat && <span className={etat.startsWith('Échec') ? 'erreur' : 'gris'}>{etat}</span>}
      <input ref={champ} type="file" accept={accepte} capture="environment" hidden onChange={lire} />
    </div>
  );

  // Grande zone : déposer le fichier, l'importer, ou le photographier avec le téléphone
  return (
    <div className={`pleine zone-scan ${survol ? 'survol' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setSurvol(true); }} onDragLeave={() => setSurvol(false)}
      onDrop={(e) => { e.preventDefault(); setSurvol(false); const f = e.dataTransfer.files?.[0]; if (f) traiter(f); }}>
      <div className="zone-scan-titre">
        <b>{libelle}</b>
        <span>Déposez {NOMS[genre]} ici (photo ou PDF), ou prenez-le en photo avec votre téléphone : tout se remplit seul.</span>
      </div>
      <div className="zone-scan-actions">
        <button ref={bouton} type="button" className="zone-scan-btn" onClick={() => champ.current?.click()}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
          <span><b>Importer un fichier</b><small>Photo ou PDF reçu par e-mail</small></span>
        </button>
        <button type="button" className="zone-scan-btn" onClick={qr ? () => setQr(null) : ouvrirTelephone}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></svg>
          <span><b>{qr ? 'Fermer le QR code' : 'Prendre en photo avec le téléphone'}</b><small>{genre === 'permis' ? 'Le chauffeur est à côté de vous' : 'Pour un avis reçu par courrier'}</small></span>
        </button>
      </div>
      {qr && (
        <div className="zone-scan-qr">
          <img src={qr.image} alt="QR code à viser avec le téléphone" />
          <div><b>{qrEtat}</b><span className="gris">Le téléphone ouvre l’appareil photo, vous prenez {NOMS[genre]}, et les champs se remplissent ici tout seuls. Le QR code est valable 30 minutes.</span></div>
        </div>
      )}
      {!qr && qrEtat && !qrEtat.startsWith('Visez') && <span className="erreur">{qrEtat}</span>}
      {etat && <span className={`zone-scan-etat ${etat.startsWith('Échec') ? 'erreur' : ''}`}>{etat}</span>}
      <input ref={champ} type="file" accept={accepte} hidden onChange={lire} />
    </div>
  );
}
