'use client';
// Import de la flotte depuis un fichier Excel ou CSV, ou des lignes collées depuis Excel.
// Les colonnes sont reconnues toutes seules ; on vérifie l'aperçu, on corrige une colonne si besoin, on importe.
import { useMemo, useState, useTransition } from 'react';
import { lireTableur, devinerChamp, ressemblePlaque, CHAMPS, type Champ } from '@/lib/tableur';
import { importerTableur } from '../actions';
import { plaque } from '@/lib/format';

const normal = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');

export default function ImportTableur({ existantes, ouvert }: { existantes: string[]; ouvert: boolean }) {
  const [lignes, setLignes] = useState<string[][]>([]);
  const [champs, setChamps] = useState<Champ[]>([]);
  const [entete, setEntete] = useState(true);
  const [colle, setColle] = useState('');
  const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null);
  const [enCours, demarrer] = useTransition();
  const deja = useMemo(() => new Set(existantes.map(normal)), [existantes]);

  function charger(t: string[][]) {
    setMessage(null);
    const propres = t.filter((l) => l.some((c) => c.trim()));
    if (!propres.length) { setMessage({ texte: 'Le fichier est vide.', ok: false }); return; }
    // En-tête : la première ligne ne contient pas de plaque
    const aEntete = !propres[0].some(ressemblePlaque);
    let devines: Champ[] = aEntete ? propres[0].map(devinerChamp) : propres[0].map(() => 'ignorer');
    // Pas d'en-tête reconnu : on cherche la colonne des plaques dans les données
    if (!devines.includes('immatriculation')) {
      const donnees = propres.slice(aEntete ? 1 : 0, 30);
      const largeur = Math.max(...propres.map((l) => l.length));
      for (let i = 0; i < largeur; i++) {
        if (donnees.filter((l) => ressemblePlaque(l[i] ?? '')).length >= Math.max(1, donnees.length / 2)) { devines[i] = 'immatriculation'; break; }
      }
    }
    devines = Array.from({ length: Math.max(...propres.map((l) => l.length)) }, (_, i) => devines[i] ?? 'ignorer');
    setEntete(aEntete); setChamps(devines); setLignes(propres);
  }

  async function fichier(f?: File | null) {
    if (!f) return;
    try { charger(await lireTableur(f)); } catch (e: any) { setMessage({ texte: e?.message ?? 'Fichier illisible.', ok: false }); }
  }

  const donnees = entete ? lignes.slice(1) : lignes;
  const iPlaque = champs.indexOf('immatriculation');
  const valeur = (l: string[], c: Champ) => { const i = champs.indexOf(c); return i < 0 ? '' : (l[i] ?? '').trim(); };
  const valides = iPlaque < 0 ? [] : donnees.filter((l) => normal(l[iPlaque] ?? '').length >= 4);
  const nouvelles = valides.filter((l) => !deja.has(normal(l[iPlaque])));

  function importer() {
    const objets = nouvelles.slice(0, 500).map((l) => Object.fromEntries((Object.keys(CHAMPS) as Champ[]).map((c) => [c, valeur(l, c)])));
    demarrer(async () => {
      const r = await importerTableur(JSON.stringify(objets));
      if (r && 'erreur' in r && r.erreur) setMessage({ texte: r.erreur, ok: false });
      else { setMessage({ texte: `${(r as any)?.crees ?? objets.length} véhicule${objets.length > 1 ? 's' : ''} ajouté${objets.length > 1 ? 's' : ''} à votre flotte.`, ok: true }); setLignes([]); setColle(''); }
    });
  }

  return (
    <details className="formulaire carte formulaire-haut" open={ouvert}>
      <summary>Importer depuis Excel</summary>
      {!lignes.length && (
        <div style={{ display: 'grid', gap: 12 }}>
          <p className="gris" style={{ margin: 0 }}>Votre liste de véhicules dans Excel ou Google Sheets : choisissez le fichier, ou copiez les lignes et collez-les ici. Il faut au moins une colonne avec l’immatriculation ; marque, modèle, kilométrage et prix sont repris s’ils y sont.</p>
          <label className="bouton" style={{ justifySelf: 'start', cursor: 'pointer' }}>
            Choisir un fichier (.xlsx ou .csv)
            <input type="file" accept=".xlsx,.csv,.txt,text/csv" style={{ display: 'none' }} onChange={(e) => fichier(e.target.files?.[0])} />
          </label>
          <textarea rows={4} value={colle} onChange={(e) => setColle(e.target.value)} placeholder={'Ou collez ici, par exemple :\nAB123CD\tPeugeot\t208\t42000\t45'} />
          {colle.trim() && <button type="button" className="bouton principal" style={{ justifySelf: 'start' }} onClick={async () => charger(await lireTableur(colle))}>Lire les lignes collées</button>}
        </div>
      )}
      {lignes.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0 }}>
            {iPlaque < 0
              ? <b>Indiquez quelle colonne contient l’immatriculation.</b>
              : <><b>{nouvelles.length} véhicule{nouvelles.length > 1 ? 's' : ''} à ajouter</b>{valides.length - nouvelles.length > 0 ? <span className="gris"> · {valides.length - nouvelles.length} déjà dans votre flotte, ignoré{valides.length - nouvelles.length > 1 ? 's' : ''}</span> : null}</>}
          </p>
          <label className="ligne" style={{ gap: 8, fontSize: 14 }}><input type="checkbox" checked={entete} onChange={(e) => setEntete(e.target.checked)} style={{ width: 18, height: 18 }} /> La première ligne contient les titres des colonnes</label>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>{champs.map((c, i) => (
                  <th key={i}>
                    <select value={c} onChange={(e) => setChamps(champs.map((x, j) => (j === i ? (e.target.value as Champ) : x === e.target.value && e.target.value !== 'ignorer' ? 'ignorer' : x)))}>
                      <option value="ignorer">Ne pas importer</option>
                      {Object.entries(CHAMPS).map(([k, lib]) => <option key={k} value={k}>{lib}</option>)}
                    </select>
                    {entete && <div className="gris" style={{ fontSize: 12, fontWeight: 400, marginTop: 4 }}>{lignes[0][i]}</div>}
                  </th>
                ))}</tr>
              </thead>
              <tbody>
                {donnees.slice(0, 8).map((l, k) => (
                  <tr key={k} style={{ opacity: iPlaque >= 0 && deja.has(normal(l[iPlaque] ?? '')) ? 0.45 : 1 }}>
                    {champs.map((c, i) => <td key={i}>{c === 'immatriculation' ? plaque(normal(l[i] ?? '')) : l[i]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {donnees.length > 8 && <p className="gris" style={{ margin: 0, fontSize: 13 }}>+ {donnees.length - 8} autres lignes</p>}
          {nouvelles.length > 500 && <p className="gris" style={{ margin: 0 }}>Les 500 premiers seront importés ; relancez ensuite pour la suite.</p>}
          <div className="ligne" style={{ gap: 8 }}>
            <button type="button" className="bouton principal" disabled={!nouvelles.length || enCours} onClick={importer}>{enCours ? 'Import en cours…' : `Importer ${Math.min(nouvelles.length, 500)} véhicule${nouvelles.length > 1 ? 's' : ''}`}</button>
            <button type="button" className="bouton" onClick={() => { setLignes([]); setMessage(null); }}>Recommencer</button>
          </div>
        </div>
      )}
      {message && <p className={message.ok ? '' : 'pastille retard'} style={{ marginBottom: 0 }}>{message.texte}</p>}
    </details>
  );
}
