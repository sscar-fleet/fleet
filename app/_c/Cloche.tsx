'use client';
// Cloche des notifications : seulement ce qui coûte de l'argent ou crée un risque, avec le bouton pour le régler.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { lienWhatsApp } from '@/lib/whatsapp';
import type { Notif, ActionNotif } from '@/lib/notifications';

const GROUPES = [
  { niveau: 'rouge', titre: 'Urgent' },
  { niveau: 'orange', titre: 'Cette semaine' },
  { niveau: 'gris', titre: 'À savoir' },
] as const;

export default function Cloche() {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [liste, setListe] = useState<Notif[] | null>(null);
  const [urgentes, setUrgentes] = useState(0);
  const [resume, setResume] = useState<string | null>(null);
  const [tout, setTout] = useState(false);
  const [etat, setEtat] = useState<Record<string, string>>({});
  const panneau = useRef<HTMLDivElement>(null);

  const charger = useCallback(async (avecResume = false) => {
    try {
      const r = await fetch(`/api/notifications${avecResume ? '?resume=1' : ''}`, { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      setListe(j.notifications ?? []); setUrgentes(j.urgentes ?? 0);
      if (avecResume && j.resume) setResume(j.resume);
    } catch { /* réseau */ }
  }, []);
  useEffect(() => { charger(); const t = setInterval(() => charger(), 5 * 60e3); return () => clearInterval(t); }, [charger]);
  useEffect(() => { if (ouvert) charger(true); }, [ouvert, charger]);
  useEffect(() => {
    if (!ouvert) return;
    const clic = (e: MouseEvent) => { if (panneau.current && !panneau.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('.cloche-bouton')) setOuvert(false); };
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('mousedown', clic); window.addEventListener('keydown', echap);
    return () => { document.removeEventListener('mousedown', clic); window.removeEventListener('keydown', echap); };
  }, [ouvert]);

  async function masquer(cle: string, mode: 'demain' | 'ignorer') {
    setListe((l) => (l ?? []).filter((n) => n.cle !== cle));
    await fetch('/api/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cle, mode }) }).catch(() => {});
    charger();
  }
  async function faire(n: Notif, a: Extract<ActionNotif, { type: 'faire' }>) {
    const k = n.cle + a.libelle;
    setEtat((e) => ({ ...e, [k]: '…' }));
    const r = await fetch('/api/notifications/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: a.action, id: a.id, jours: a.jours }) });
    const j = await r.json().catch(() => ({}));
    setEtat((e) => ({ ...e, [n.cle]: r.ok ? '✓ ' + (j.message ?? 'Fait') : '✗ ' + (j.erreur ?? 'Impossible') }));
    if (r.ok) { router.refresh(); setTimeout(() => charger(), 1200); }
  }

  const nb = (liste ?? []).length;
  const importantes = (liste ?? []).filter((n) => n.niveau !== 'gris');
  const montrees = new Set((tout ? liste ?? [] : [...importantes.slice(0, 5), ...(liste ?? []).filter((n) => n.niveau === 'gris').slice(0, 2)]).map((n) => n.cle));
  const cachees = (liste ?? []).length - montrees.size;

  const Bouton = ({ n, a }: { n: Notif; a: ActionNotif }) => {
    if (a.type === 'lien') return <a className="bouton petit" href={a.href} target={a.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" onClick={() => !a.href.startsWith('http') && setOuvert(false)}>{a.libelle}</a>;
    if (a.type === 'tel') return <a className="bouton petit" href={`tel:${a.numero.replace(/\s/g, '')}`}>{a.libelle}</a>;
    if (a.type === 'whatsapp') return <a className="bouton petit" href={lienWhatsApp(a.numero, a.texte)} target="_blank" rel="noreferrer">{a.libelle}</a>;
    return <button type="button" className="bouton petit principal" disabled={etat[n.cle + a.libelle] === '…'} onClick={() => faire(n, a)}>{etat[n.cle + a.libelle] === '…' ? '…' : a.libelle}</button>;
  };

  return (
    <span className="cloche">
      <button type="button" className={`cloche-bouton ${urgentes ? 'urgent' : ''}`} aria-label={`Notifications${urgentes ? ` : ${urgentes} urgente${urgentes > 1 ? 's' : ''}` : ''}`} onClick={() => setOuvert((o) => !o)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {urgentes > 0 ? <b>{urgentes}</b> : nb > 0 ? <i /> : null}
      </button>
      {ouvert && (
        <div ref={panneau} className="cloche-panneau" role="dialog" aria-label="Notifications">
          <div className="cloche-haut">
            <span className="ia-orbe petit" aria-hidden="true">✦</span>
            <span><b>À faire</b><small>Seulement ce qui compte, trié par l’IA</small></span>
          </div>
          <div className="cloche-resume">{resume ?? (liste ? '…' : 'Chargement…')}</div>
          <div className="cloche-liste">
            {liste && !nb && <div className="cloche-vide"><span>✓</span>Rien à faire pour le moment.</div>}
            {GROUPES.map((g) => {
              const items = (liste ?? []).filter((n) => n.niveau === g.niveau && montrees.has(n.cle));
              if (!items.length) return null;
              return (
                <div key={g.niveau} className="cloche-groupe">
                  <div className={`cloche-groupe-titre ${g.niveau}`}>{g.titre}</div>
                  {items.map((n) => (
                    <div key={n.cle} className={`cloche-item ${n.niveau}`}>
                      <div className="cloche-texte">
                        <b>{n.titre}</b>
                        <span>{n.detail}</span>
                        {etat[n.cle] && etat[n.cle] !== '…' && <span className={etat[n.cle].startsWith('✓') ? 'ok' : 'ko'}>{etat[n.cle]}</span>}
                      </div>
                      <div className="cloche-actions">
                        {n.actions.map((a, i) => <Bouton key={i} n={n} a={a} />)}
                        <span className="cloche-plus">
                          <button type="button" onClick={() => masquer(n.cle, 'demain')} title="Me le rappeler demain">Demain</button>
                          <button type="button" onClick={() => masquer(n.cle, 'ignorer')} title="Ne plus afficher">Ignorer</button>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
            {cachees > 0 && <button type="button" className="cloche-tout" onClick={() => setTout(true)}>Voir {cachees} autre{cachees > 1 ? 's' : ''}</button>}
          </div>
        </div>
      )}
    </span>
  );
}
