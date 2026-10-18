import { utilisateurCourant } from '@/lib/agence';
import { calculerPilotage, Granularite } from '@/lib/pilotage';
import { euros, versJour, date, categoriesDepense } from '@/lib/format';
import { ajouterDepense } from '../actions';
import Cadre from '../_c/Cadre';
import Formulaire from '../_c/Formulaire';
import Envoyer from '../_c/Envoyer';
import Graphique, { RECETTES, COUTS } from '../_c/Graphique';

export const dynamic = 'force-dynamic';

export default async function Pilotage({ searchParams }: { searchParams: { g?: string; i?: string } }) {
  const { supabase } = await utilisateurCourant();
  const g = (['jour', 'semaine', 'mois'].includes(searchParams.g ?? '') ? searchParams.g : 'mois') as Granularite;
  const r = await calculerPilotage(supabase, g);
  const n = r.periodes.length;
  const i = Math.min(n - 1, Math.max(0, Number.isFinite(Number(searchParams.i)) && searchParams.i ? Number(searchParams.i) : n - 1));
  const p = r.periodes[i];
  const precedente = r.periodes[i - 1];
  const joursPeriode = Math.max(1, (Math.min(p.fin.getTime(), Date.now()) - p.debut.getTime()) / 86400000);
  const occupation = r.nbVehicules ? Math.min(100, Math.round((p.joursLoues / (r.nbVehicules * joursPeriode)) * 100)) : 0;
  const marge = p.recettes ? Math.round((p.resultat / p.recettes) * 100) : 0;
  const evolution = precedente && precedente.resultat !== 0 ? Math.round(((p.resultat - precedente.resultat) / Math.abs(precedente.resultat)) * 100) : null;
  const sansCout = r.vehicules.filter((v: any) => !v.cout_mensuel && !['hors_service', 'sorti'].includes(v.statut));

  const [{ data: vehicules }, { data: dernieres }] = await Promise.all([
    supabase.from('vehicules').select('id, immatriculation, marque, modele').order('immatriculation'),
    supabase.from('depenses').select('id, categorie, montant, date, libelle, vehicules(immatriculation)').order('date', { ascending: false }).limit(10),
  ]);

  const recettes: [string, number][] = [['Locations', p.locations], ['Kilomètres en trop', p.kmSup], ['Retenues sur caution', p.cautions], ['Transferts à d\u2019autres loueurs', p.transferts]];
  const couts: [string, number][] = [['Véhicules (leasing, crédit, achat)', p.vehicules], ['Entretien', p.entretien], ['Dégâts', p.degats],
    ['Fourrière et autres dépenses', p.depenses], ['Amendes payées par l’agence', p.amendes]];
  const libelleG = { jour: 'jour', semaine: 'semaine', mois: 'mois' }[g];
  const lien = (k: number) => `/pilotage?g=${g}&i=${k}`;
  const ligne = (titre: string, v: number, total: number, couleur: string) => (
    <div key={titre} className="poste">
      <div className="ligne" style={{ justifyContent: 'space-between' }}><span>{titre}</span><b>{euros(v)}</b></div>
      <div className="jauge"><i style={{ width: `${total ? (v / total) * 100 : 0}%`, background: couleur }} /></div>
    </div>
  );

  return (
    <Cadre titre="Pilotage business" tables={['locations', 'depenses', 'entretiens', 'dommages', 'vehicules']}
      actions={<div className="filtres" style={{ margin: 0 }}>
        {(['jour', 'semaine', 'mois'] as const).map((x) => <a key={x} href={`/pilotage?g=${x}`} className={g === x ? 'actif' : ''}>{x === 'jour' ? 'Jour' : x === 'semaine' ? 'Semaine' : 'Mois'}</a>)}
      </div>}>

      {sansCout.length > 0 && <div className="info-bandeau">
        Coût mensuel à renseigner pour {sansCout.map((v: any) => <a key={v.id} className="lien" href={`/vehicules/${v.id}`}>{v.immatriculation} </a>)}
        : sans lui, la rentabilité ne compte pas le leasing ou le crédit.
      </div>}

      <div className="titre" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{g === 'jour' ? `Le ${p.libelle}` : g === 'semaine' ? `Semaine du ${date(p.debut.toISOString())}` : p.debut.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })}
          {i === n - 1 && <span className="gris" style={{ fontWeight: 400 }}> · en cours</span>}</h2>
        <span className="ligne">
          {i > 0 && <a className="bouton petit" href={lien(i - 1)}>← {libelleG} précédent{g === 'semaine' ? 'e' : ''}</a>}
          {i < n - 1 && <a className="bouton petit" href={lien(i + 1)}>{libelleG} suivant{g === 'semaine' ? 'e' : ''} →</a>}
        </span>
      </div>

      <section className="compteurs">
        <div className="compteur"><span>Recettes</span><b style={{ color: 'var(--texte)' }}>{euros(p.recettes)}</b></div>
        <div className="compteur"><span>Coûts</span><b style={{ color: 'var(--texte)' }}>{euros(p.couts)}</b></div>
        <div className="compteur"><span>Résultat{evolution !== null ? ` (${evolution >= 0 ? '+' : ''}${evolution} %)` : ''}</span>
          <b style={{ color: p.resultat >= 0 ? 'var(--vert)' : 'var(--rouge)' }}>{p.resultat >= 0 ? '+' : ''}{euros(p.resultat)}</b></div>
        <div className="compteur"><span>Marge</span><b style={{ color: 'var(--texte)' }}>{p.recettes ? marge + ' %' : '—'}</b></div>
        <div className="compteur"><span>Occupation de la flotte</span><b style={{ color: 'var(--texte)' }}>{occupation} %</b></div>
        <div className="compteur"><span>Départs · retours</span><b style={{ color: 'var(--texte)' }}>{p.departs} · {p.retours}</b></div>
      </section>

      <section className="carte">
        <h2>Recettes et coûts par {libelleG}</h2>
        <Graphique periodes={r.periodes} selection={i} lien={lien} />
        <p className="gris" style={{ fontSize: 12.5, margin: '6px 0 0' }}>Toucher une période pour voir son détail. Le prix d&apos;une location est réparti sur ses jours ; le coût mensuel du véhicule est compté au jour près.</p>
        <details style={{ marginTop: 10 }}>
          <summary className="gris" style={{ cursor: 'pointer', fontSize: 13.5 }}>Voir les chiffres en tableau</summary>
          <div className="tableau" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Période</th><th>Recettes</th><th>Coûts</th><th>Résultat</th><th className="masque-mobile">Départs</th></tr></thead>
              <tbody>{[...r.periodes].reverse().map((x, k) => (
                <tr key={k}><td><a className="bloc" href={lien(n - 1 - k)}>{x.libelle}</a></td><td>{euros(x.recettes)}</td><td>{euros(x.couts)}</td>
                  <td style={{ color: x.resultat >= 0 ? 'var(--vert)' : 'var(--rouge)' }}>{euros(x.resultat)}</td><td className="masque-mobile">{x.departs}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      </section>

      <div className="colonnes">
        <section className="carte">
          <h2>D&apos;où vient l&apos;argent</h2>
          {recettes.map(([t, v]) => ligne(t, v, p.recettes, RECETTES))}
        </section>
        <section className="carte">
          <h2>Où il part</h2>
          {couts.map(([t, v]) => ligne(t, v, p.couts, COUTS))}
        </section>
      </div>

      <section className="carte" style={{ marginTop: 16 }}>
        <h2>Rentabilité par véhicule</h2>
        <div className="tableau" style={{ marginBottom: 0 }}>
          <table>
            <thead><tr><th>Véhicule</th><th>Recettes</th><th>Coûts</th><th>Résultat</th><th className="masque-mobile">Jours loués</th></tr></thead>
            <tbody>
              {[...r.vehicules].sort((a: any, b: any) => b.periodes[i].resultat - a.periodes[i].resultat).map((v: any) => {
                const x = v.periodes[i];
                return (
                  <tr key={v.id}>
                    <td><a className="bloc" href={`/vehicules/${v.id}`}><b>{v.immatriculation}</b><br /><span className="gris">{[v.marque, v.modele].filter(Boolean).join(' ')}{!v.cout_mensuel ? ' · coût à renseigner' : ` · ${euros(v.cout_mensuel)}/mois`}</span></a></td>
                    <td>{euros(x.recettes)}</td><td>{euros(x.couts)}</td>
                    <td style={{ color: x.resultat >= 0 ? 'var(--vert)' : 'var(--rouge)', fontWeight: 600 }}>{x.resultat >= 0 ? '+' : ''}{euros(x.resultat)}</td>
                    <td className="masque-mobile">{Math.round(x.joursLoues * 10) / 10}</td>
                  </tr>
                );
              })}
              {!r.vehicules.length && <tr><td colSpan={5} className="vide">Aucun véhicule.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="carte">
        <h2>Ajouter une dépense</h2>
        <Formulaire vider action={ajouterDepense} className="grille">
          <label>Véhicule<select name="vehicule_id"><option value="">Toute la flotte</option>
            {vehicules?.map((v: any) => <option key={v.id} value={v.id}>{v.immatriculation} · {[v.marque, v.modele].filter(Boolean).join(' ')}</option>)}</select></label>
          <label>Type<select name="categorie">{Object.entries(categoriesDepense).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>
          <label>Montant (€) *<input name="montant" type="number" step="0.01" min={0} required inputMode="decimal" /></label>
          <label>Date<input name="date" type="date" defaultValue={versJour(new Date())} /></label>
          <label className="pleine">Détail<input name="libelle" placeholder="Fourrière de Pantin, remorquage…" /></label>
          <Envoyer className="bouton">Enregistrer la dépense</Envoyer>
        </Formulaire>
        {!!dernieres?.length && <>
          <h3 style={{ marginTop: 16 }}>Dernières dépenses</h3>
          {dernieres.map((d: any) => (
            <div key={d.id} className="fichier"><span>{categoriesDepense[d.categorie] ?? d.categorie} · <b>{euros(d.montant)}</b><br /><span className="gris">{d.vehicules?.immatriculation ?? 'Toute la flotte'}{d.libelle ? ' · ' + d.libelle : ''}</span></span><span className="gris">{date(d.date)}</span></div>
          ))}
        </>}
      </section>
    </Cadre>
  );
}
