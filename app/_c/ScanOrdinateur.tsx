'use client';
// « Scanner avec le téléphone » : un QR code à viser avec l'iPhone, les papiers arrivent ici en direct.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { supabaseNavigateur } from '@/lib/supabase-navigateur';

const PIECES = [
  ['permis_path', 'Permis recto'], ['permis_verso_path', 'Permis verso'], ['piece_identite_path', 'Identité recto'],
  ['piece_identite_verso_path', 'Identité verso'], ['justificatif_domicile_path', 'Justificatif de domicile'],
] as const;
const CHAMPS_LUS = ['nom', 'prenom', 'date_naissance', 'numero_permis', 'date_permis', 'adresse'];

export default function ScanOrdinateur({ clientId, compact = false }: { clientId?: string; compact?: boolean }) {
  const router = useRouter();
  const ancre = useRef<HTMLDivElement>(null);
  const [seance, setSeance] = useState<{ id: string; jeton: string; lien: string; expire_le: string } | null>(null);
  const [qr, setQr] = useState('');
  const [pieces, setPieces] = useState<Record<string, string>>({});
  const [vignettes, setVignettes] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const [rempli, setRempli] = useState(0);

  async function demarrer() {
    setErreur(''); setOuvert(true);
    const r = await fetch('/api/scans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: clientId ?? null }) });
    const res = await r.json();
    if (!r.ok) { setErreur(res.erreur ?? 'Impossible de créer le QR code.'); return; }
    setSeance(res); setPieces({}); setVignettes({}); setRempli(0);
    setQr(await QRCode.toDataURL(res.lien, { margin: 1, width: 440, color: { dark: '#0b0f12', light: '#ffffff' } }));
  }

  // Suivi en direct de la séance (et relecture toutes les 3 s au cas où le direct coupe)
  useEffect(() => {
    if (!seance) return;
    const sb = supabaseNavigateur();
    let vu = '';
    const appliquer = async (ligne: any) => {
      if (!ligne) return;
      const cle = JSON.stringify([ligne.pieces, ligne.champs]);
      if (cle === vu) return; vu = cle;
      const p = (ligne.pieces ?? {}) as Record<string, string>;
      setPieces(p);
      const formulaire = ancre.current?.closest('form');
      // Nouveau client : les chemins vont dans les champs cachés du formulaire
      Object.entries(p).forEach(([champ, chemin]) => {
        const cache = formulaire?.querySelector<HTMLInputElement>(`input[type="hidden"][name="${champ}"]`);
        if (cache) cache.value = chemin;
      });
      // Champs lus sur le permis : on remplit seulement les cases vides
      let n = 0;
      Object.entries(ligne.champs ?? {}).forEach(([cle, valeur]) => {
        if (!CHAMPS_LUS.includes(cle) || valeur == null || valeur === '') return;
        const el = formulaire?.querySelector<HTMLInputElement>(`[name="${cle}"]`);
        if (el && !el.value) { el.value = String(valeur); n++; }
      });
      if (n) setRempli((x) => x + n);
      const chemins = Object.values(p).filter(Boolean);
      if (chemins.length) {
        const { data } = await sb.storage.from('documents').createSignedUrls(chemins, 3600);
        const v: Record<string, string> = {};
        Object.entries(p).forEach(([champ, chemin]) => { const u = data?.find((d) => d.path === chemin)?.signedUrl; if (u) v[champ] = u; });
        setVignettes(v);
      }
      if (clientId) router.refresh();
    };
    const lire = () => sb.from('scans').select('pieces, champs').eq('id', seance.id).maybeSingle().then(({ data }) => appliquer(data));
    const canal = sb.channel('scan-' + seance.id)
      .on('postgres_changes' as any, { event: 'UPDATE', schema: 'public', table: 'scans', filter: `id=eq.${seance.id}` }, (e: any) => appliquer(e.new))
      .subscribe();
    const t = setInterval(lire, 3000);
    return () => { clearInterval(t); sb.removeChannel(canal); };
  }, [seance, clientId, router]);

  const nb = Object.keys(pieces).length;
  const expire = seance ? Math.max(0, Math.round((new Date(seance.expire_le).getTime() - Date.now()) / 60000)) : 0;

  return (
    <div ref={ancre} className={`pleine scan-ordi ${compact ? 'compact' : ''}`}>
      {!ouvert ? (
        <button type="button" className="bouton principal" onClick={demarrer}>📱 Scanner les papiers avec le téléphone</button>
      ) : (
        <div className="scan-ordi-panneau">
          <div className="scan-ordi-qr">
            {qr ? <img src={qr} alt="QR code à scanner avec le téléphone" /> : <div className="scan-ordi-attente">{erreur || 'Préparation…'}</div>}
          </div>
          <div className="scan-ordi-infos">
            <b>Visez ce QR code avec l’appareil photo du téléphone</b>
            <span className="gris">Permis, pièce d’identité, justificatif : prenez ce que vous voulez, rien n’est obligatoire. Les papiers arrivent ici tout seuls.</span>
            <div className="scan-ordi-pieces">
              {PIECES.map(([champ, lib]) => (
                <div key={champ} className={pieces[champ] ? 'ok' : ''}>
                  {vignettes[champ] ? <img src={vignettes[champ]} alt="" /> : <span className="vide">{pieces[champ] ? '✓' : '…'}</span>}
                  <small>{lib}</small>
                </div>
              ))}
            </div>
            <span className="gris">{nb ? `${nb} papier${nb > 1 ? 's' : ''} reçu${nb > 1 ? 's' : ''}` : 'En attente du téléphone'}{rempli ? ` · ${rempli} champ${rempli > 1 ? 's' : ''} rempli${rempli > 1 ? 's' : ''} depuis le permis` : ''}{seance ? ` · QR valable ${expire} min` : ''}</span>
            <div className="ligne">
              <button type="button" className="bouton petit" onClick={demarrer}>Nouveau QR code</button>
              <button type="button" className="bouton petit" onClick={() => setOuvert(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
