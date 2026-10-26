import { utilisateurCourant } from '@/lib/agence';
import { dateHeure, date, euros, plaque } from '@/lib/format';
import { TYPES_SINISTRE, STATUT_SINISTRE, FINIS } from '@/lib/sinistres';
import { nomChauffeur } from '@/lib/transport';
import * as S from './actions';
import Cadre from '../_c/Cadre';
import Formulaire from '../_c/Formulaire';
import Envoyer from '../_c/Envoyer';
import OuvrirFormulaire from '../_c/OuvrirFormulaire';

export const dynamic = 'force-dynamic';

// Sinistres : chaque dossier avec son étape, les documents qui manquent et la prochaine relance de l'assureur
export default async function Sinistres({ searchParams }: { searchParams: { filtre?: string } }) {
  const { supabase, transport } = await utilisateurCourant();
  const filtre = searchParams.filtre === 'clos' ? 'clos' : 'en_cours';
  const aujourdhui = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  let q = supabase.from('sinistres').select('*, vehicules(immatriculation, marque, modele), chauffeurs(prenom, nom), clients(prenom, nom)');
  q = filtre === 'clos' ? q.in('statut', FINIS).order('date_sinistre', { ascending: false }) : q.not('statut', 'in', `(${FINIS.join(',')})`).order('prochaine_relance', { nullsFirst: false });
  const [{ data: sinistres }, { data: vehicules }, { data: chauffeurs }, { data: tous }] = await Promise.all([
    q,
    supabase.from('vehicules').select('id, immatriculation, marque, modele').neq('statut', 'sorti').order('immatriculation'),
    transport ? supabase.from('chauffeurs').select('id, prenom, nom').eq('actif', true).order('prenom') : Promise.resolve({ data: [] as any[] }),
    supabase.from('sinistres').select('statut, reste_a_charge, montant_estime, date_sinistre'),
  ]);
  const enCours = (tous ?? []).filter((s: any) => !FINIS.includes(s.statut));
  const aRelancer = (sinistres ?? []).filter((s: any) => !FINIS.includes(s.statut) && s.prochaine_relance && s.prochaine_relance <= aujourdhui).length;
  const annee = aujourdhui.slice(0, 4);
  const coutAnnee = (tous ?? []).filter((s: any) => String(s.date_sinistre).startsWith(annee)).reduce((x: number, s: any) => x + Number(s.reste_a_charge ?? 0), 0);
  const docsManquants = (s: any) => (Array.isArray(s.documents) ? s.documents : []).filter((d: any) => !d.fait).length;

  return (
    <Cadre titre="Sinistres" tables={['sinistres']} actions={<OuvrirFormulaire>+ Déclarer un sinistre</OuvrirFormulaire>}>
      <details className="formulaire carte formulaire-haut">
        <summary>Nouveau sinistre</summary>
        <Formulaire action={S.creerSinistre} className="grille" succes="Sinistre enregistré">
          <label>Type *<select name="type" required>{Object.entries(TYPES_SINISTRE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Date et heure *<input name="date_sinistre" type="datetime-local" required /></label>
          <label>Véhicule<select name="vehicule_id"><option value="">—</option>{(vehicules ?? []).map((v: any) => <option key={v.id} value={v.id}>{plaque(v.immatriculation)} · {[v.marque, v.modele].filter(Boolean).join(' ')}</option>)}</select></label>
          {transport && <label>Chauffeur<select name="chauffeur_id"><option value="">Retrouvé par le planning</option>{(chauffeurs ?? []).map((c: any) => <option key={c.id} value={c.id}>{nomChauffeur(c)}</option>)}</select></label>}
          <label>Lieu<input name="lieu" /></label>
          <label>Assureur<input name="assureur" /></label>
          <label className="pleine">Ce qui s&apos;est passé<input name="description" placeholder="Accrochage en marche arrière au dépôt…" /></label>
          <label className="pleine">Tiers (nom, assurance, plaque)<input name="tiers" /></label>
          <Envoyer>Enregistrer</Envoyer>
        </Formulaire>
        <p className="gris" style={{ fontSize: 13, marginBottom: 0 }}>La liste des documents que l&apos;assureur demande pour ce type de sinistre est préparée toute seule.</p>
      </details>

      <section className="compteurs">
        <div className="compteur"><span>Dossiers en cours</span><b>{enCours.length}</b></div>
        <div className="compteur"><span>À relancer aujourd&apos;hui</span><b style={{ color: aRelancer ? 'var(--orange)' : 'var(--vert)' }}>{aRelancer}</b></div>
        <div className="compteur"><span>Reste à charge {annee}</span><b>{euros(coutAnnee)}</b></div>
      </section>
      <div className="filtres">
        <a href="/sinistres" className={filtre === 'en_cours' ? 'actif' : ''}>En cours</a>
        <a href="/sinistres?filtre=clos" className={filtre === 'clos' ? 'actif' : ''}>Clos</a>
      </div>
      {!(sinistres ?? []).length && <p className="vide carte">{filtre === 'clos' ? 'Aucun dossier clos.' : 'Aucun sinistre en cours.'}</p>}
      {(sinistres ?? []).map((s: any) => {
        const relance = !FINIS.includes(s.statut) && s.prochaine_relance && s.prochaine_relance <= aujourdhui;
        const manquants = docsManquants(s);
        return (
          <a key={s.id} href={`/sinistres/${s.id}`} className="carte carte-lien" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
            <div className="titre" style={{ marginBottom: 6 }}>
              <h2 style={{ margin: 0 }}>{TYPES_SINISTRE[s.type] ?? 'Sinistre'} · {plaque(s.vehicules?.immatriculation) || 'véhicule ?'}</h2>
              <span className="ligne">
                <span className={`pastille ${FINIS.includes(s.statut) ? 'termine' : 'en_cours'}`}>{STATUT_SINISTRE[s.statut] ?? s.statut}</span>
                {s.source === 'appli' && s.statut === 'a_declarer' && <span className="badge">Déclaré par le chauffeur</span>}
                {relance && <span className="badge rouge">À relancer</span>}
              </span>
            </div>
            <p className="gris" style={{ margin: 0, fontSize: 14 }}>
              {dateHeure(s.date_sinistre)}{s.chauffeurs ? ` · ${nomChauffeur(s.chauffeurs)}` : s.clients ? ` · ${nomChauffeur(s.clients)}` : ''}{s.assureur ? ` · ${s.assureur}` : ''}{s.numero_dossier ? ` · dossier ${s.numero_dossier}` : ''}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 14 }}>
              {manquants ? <span style={{ color: 'var(--orange)', fontWeight: 700 }}>{manquants} document{manquants > 1 ? 's' : ''} à fournir</span> : <span style={{ color: 'var(--vert)', fontWeight: 700 }}>Documents complets</span>}
              {!FINIS.includes(s.statut) && s.prochaine_relance ? <span className="gris"> · prochaine relance le {date(s.prochaine_relance)}</span> : null}
              {s.montant_estime ? <span className="gris"> · estimé {euros(s.montant_estime)}</span> : null}
            </p>
          </a>
        );
      })}
    </Cadre>
  );
}
