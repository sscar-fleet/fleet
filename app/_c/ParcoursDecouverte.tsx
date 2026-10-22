'use client';
// Parcours découverte : 5 jours, 12 missions courtes. Ludique (badges, progression, temps gagné), jamais bloquant.
import { useState } from 'react';
import { JOURS } from '@/lib/decouverte';

export default function ParcoursDecouverte({ fait, jourActuel, minutes, faites, total }: { fait: Record<string, boolean>; jourActuel: number; minutes: number; faites: number; total: number }) {
  const premierOuvert = JOURS.find((j) => j.missions.some((m) => !fait[m.cle]))?.n ?? jourActuel;
  const [jour, setJour] = useState(Math.min(premierOuvert, jourActuel) || premierOuvert);
  const j = JOURS.find((x) => x.n === jour)!;
  const pct = Math.round((faites / total) * 100);
  const temps = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`;
  const prochaine = j.missions.find((m) => !fait[m.cle]);
  return (
    <section className="carte decouverte">
      <div className="dec-tete">
        <div>
          <span className="dec-sur">Découverte · jour {jourActuel} sur 5</span>
          <h2 style={{ margin: '2px 0 0' }}>{faites === 0 ? 'Bienvenue sur Fleet : 12 missions pour en tirer le maximum' : faites === total ? 'Parcours terminé, bravo !' : `${faites} mission${faites > 1 ? 's' : ''} sur ${total}`}</h2>
        </div>
        {minutes > 0 && <span className="dec-temps" title="Estimation du temps de saisie et de papiers évité depuis vos débuts sur Fleet">≈ {temps} gagnées</span>}
      </div>
      <div className="dec-barre" aria-label={`${pct} % du parcours`}><span style={{ width: `${pct}%` }} /></div>
      <div className="dec-jours" role="tablist">
        {JOURS.map((x) => {
          const ok = x.missions.every((m) => fait[m.cle]);
          return (
            <button key={x.n} type="button" role="tab" aria-selected={x.n === jour} className={`dec-jour ${x.n === jour ? 'actif' : ''} ${ok ? 'ok' : ''}`} onClick={() => setJour(x.n)}>
              <span className="dec-pastille">{ok ? '✓' : x.n}</span>
              <span className="dec-lib">{ok ? x.badge : `Jour ${x.n}`}</span>
            </button>
          );
        })}
      </div>
      <h3 className="dec-titre">{j.titre}</h3>
      <ol className="dec-missions">
        {j.missions.map((m) => {
          const ok = fait[m.cle];
          return (
            <li key={m.cle} className={`${ok ? 'fait' : ''} ${prochaine?.cle === m.cle ? 'prochaine' : ''}`}>
              <span className="coche">{ok ? '✓' : ''}</span>
              <span className="dec-texte"><b>{m.titre}</b><span className="gris">{m.pourquoi}</span></span>
              {!ok && (m.cle === 'ia'
                ? <button type="button" className={`bouton petit ${prochaine?.cle === m.cle ? 'principal' : ''}`} onClick={() => window.dispatchEvent(new CustomEvent('fleet-ai', { detail: '' }))}>{m.bouton}</button>
                : <a className={`bouton petit ${prochaine?.cle === m.cle ? 'principal' : ''}`} href={m.lien}>{m.bouton}</a>)}
            </li>
          );
        })}
      </ol>
      {j.missions.every((m) => fait[m.cle]) && <p className="dec-bravo">Badge « {j.badge} » obtenu{jour < 5 ? ' : passez au jour suivant quand vous voulez.' : ' !'}</p>}
    </section>
  );
}
