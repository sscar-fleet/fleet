'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { supabaseNavigateur } from '@/lib/supabase-navigateur';

// Photo prise avec le téléphone, reçue en direct sur l'ordinateur : un QR code ouvre l'appareil photo du téléphone,
// chaque photo validée arrive ici (onPhoto). Plusieurs photos à la suite possibles avec le même QR code.
export default function QrTelephone({ genre, onPhoto, onFermer, texte }: {
  genre: 'photo' | 'document' | 'permis'; onPhoto: (chemin: string) => void | Promise<void>; onFermer: () => void; texte?: string;
}) {
  const [qr, setQr] = useState<{ id: string; image: string; lien: string } | null>(null);
  const [etat, setEtat] = useState('Préparation du QR code…');
  const [recues, setRecues] = useState(0);

  useEffect(() => {
    let fini = false;
    (async () => {
      const r = await fetch('/api/scans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ genre }) });
      const res = await r.json().catch(() => ({}));
      if (fini) return;
      if (!r.ok) { setEtat(res.erreur ?? 'QR code impossible pour le moment.'); return; }
      setQr({ id: res.id, lien: res.lien, image: await QRCode.toDataURL(res.lien, { margin: 1, width: 360 }) });
      setEtat('Visez le QR code avec l’appareil photo du téléphone');
    })();
    return () => { fini = true; };
  }, [genre]);

  useEffect(() => {
    if (!qr) return;
    const sb = supabaseNavigateur();
    let dernier = '';
    const appliquer = async (ligne: any) => {
      const c = ligne?.pieces?.document_path;
      if (!c || c === dernier) return;
      dernier = c;
      setEtat('Photo reçue, enregistrement…');
      await onPhoto(c);
      setRecues((n) => n + 1);
      setEtat('Photo enregistrée ✓ Vous pouvez en prendre une autre avec le téléphone.');
    };
    sb.from('scans').select('pieces').eq('id', qr.id).maybeSingle().then(({ data }) => { dernier = data?.pieces?.document_path ?? ''; });
    const canal = sb.channel('qr-photo-' + qr.id)
      .on('postgres_changes' as any, { event: 'UPDATE', schema: 'public', table: 'scans', filter: `id=eq.${qr.id}` }, (e: any) => appliquer(e.new))
      .subscribe();
    const t = setInterval(() => sb.from('scans').select('pieces').eq('id', qr.id).maybeSingle().then(({ data }) => appliquer(data)), 3000);
    return () => { clearInterval(t); sb.removeChannel(canal); };
  }, [qr]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="qr-tel">
      {qr ? <img src={qr.image} alt="QR code à viser avec le téléphone" data-lien={qr.lien} /> : null}
      <div>
        <b>{etat}</b>
        <span className="gris">{texte ?? 'Le téléphone ouvre l’appareil photo ; chaque photo validée arrive ici toute seule. Valable 30 minutes.'}{recues ? ` · ${recues} reçue${recues > 1 ? 's' : ''}` : ''}</span>
        <button type="button" className="bouton petit" onClick={onFermer}>Fermer</button>
      </div>
    </div>
  );
}
