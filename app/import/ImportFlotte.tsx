'use client';
// Importer ma flotte : une seule zone où l'on dépose tout ce qu'on a (Excel, photos de cartes grises ou de contrats, PDF,
// texte écrit ou dicté). Fleet AI lit chaque source, tout est regroupé dans un aperçu modifiable, puis un seul bouton importe.
// Rien n'est bloquant : une ligne incomplète est signalée « à compléter », et seules les lignes sans immatriculation restent dehors.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { lireClasseur } from '@/lib/tableur';
import { compresser } from '@/lib/image';
import { supabaseNavigateur } from '@/lib/supabase-navigateur';
import { useDictee } from '@/lib/dictee';
import { plaque } from '@/lib/format';
import { visuelRetenu, type ReglagesCatalogue } from '@/lib/visuel';
import {
  lotVide, fusionner, nettoyerLot, appliquerColonnes, echantillon, tableEnTexte, etatLocation, manquesVehicule, manquesLocation,
  statutAffiche, maintenantParis, plaqueNette, type Lot, type VehiculeImport, type LocationImport, type ClientImport, type ChauffeurImport, type Colonnes,
} from '@/lib/importCommun';
import { importerFlotte, ajouterEquipementsSscs, type Bilan } from './actions';
import LogoMarque from '../_c/LogoMarque';

type Genre = 'tableur' | 'image' | 'pdf' | 'texte';
type Source = { id: string; nom: string; genre: Genre; etat: 'attente' | 'lecture' | 'ok' | 'echec'; detail?: string; fichier?: File; texte?: string; vue?: string };
type Sscs = { nom: string; vehicules: { immatriculation: string; marque: string; modele: string }[]; dejaRelies: number } | null;

const ICONES: Record<Genre, string> = { tableur: '📊', image: '📷', pdf: '📄', texte: '✍️' };
const pluriel = (n: number, mot: string, pl = mot + 's') => `${n} ${n > 1 ? pl : mot}`;
let numero = 0;
const nouvelId = () => `s${Date.now().toString(36)}${numero++}`;

function genreDe(f: File): Genre | null {
  const n = f.name.toLowerCase();
  if (/\.(xlsx|xlsm|xls|csv|tsv)$/.test(n)) return 'tableur';
  if (f.type === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/.test(n)) return 'image';
  if (f.type.startsWith('text/') || n.endsWith('.txt')) return 'texte';
  return null;
}

async function demander(corps: Record<string, unknown>): Promise<any> {
  const r = await fetch('/api/import-flotte', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.erreur || 'Lecture impossible.');
  return j;
}

// Modèle Excel (CSV lisible par Excel, accents compris) pour ceux qui partent de zéro
function telechargerModele(transport: boolean) {
  const lignes = transport
    ? [['Immatriculation', 'Marque', 'Modèle', 'Kilométrage', 'Situation (disponible / garage)', 'Garage', 'Retour du garage (JJ/MM/AAAA)', 'Chauffeur', 'Téléphone chauffeur'],
       ['AB-123-CD', 'Renault', 'Master', '125000', 'disponible', '', '', 'Karim Martin', '06 12 34 56 78']]
    : [['Immatriculation', 'Marque', 'Modèle', 'Année', 'Kilométrage', 'Prix par jour', 'Situation (disponible / loué / garage)', 'Client actuel', 'Téléphone client', 'Départ (JJ/MM/AAAA)', 'Retour prévu (JJ/MM/AAAA)', 'Garage', 'Retour du garage (JJ/MM/AAAA)'],
       ['AB-123-CD', 'Peugeot', '208', '2021', '42000', '45', 'loué', 'Jean Dupont', '06 12 34 56 78', '', '30/10/2026', '', ''],
       ['EF-456-GH', 'Renault', 'Clio 5', '2022', '18000', '40', 'disponible', '', '', '', '', '', '']];
  const csv = '﻿' + lignes.map((l) => l.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = transport ? 'modele-flotte-transport.csv' : 'modele-flotte-location.csv';
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export default function ImportFlotte({ agenceId, transport, existantes, catalogue, sscs }: {
  agenceId: string; transport: boolean; existantes: string[]; catalogue: ReglagesCatalogue; sscs: Sscs;
}) {
  const router = useRouter();
  const [sources, setSources] = useState<Source[]>([]);
  const [lot, setLot] = useState<Lot>(lotVide());
  const [texte, setTexte] = useState('');
  const [survol, setSurvol] = useState(false);
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [sscsMsg, setSscsMsg] = useState<{ ok: boolean; texte: string } | null>(null);
  const [sscsEnCours, setSscsEnCours] = useState(false);
  const enCours = useRef(new Set<string>());
  const deja = useMemo(() => new Set(existantes), [existantes]);
  const dictee = useDictee((t) => setTexte(t));
  const maintenant = maintenantParis();

  // ---------------------------------------------------------------------------
  // Ajout et lecture des sources
  // ---------------------------------------------------------------------------
  const ajouterFichiers = useCallback((liste: FileList | File[]) => {
    const nouvelles: Source[] = [];
    for (const f of Array.from(liste).slice(0, 60)) {
      const genre = genreDe(f);
      if (!genre) { nouvelles.push({ id: nouvelId(), nom: f.name, genre: 'texte', etat: 'echec', detail: 'Format non pris en charge : Excel, CSV, PDF, photo ou texte.' }); continue; }
      nouvelles.push({ id: nouvelId(), nom: f.name || (genre === 'image' ? 'Photo' : 'Fichier'), genre, etat: 'attente', fichier: f, vue: genre === 'image' ? URL.createObjectURL(f) : undefined });
    }
    setSources((s) => [...s, ...nouvelles]);
  }, []);

  function ajouterTexte(t = texte) {
    const propre = t.trim();
    if (!propre) return;
    dictee.arreter();
    setSources((s) => [...s, { id: nouvelId(), nom: propre.length > 50 ? propre.slice(0, 48).replace(/\s+\S*$/, '') + '…' : propre, genre: 'texte', etat: 'attente', texte: propre }]);
    setTexte('');
  }

  async function deposer(f: Blob, extension: string, type: string) {
    const chemin = `${agenceId}/import/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const { error } = await supabaseNavigateur().storage.from('documents').upload(chemin, f, { contentType: type });
    if (error) throw new Error('Envoi du fichier impossible. Vérifiez la connexion et réessayez.');
    return chemin;
  }

  async function lire(s: Source): Promise<{ lot: Lot; detail?: string }> {
    if (s.genre === 'texte') {
      const tout = s.texte ?? (s.fichier ? await s.fichier.text() : '');
      // Long texte : découpé par lignes en morceaux lisibles d'un coup
      const morceaux: string[] = []; let cur = '';
      for (const ligne of tout.split('\n')) { if ((cur + ligne).length > 14_000 && cur) { morceaux.push(cur); cur = ''; } cur += ligne + '\n'; }
      if (cur.trim()) morceaux.push(cur);
      let l = lotVide();
      for (const m of morceaux.slice(0, 8)) l = fusionner(l, (await demander({ texte: m, nom: s.nom })).lot);
      return { lot: l };
    }
    if (s.genre === 'image') {
      const blob = await compresser(s.fichier!, 1800);
      const chemin = await deposer(blob, 'jpg', 'image/jpeg');
      return { lot: (await demander({ chemin, nom: s.nom })).lot };
    }
    if (s.genre === 'pdf') {
      if (s.fichier!.size > 14_000_000) throw new Error('PDF trop lourd (14 Mo au plus) : envoyez-le en plusieurs parties.');
      const chemin = await deposer(s.fichier!, 'pdf', 'application/pdf');
      return { lot: (await demander({ chemin, nom: s.nom })).lot };
    }
    // Tableur : chaque feuille ; l'IA reconnaît les colonnes sur quelques lignes, le navigateur applique à toutes
    const feuilles = (await lireClasseur(s.fichier!)).filter((f) => f.lignes.some((l) => l.some((x) => String(x ?? '').trim())));
    if (!feuilles.length) throw new Error('Le fichier est vide.');
    let l = lotVide(); const notes: string[] = [];
    for (const f of feuilles.slice(0, 6)) {
      const nom = feuilles.length > 1 ? `${s.nom} · ${f.nom}` : s.nom;
      const pleines = f.lignes.filter((x) => x.some((c) => String(c ?? '').trim()));
      if (pleines.length <= 40) { l = fusionner(l, (await demander({ texte: tableEnTexte(f.lignes), nom })).lot); continue; }
      const { colonnes } = await demander({ mode: 'colonnes', echantillon: echantillon(f.lignes), nom }) as { colonnes: Colonnes };
      let issu = nettoyerLot(appliquerColonnes(f.lignes, colonnes), nom);
      const total = issu.vehicules.length + issu.clients.length + issu.locations.length + issu.chauffeurs.length;
      if (!total) {
        // Tableau trop désordonné pour des colonnes : lu par morceaux de 50 lignes
        issu = lotVide();
        for (let i = 0; i < Math.min(pleines.length, 400); i += 50) issu = fusionner(issu, (await demander({ texte: tableEnTexte(pleines.slice(i, i + 50)), nom })).lot);
        if (pleines.length > 400) notes.push(`${f.nom} : seules les 400 premières lignes ont été lues`);
      }
      l = fusionner(l, issu);
    }
    return { lot: l, detail: notes.join(' · ') || undefined };
  }

  useEffect(() => {
    const attente = sources.filter((s) => s.etat === 'attente' && !enCours.current.has(s.id));
    const libres = Math.max(0, 2 - enCours.current.size);
    for (const s of attente.slice(0, libres)) {
      enCours.current.add(s.id);
      setSources((x) => x.map((y) => (y.id === s.id ? { ...y, etat: 'lecture' } : y)));
      lire(s).then(({ lot: l, detail }) => {
        setLot((avant) => fusionner(avant, l));
        const parts = [l.vehicules.length && pluriel(l.vehicules.length, 'véhicule'), l.clients.length && pluriel(l.clients.length, 'client'),
          l.locations.length && pluriel(l.locations.length, 'location'), l.chauffeurs.length && pluriel(l.chauffeurs.length, 'chauffeur')].filter(Boolean);
        setSources((x) => x.map((y) => (y.id === s.id ? { ...y, etat: parts.length ? 'ok' : 'echec', detail: parts.length ? parts.join(', ') + (detail ? ` · ${detail}` : '') : 'Rien de reconnu dans ce document. Essayez une photo plus nette, ou écrivez les infos.' } : y)));
      }).catch((e) => {
        setSources((x) => x.map((y) => (y.id === s.id ? { ...y, etat: 'echec', detail: e?.message ?? 'Lecture impossible.' } : y)));
      }).finally(() => { enCours.current.delete(s.id); setSources((x) => [...x]); });
    }
  }, [sources]); // eslint-disable-line react-hooks/exhaustive-deps

  // Coller (Ctrl+V / appui long) une capture, un fichier ou du texte n'importe où sur la page
  useEffect(() => {
    const coller = (e: ClipboardEvent) => {
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.tagName === 'TEXTAREA' || cible.tagName === 'INPUT' || cible.isContentEditable)) return;
      const fichiers = Array.from(e.clipboardData?.files ?? []);
      if (fichiers.length) { e.preventDefault(); ajouterFichiers(fichiers); return; }
      const t = e.clipboardData?.getData('text') ?? '';
      if (t.trim()) { e.preventDefault(); ajouterTexte(t); }
    };
    window.addEventListener('paste', coller);
    return () => window.removeEventListener('paste', coller);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Modifications dans l'aperçu
  // ---------------------------------------------------------------------------
  const majV = (cle: string, champs: Partial<VehiculeImport>) => setLot((l) => ({ ...l, vehicules: l.vehicules.map((v) => (v.cle === cle ? { ...v, ...champs } : v)) }));
  const supV = (cle: string) => setLot((l) => ({ ...l, vehicules: l.vehicules.filter((v) => v.cle !== cle) }));
  const majL = (cle: string, champs: Partial<LocationImport>) => setLot((l) => ({ ...l, locations: l.locations.map((x) => (x.cle === cle ? { ...x, ...champs } : x)) }));
  const supL = (cle: string) => setLot((l) => ({ ...l, locations: l.locations.filter((x) => x.cle !== cle) }));
  const majC = (cle: string, champs: Partial<ClientImport>) => setLot((l) => ({ ...l, clients: l.clients.map((x) => (x.cle === cle ? { ...x, ...champs } : x)) }));
  const supC = (cle: string) => setLot((l) => ({ ...l, clients: l.clients.filter((x) => x.cle !== cle) }));
  const majCh = (cle: string, champs: Partial<ChauffeurImport>) => setLot((l) => ({ ...l, chauffeurs: l.chauffeurs.map((x) => (x.cle === cle ? { ...x, ...champs } : x)) }));
  const supCh = (cle: string) => setLot((l) => ({ ...l, chauffeurs: l.chauffeurs.filter((x) => x.cle !== cle) }));
  const ajouterLocation = (immat: string | null) => setLot((l) => ({ ...l, locations: [...l.locations, { cle: `${immat ?? 'l'}|${Date.now()}`, immatriculation: immat, client_nom: null, client_prenom: null, client_telephone: null, debut: null, fin: null, prix_total: null, caution: null, sources: ['saisie'] }] }));

  // ---------------------------------------------------------------------------
  // Ce qui partira à l'import
  // ---------------------------------------------------------------------------
  const vehiculesOk = lot.vehicules.filter((v) => v.immatriculation);
  const locationsOk = transport ? [] : lot.locations.filter((l) => ['en_cours', 'reservee'].includes(etatLocation(l, maintenant)));
  const enCoursLoc = locationsOk.filter((l) => etatLocation(l, maintenant) === 'en_cours').length;
  const garages = lot.vehicules.filter((v) => v.statut === 'garage' && v.immatriculation).length;
  const aCompleter = lot.vehicules.filter((v) => manquesVehicule(v).length).length + (transport ? 0 : lot.locations.filter((l) => etatLocation(l, maintenant) === 'incomplete').length);
  const total = vehiculesOk.length + (transport ? lot.chauffeurs.length : lot.clients.length + locationsOk.length);
  const lectures = sources.filter((s) => s.etat === 'attente' || s.etat === 'lecture').length;
  const plaques = Array.from(new Set([...vehiculesOk.map((v) => v.immatriculation!), ...existantes]));

  async function importer() {
    setEnvoi(true); setErreur('');
    const r = await importerFlotte(JSON.stringify(lot), { total: sources.length, ratees: sources.filter((s) => s.etat === 'echec').length });
    setEnvoi(false);
    if (r.erreur) { setErreur(r.erreur); return; }
    setBilan(r.bilan!); window.scrollTo({ top: 0, behavior: 'smooth' }); router.refresh();
  }

  async function rattacher() {
    setSscsEnCours(true);
    const r = await ajouterEquipementsSscs();
    setSscsEnCours(false);
    if (r.erreur && !r.ajoutes && !r.relies) { setSscsMsg({ ok: false, texte: r.erreur }); return; }
    const n = (r.ajoutes ?? 0) + (r.relies ?? 0);
    setSscsMsg({ ok: true, texte: `${pluriel(n, 'véhicule')} ${n > 1 ? 'sont' : 'est'} dans votre flotte, ${n > 1 ? 'reliés à leurs boîtiers' : 'relié à son boîtier'} : ${n > 1 ? 'ils apparaissent' : 'il apparaît'} déjà sur la carte.${r.erreur ? ' ' + r.erreur : ''}` });
    router.refresh();
  }

  // ---------------------------------------------------------------------------
  // Écran final
  // ---------------------------------------------------------------------------
  if (bilan) {
    const lignes = [
      bilan.vehicules && `${pluriel(bilan.vehicules, 'véhicule ajouté', 'véhicules ajoutés')}`,
      bilan.completes && `${pluriel(bilan.completes, 'fiche complétée', 'fiches complétées')}`,
      bilan.clients && `${pluriel(bilan.clients, 'client ajouté', 'clients ajoutés')}`,
      bilan.clientsRetrouves && `${pluriel(bilan.clientsRetrouves, 'client déjà connu', 'clients déjà connus')}`,
      bilan.locations && `${pluriel(bilan.locations, 'location en cours ou à venir', 'locations en cours ou à venir')}`,
      bilan.garage && `${pluriel(bilan.garage, 'véhicule au garage', 'véhicules au garage')}`,
      bilan.chauffeurs && `${pluriel(bilan.chauffeurs, 'chauffeur ajouté', 'chauffeurs ajoutés')}`,
      bilan.cartesGrises && `${pluriel(bilan.cartesGrises, 'carte grise rangée', 'cartes grises rangées')} dans ${bilan.cartesGrises > 1 ? 'les fiches' : 'la fiche'}`,
    ].filter(Boolean) as string[];
    return (
      <section className="carte imp-fini">
        <div className="imp-coche" aria-hidden>✓</div>
        <h2>Votre flotte est dans Fleet</h2>
        {lignes.length ? <ul className="imp-bilan">{lignes.map((l) => <li key={l}>{l}</li>)}</ul> : <p className="gris">Tout était déjà dans Fleet : rien de nouveau à ajouter.</p>}
        {bilan.sansPlaque > 0 && <p className="gris">{pluriel(bilan.sansPlaque, 'véhicule sans immatriculation', 'véhicules sans immatriculation')} : non {bilan.sansPlaque > 1 ? 'importés' : 'importé'}, ajoutez-{bilan.sansPlaque > 1 ? 'les' : 'le'} à la main ou d’une photo de carte grise.</p>}
        {bilan.aReprendre.length > 0 && (
          <details className="imp-reprendre" open={bilan.aReprendre.length <= 4}>
            <summary>{pluriel(bilan.aReprendre.length, 'point à reprendre', 'points à reprendre')}</summary>
            <ul>{bilan.aReprendre.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </details>
        )}
        <div className="ligne imp-suite">
          <a className="bouton principal" href="/vehicules">Voir mes véhicules</a>
          {!transport && bilan.locations > 0 && <a className="bouton" href="/planning">Voir le planning</a>}
          {transport && bilan.chauffeurs > 0 && <a className="bouton" href="/chauffeurs">Voir les chauffeurs</a>}
          <button type="button" className="bouton" onClick={() => { setBilan(null); setLot(lotVide()); setSources([]); }}>Importer autre chose</button>
        </div>
      </section>
    );
  }

  // ---------------------------------------------------------------------------
  // Dépôt + aperçu
  // ---------------------------------------------------------------------------
  return (
    <div className="imp">
      {sscs && !sscsMsg?.ok && (
        <section className="carte imp-sscs">
          <div>
            <b>Vous êtes client SS CAR SYSTEM : {pluriel(sscs.vehicules.length, 'véhicule équipé trouvé', 'véhicules équipés trouvés')} à votre nom.</b>
            <p className="gris">Un clic, et {sscs.vehicules.length > 1 ? 'ils arrivent' : 'il arrive'} dans votre flotte, déjà {sscs.vehicules.length > 1 ? 'reliés à leurs boîtiers' : 'relié à son boîtier'}, sur la carte et avec la coupure moteur.</p>
            <div className="imp-plaques">{sscs.vehicules.slice(0, 24).map((v) => <span key={v.immatriculation} className="imp-plaque" title={`${v.marque} ${v.modele}`.trim()}>{plaque(v.immatriculation)}</span>)}{sscs.vehicules.length > 24 && <span className="gris">+ {sscs.vehicules.length - 24}</span>}</div>
          </div>
          <button type="button" className="bouton principal" disabled={sscsEnCours} onClick={rattacher}>{sscsEnCours ? 'Ajout en cours…' : `Ajouter ${sscs.vehicules.length > 1 ? `les ${sscs.vehicules.length}` : 'le'} à ma flotte`}</button>
          {sscsMsg && !sscsMsg.ok && <p className="pastille retard" style={{ margin: 0 }}>{sscsMsg.texte}</p>}
        </section>
      )}
      {sscsMsg?.ok && <section className="carte imp-sscs ok"><b>✓ {sscsMsg.texte}</b><span className="gris">Vous pouvez compléter ci-dessous avec vos autres véhicules{transport ? ' et vos chauffeurs' : ', vos clients et vos locations en cours'}.</span></section>}

      <section
        className={`carte imp-zone ${survol ? 'survol' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setSurvol(true); }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => { e.preventDefault(); setSurvol(false); if (e.dataTransfer.files?.length) ajouterFichiers(e.dataTransfer.files); }}
      >
        <h2>Déposez tout ce que vous avez, comme ça vient</h2>
        <p className="gris">Votre Excel, des photos de cartes grises ou de contrats, un PDF, une capture d’écran de votre ancien logiciel, ou quelques lignes écrites. Fleet AI trie tout : véhicules{transport ? ', chauffeurs' : ', clients, locations en cours'} et voitures au garage.</p>
        <div className="imp-boutons">
          <label className="bouton principal">Choisir des fichiers
            <input type="file" multiple accept=".xlsx,.xlsm,.xls,.csv,.tsv,.txt,.pdf,image/*" hidden onChange={(e) => { if (e.target.files) ajouterFichiers(e.target.files); e.target.value = ''; }} />
          </label>
          <label className="bouton">Prendre des photos
            <input type="file" multiple accept="image/*" capture="environment" hidden onChange={(e) => { if (e.target.files) ajouterFichiers(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
        <div className="imp-texte">
          <textarea rows={3} value={texte} onChange={(e) => setTexte(e.target.value)}
            placeholder={transport ? 'Ou écrivez / dictez, par exemple : « Master AB-123-CD 125 000 km, Jumper EF-456-GH au garage Speedy jusqu’à jeudi, chauffeurs Karim 06 12 34 56 78 et Paul »' : 'Ou écrivez / dictez, par exemple : « La 208 AB-123-CD est chez Jean Dupont jusqu’à vendredi, la Clio EF-456-GH est au garage, la Golf GH-789-IJ est dispo »'} />
          <div className="imp-texte-actions">
            {dictee.dispo && <button type="button" className={`bouton ${dictee.ecoute ? 'actif' : ''}`} onClick={() => dictee.basculer(texte)} aria-label="Dicter">{dictee.ecoute ? '■ Arrêter' : '🎤 Dicter'}</button>}
            <button type="button" className="bouton principal" disabled={!texte.trim()} onClick={() => ajouterTexte()}>Lire ce texte</button>
          </div>
          {dictee.erreur && <span className="gris" style={{ fontSize: 13 }}>{dictee.erreur}</span>}
        </div>
        <p className="gris imp-astuce">Astuce : glissez vos fichiers ici, ou collez une capture (Ctrl+V). <button type="button" className="lien" onClick={() => telechargerModele(transport)}>Vous partez de zéro ? Téléchargez notre modèle Excel.</button></p>
      </section>

      {sources.length > 0 && (
        <section className="carte imp-sources">
          <h3>Ce que Fleet AI lit {lectures > 0 && <span className="gris">· {lectures} en cours</span>}</h3>
          <ul>
            {sources.map((s) => (
              <li key={s.id} className={`imp-source etat-${s.etat}`}>
                {s.vue ? <img src={s.vue} alt="" /> : <span className="imp-icone" aria-hidden>{ICONES[s.genre]}</span>}
                <span className="imp-source-texte"><b>{s.nom}</b><span className="gris">{s.etat === 'attente' ? 'En attente…' : s.etat === 'lecture' ? 'Lecture en cours…' : s.detail}</span></span>
                {s.etat === 'lecture' && <span className="imp-roue" aria-label="Lecture en cours" />}
                {s.etat === 'ok' && <span className="imp-ok" aria-label="Lu">✓</span>}
                {s.etat === 'echec' && (s.fichier || s.texte) && <button type="button" className="bouton petit" onClick={() => setSources((x) => x.map((y) => (y.id === s.id ? { ...y, etat: 'attente', detail: undefined } : y)))}>Réessayer</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(lot.vehicules.length > 0 || lot.clients.length > 0 || lot.chauffeurs.length > 0) && (
        <>
          <section className="imp-resume">
            <span><b>{vehiculesOk.length}</b> véhicule{vehiculesOk.length > 1 ? 's' : ''}</span>
            {!transport && <span><b>{lot.clients.length}</b> client{lot.clients.length > 1 ? 's' : ''}</span>}
            {!transport && <span><b>{enCoursLoc}</b> location{enCoursLoc > 1 ? 's' : ''} en cours</span>}
            {!transport && locationsOk.length > enCoursLoc && <span><b>{locationsOk.length - enCoursLoc}</b> à venir</span>}
            <span><b>{garages}</b> au garage</span>
            {transport && <span><b>{lot.chauffeurs.length}</b> chauffeur{lot.chauffeurs.length > 1 ? 's' : ''}</span>}
            {aCompleter > 0 && <span className="imp-a-completer">{aCompleter} à compléter</span>}
          </section>

          <section className="carte imp-bloc">
            <h3>Véhicules <span className="gris">· vérifiez, corrigez si besoin{catalogue ? ' · touchez le visuel pour choisir photo ou icône' : ''}</span></h3>
            {lot.vehicules.map((v) => {
              const statut = statutAffiche(v, lot.locations, maintenant);
              const manque = manquesVehicule(v);
              const photo = visuelRetenu(catalogue, v);
              const sansLocation = !transport && statut === 'loue' && !lot.locations.some((l) => l.immatriculation === v.immatriculation);
              return (
                <div key={v.cle} className={`imp-ligne ${!v.immatriculation ? 'manque' : ''}`}>
                  <button type="button" className="imp-visuel" disabled={!catalogue} title={catalogue ? (photo ? 'Mettre l’icône classique' : 'Mettre la photo du modèle') : undefined}
                    onClick={() => majV(v.cle, { visuel: photo ? 'icone' : 'photo' })}>
                    {photo ? <img src={photo} alt="" /> : <LogoMarque marque={v.marque} modele={v.modele} className="vignette logo-marque" />}
                  </button>
                  <div className="imp-champs">
                    <input className="imp-plaque-champ" value={v.immatriculation ? plaque(v.immatriculation) : ''} placeholder="Plaque *" aria-label="Immatriculation"
                      onChange={(e) => majV(v.cle, { immatriculation: plaqueNette(e.target.value) ?? (e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') || null) })} autoCapitalize="characters" />
                    <input value={v.marque ?? ''} placeholder="Marque" aria-label="Marque" onChange={(e) => majV(v.cle, { marque: e.target.value || null })} />
                    <input value={v.modele ?? ''} placeholder="Modèle (RS3, GTI…)" aria-label="Modèle" onChange={(e) => majV(v.cle, { modele: e.target.value || null })} />
                    <input className="court" value={v.annee ?? ''} placeholder="Année" inputMode="numeric" aria-label="Année" onChange={(e) => majV(v.cle, { annee: Number(e.target.value.replace(/\D/g, '').slice(0, 4)) || null })} />
                    <input className="court" value={v.km ?? ''} placeholder="Km" inputMode="numeric" aria-label="Kilométrage" onChange={(e) => majV(v.cle, { km: Number(e.target.value.replace(/\D/g, '')) || null })} />
                    <select value={statut} aria-label="Situation" onChange={(e) => majV(v.cle, { statut: e.target.value as any })}>
                      <option value="disponible">Disponible</option>
                      {!transport && <option value="loue">Loué</option>}
                      <option value="garage">Au garage</option>
                    </select>
                    {statut === 'garage' && <>
                      <input value={v.garage ?? ''} placeholder="Garage" aria-label="Garage" onChange={(e) => majV(v.cle, { garage: e.target.value || null })} />
                      <label className="imp-date">Retour<input type="date" value={v.retour_garage ?? ''} onChange={(e) => majV(v.cle, { retour_garage: e.target.value || null })} /></label>
                    </>}
                  </div>
                  <div className="imp-etat">
                    {v.immatriculation && deja.has(v.immatriculation) ? <span className="imp-badge info">Déjà dans Fleet · complétée</span>
                      : manque.length ? <span className="imp-badge manque">À compléter : {manque.join(', ')}</span> : <span className="imp-badge ok">OK</span>}
                    {v.carte_grise && <span className="imp-badge info">Carte grise jointe</span>}
                    {sansLocation && <button type="button" className="bouton petit" onClick={() => ajouterLocation(v.immatriculation)}>+ À qui et jusqu’à quand ?</button>}
                    <button type="button" className="imp-retirer" aria-label="Retirer cette ligne" onClick={() => supV(v.cle)}>×</button>
                  </div>
                </div>
              );
            })}
            {lot.vehicules.some((v) => !v.immatriculation) && <p className="gris imp-note">Les lignes sans immatriculation ne seront pas importées : complétez-les ou retirez-les.</p>}
          </section>

          {!transport && (lot.locations.length > 0 || lot.vehicules.some((v) => v.statut === 'loue')) && (
            <section className="carte imp-bloc">
              <h3>Locations en cours et à venir</h3>
              {lot.locations.map((l) => {
                const etat = etatLocation(l, maintenant);
                const manque = manquesLocation(l);
                return (
                  <div key={l.cle} className={`imp-ligne ${etat === 'terminee' ? 'imp-passee' : ''}`}>
                    <div className="imp-champs">
                      <select value={l.immatriculation ?? ''} aria-label="Véhicule" onChange={(e) => majL(l.cle, { immatriculation: e.target.value || null })}>
                        <option value="">Véhicule ?</option>
                        {plaques.map((p) => <option key={p} value={p}>{plaque(p)}</option>)}
                      </select>
                      <input value={l.client_prenom ?? ''} placeholder="Prénom" aria-label="Prénom du client" onChange={(e) => majL(l.cle, { client_prenom: e.target.value || null })} />
                      <input value={l.client_nom ?? ''} placeholder="Nom du client *" aria-label="Nom du client" onChange={(e) => majL(l.cle, { client_nom: e.target.value || null })} />
                      <input value={l.client_telephone ?? ''} placeholder="Téléphone" inputMode="tel" aria-label="Téléphone du client" onChange={(e) => majL(l.cle, { client_telephone: e.target.value || null })} />
                      <label className="imp-date">Départ<input type="datetime-local" value={l.debut ?? ''} onChange={(e) => majL(l.cle, { debut: e.target.value || null })} /></label>
                      <label className="imp-date">Retour *<input type="datetime-local" value={l.fin ?? ''} onChange={(e) => majL(l.cle, { fin: e.target.value || null })} /></label>
                      <input className="court" value={l.prix_total ?? ''} placeholder="Prix €" inputMode="decimal" aria-label="Prix" onChange={(e) => majL(l.cle, { prix_total: Number(e.target.value.replace(',', '.').replace(/[^\d.]/g, '')) || null })} />
                    </div>
                    <div className="imp-etat">
                      {etat === 'en_cours' && <span className="imp-badge ok">En cours</span>}
                      {etat === 'reservee' && <span className="imp-badge info">À venir</span>}
                      {etat === 'terminee' && <span className="imp-badge">Déjà terminée · ignorée</span>}
                      {etat === 'incomplete' && <span className="imp-badge manque">À compléter : {manque.join(', ')}</span>}
                      <button type="button" className="imp-retirer" aria-label="Retirer cette location" onClick={() => supL(l.cle)}>×</button>
                    </div>
                  </div>
                );
              })}
              <button type="button" className="bouton petit" onClick={() => ajouterLocation(null)}>+ Ajouter une location en cours</button>
            </section>
          )}

          {!transport && lot.clients.length > 0 && (
            <details className="carte imp-bloc" open={lot.clients.length <= 8}>
              <summary><h3 style={{ display: 'inline' }}>Clients ({lot.clients.length})</h3> <span className="gris">· retrouvés par téléphone ou par nom s’ils existent déjà</span></summary>
              {lot.clients.map((c) => (
                <div key={c.cle} className="imp-ligne">
                  <div className="imp-champs">
                    <input value={c.prenom ?? ''} placeholder="Prénom" aria-label="Prénom" onChange={(e) => majC(c.cle, { prenom: e.target.value || null })} />
                    <input value={c.nom} placeholder="Nom *" aria-label="Nom" onChange={(e) => majC(c.cle, { nom: e.target.value })} />
                    <input value={c.telephone ?? ''} placeholder="Téléphone" inputMode="tel" aria-label="Téléphone" onChange={(e) => majC(c.cle, { telephone: e.target.value || null })} />
                    <input value={c.email ?? ''} placeholder="E-mail" inputMode="email" aria-label="E-mail" onChange={(e) => majC(c.cle, { email: e.target.value || null })} />
                  </div>
                  <div className="imp-etat"><button type="button" className="imp-retirer" aria-label="Retirer ce client" onClick={() => supC(c.cle)}>×</button></div>
                </div>
              ))}
            </details>
          )}

          {transport && lot.chauffeurs.length > 0 && (
            <section className="carte imp-bloc">
              <h3>Chauffeurs</h3>
              {lot.chauffeurs.map((c) => (
                <div key={c.cle} className="imp-ligne">
                  <div className="imp-champs">
                    <input value={c.prenom ?? ''} placeholder="Prénom" aria-label="Prénom" onChange={(e) => majCh(c.cle, { prenom: e.target.value || null })} />
                    <input value={c.nom} placeholder="Nom *" aria-label="Nom" onChange={(e) => majCh(c.cle, { nom: e.target.value })} />
                    <input value={c.telephone ?? ''} placeholder="Téléphone" inputMode="tel" aria-label="Téléphone" onChange={(e) => majCh(c.cle, { telephone: e.target.value || null })} />
                  </div>
                  <div className="imp-etat"><button type="button" className="imp-retirer" aria-label="Retirer ce chauffeur" onClick={() => supCh(c.cle)}>×</button></div>
                </div>
              ))}
            </section>
          )}

          {lot.remarques.length > 0 && (
            <section className="carte imp-remarques">
              <h3>Ce que Fleet AI n’a pas pu ranger</h3>
              <ul>{lot.remarques.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </section>
          )}

          <div className="imp-barre">
            <span className="gris">{lectures > 0 ? `Lecture en cours (${lectures})… vous pouvez déjà vérifier.` : aCompleter ? `${aCompleter} ligne${aCompleter > 1 ? 's' : ''} à compléter : elles peuvent attendre, le reste entre quand même.` : 'Tout est prêt.'}</span>
            {erreur && <span className="pastille retard">{erreur}</span>}
            <button type="button" className="bouton" onClick={() => { if (confirmerVidage(total)) { setLot(lotVide()); setSources([]); } }}>Tout effacer</button>
            <button type="button" className="bouton principal" disabled={!total || envoi || lectures > 0} onClick={importer}>
              {envoi ? 'Import en cours…' : <><span className="imp-court">Tout importer</span><span className="imp-long">{`Tout importer (${[vehiculesOk.length && pluriel(vehiculesOk.length, 'véhicule'), !transport && lot.clients.length && pluriel(lot.clients.length, 'client'), !transport && locationsOk.length && pluriel(locationsOk.length, 'location'), transport && lot.chauffeurs.length && pluriel(lot.chauffeurs.length, 'chauffeur')].filter(Boolean).join(', ')})`}</span></>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Effacer l'aperçu ne touche à rien dans Fleet ; on demande seulement si beaucoup de lignes ont déjà été vérifiées
function confirmerVidage(total: number) {
  return total < 5 || window.confirm(`Effacer l’aperçu (${total} lignes) ? Rien n’a encore été importé.`);
}
