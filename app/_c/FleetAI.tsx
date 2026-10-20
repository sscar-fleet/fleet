'use client';
// Fleet AI : on lui parle comme à un collègue. Il répond avec les vraies données et prépare les actions ;
// rien n'est modifié sans un toucher sur le bouton de confirmation.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDictee } from '@/lib/dictee';

type Proposition = { type: string; libelle: string; lien?: string; telephone?: string; [k: string]: any };
type Bulle = { role: 'user' | 'assistant'; content: string; propositions?: Proposition[]; erreur?: boolean };

const IDEES = ['Qui rend une voiture aujourd’hui ?', 'Quelles locations sont en retard ?', 'Combien j’ai encaissé ce mois ?', 'Quelles voitures sont libres ce week-end ?', 'Qu’est-ce que j’ai à traiter en amendes et FPS ?'];

// Liens [texte](/chemin), gras **texte** et retours à la ligne
function Texte({ t }: { t: string }) {
  const morceaux = t.split(/(\[[^\]]+\]\(\/[^)\s]*\)|\*\*[^*]+\*\*)/g);
  return <>{morceaux.map((m, i) => {
    const l = m.match(/^\[([^\]]+)\]\((\/[^)\s]*)\)$/);
    if (l) return <a key={i} className="lien" href={l[2]}>{l[1]}</a>;
    const g = m.match(/^\*\*([^*]+)\*\*$/);
    if (g) return <b key={i}>{g[1]}</b>;
    return <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{m}</span>;
  })}</>;
}

export function Micro() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
}

function BoutonAction({ p }: { p: Proposition }) {
  const router = useRouter();
  const [etat, setEtat] = useState<'' | 'envoi' | 'ok' | 'erreur'>('');
  const [msg, setMsg] = useState('');
  if (p.type === 'whatsapp') return <a className="bouton petit principal" href={p.lien} target="_blank" rel="noreferrer">{p.libelle}</a>;
  if (p.type === 'appeler') return <a className="bouton petit" href={`tel:${p.telephone}`}>{p.libelle}</a>;
  if (p.type === 'ouvrir') return <a className="bouton petit" href={p.lien}>{p.libelle}</a>;
  return (
    <span className="ia-action">
      <button type="button" className="bouton petit principal" disabled={etat === 'envoi' || etat === 'ok'} onClick={async () => {
        setEtat('envoi');
        const r = await fetch('/api/ia/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proposition: p }) });
        const res = await r.json().catch(() => ({}));
        if (r.ok) { setEtat('ok'); setMsg(res.message ?? 'Fait'); router.refresh(); } else { setEtat('erreur'); setMsg(res.erreur ?? 'Action impossible'); }
      }}>{etat === 'envoi' ? 'En cours…' : etat === 'ok' ? '✓ ' + p.libelle : p.libelle}</button>
      {msg && <small className={etat === 'erreur' ? 'erreur' : 'gris'}>{msg}</small>}
    </span>
  );
}

export default function FleetAI({ initiale, page = false }: { initiale?: string; page?: boolean }) {
  const [ouvert, setOuvert] = useState(page);
  const [bulles, setBulles] = useState<Bulle[]>([]);
  const [saisie, setSaisie] = useState('');
  const [attente, setAttente] = useState(false);
  const fil = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLTextAreaElement>(null);
  const lance = useRef(false);
  const dictee = useDictee((t) => setSaisie(t), (t) => envoyer(t));

  useEffect(() => {
    const ouvrir = (e: Event) => { setOuvert(true); const q = (e as CustomEvent).detail; if (q === '__dictee__') dictee.demarrer(); else if (typeof q === 'string' && q) envoyer(q); setTimeout(() => champ.current?.focus(), 50); };
    window.addEventListener('fleet-ai', ouvrir);
    return () => window.removeEventListener('fleet-ai', ouvrir);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (initiale && !lance.current) { lance.current = true; envoyer(initiale); } }, [initiale]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fil.current?.scrollTo({ top: fil.current.scrollHeight, behavior: 'smooth' }); }, [bulles, attente]);
  useEffect(() => {
    if (page || !ouvert) return;
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [ouvert, page]);

  async function envoyer(question: string) {
    const q = question.trim();
    if (!q || attente) return;
    const suite: Bulle[] = [...bulles, { role: 'user', content: q }];
    setBulles(suite); setSaisie(''); setAttente(true);
    try {
      const r = await fetch('/api/ia', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: suite.filter((b) => !b.erreur).map(({ role, content }) => ({ role, content })) }) });
      const res = await r.json().catch(() => ({}));
      setBulles([...suite, r.ok ? { role: 'assistant', content: res.reponse || '…', propositions: res.propositions } : { role: 'assistant', content: res.erreur ?? 'Fleet AI ne répond pas pour le moment.', erreur: true }]);
    } catch {
      setBulles([...suite, { role: 'assistant', content: 'Pas de réseau. Réessayez.', erreur: true }]);
    }
    setAttente(false);
  }

  const contenu = (
    <div className={`ia ${page ? 'ia-page' : 'ia-tiroir'}`}>
      <div className="ia-haut">
        <span className="ia-logo">✦</span><b>Fleet AI</b><span className="gris">répond et prépare les actions, vous confirmez</span>
        {!page && <button type="button" className="ia-fermer" aria-label="Fermer" onClick={() => setOuvert(false)}>×</button>}
      </div>
      <div ref={fil} className="ia-fil">
        {!bulles.length && (
          <div className="ia-accueil">
            <p>Posez une question sur votre flotte, ou demandez une action : « prolonge Karim de 2 jours », « préviens le client de la Clio que son retour est demain 9 h ».</p>
            <div className="ia-idees">{IDEES.map((i) => <button key={i} type="button" onClick={() => envoyer(i)}>{i}</button>)}</div>
          </div>
        )}
        {bulles.map((b, i) => (
          <div key={i} className={`ia-bulle ${b.role} ${b.erreur ? 'erreur' : ''}`}>
            <Texte t={b.content} />
            {!!b.propositions?.length && <div className="ia-actions">{b.propositions.map((p, j) => <BoutonAction key={j} p={p} />)}</div>}
          </div>
        ))}
        {attente && <div className="ia-bulle assistant ia-attente"><i /><i /><i /></div>}
      </div>
      <form className="ia-saisie" onSubmit={(e) => { e.preventDefault(); envoyer(saisie); }}>
        {dictee.dispo && <button type="button" className={`ia-micro ${dictee.ecoute ? 'actif' : ''}`} aria-label={dictee.ecoute ? 'Arrêter la dictée' : 'Dicter'} title={dictee.ecoute ? 'Arrêter' : 'Dicter (parlez, ça s’envoie quand vous vous arrêtez)'}
          onClick={() => dictee.basculer(saisie)}><Micro /></button>}
        <textarea ref={champ} rows={1} value={saisie} placeholder={dictee.ecoute ? 'Je vous écoute…' : 'Demandez à Fleet AI…'} onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(saisie); } }} />
        <button type="submit" className="bouton principal" disabled={attente || !saisie.trim()}>Envoyer</button>
      </form>
    </div>
  );

  if (page) return contenu;
  return (
    <>
      {!ouvert && <button type="button" className="ia-bulle-flottante" onClick={() => { setOuvert(true); setTimeout(() => champ.current?.focus(), 50); }} aria-label="Ouvrir Fleet AI"><span>✦</span> Fleet AI</button>}
      {ouvert && <div className="ia-voile" onClick={() => setOuvert(false)} />}
      {ouvert && contenu}
    </>
  );
}
