import OuvrirFormulaire from '@/app/_c/OuvrirFormulaire';
import { utilisateurCourant, liensFichiers } from '@/lib/agence';
import { statutAmende, dateHeure, date, euros, JOUR, plaque } from '@/lib/format';
import * as A from '../actions';
import Cadre from '../_c/Cadre';
import Formulaire from '../_c/Formulaire';
import Envoyer from '../_c/Envoyer';
import Fichier from '../_c/Fichier';
import Copier from '../_c/Copier';
import Scanner from '../_c/Scanner';

export const dynamic = 'force-dynamic';

export default async function Amendes({ searchParams }: { searchParams: { filtre?: string } }) {
  const { supabase, profil } = await utilisateurCourant();
  const filtre = searchParams.filtre ?? 'a_traiter';
  let q = supabase.from('amendes').select('*, vehicules(immatriculation), clients(id, nom, prenom, telephone, date_naissance, adresse, numero_permis, date_permis), locations(id, numero)');
  q = filtre === 'a_traiter' ? q.in('statut', ['a_designer', 'infos_manquantes', 'refusee']).order('echeance') : q.eq('statut', filtre).order('date_infraction', { ascending: false });
  const [{ data: amendes }, { data: clients }, { data: vehicules }] = await Promise.all([
    q, supabase.from('clients').select('id, nom, prenom').order('nom'), supabase.from('vehicules').select('immatriculation').order('immatriculation'),
  ]);
  const liens = await liensFichiers(supabase, (amendes ?? []).map((a: any) => a.avis_path));
  // Conducteur pas trouvé (l'infraction tombe entre deux locations) : on propose la location la plus proche dans le temps
  const sansConducteur = (amendes ?? []).filter((a: any) => !a.clients && a.vehicule_id);
  const { data: locsProches } = sansConducteur.length
    ? await supabase.from('locations').select('id, numero, vehicule_id, debut, fin_prevue, fin_reelle, client_id, clients(nom, prenom)')
        .in('vehicule_id', Array.from(new Set(sansConducteur.map((a: any) => a.vehicule_id)))).neq('statut', 'annulee')
    : { data: [] as any[] };
  const plusProche = (a: any) => {
    const t = new Date(a.date_infraction).getTime();
    let meilleur: { l: any; ecart: number } | null = null;
    for (const l of (locsProches ?? []).filter((x: any) => x.vehicule_id === a.vehicule_id && x.client_id)) {
      const d = new Date(l.debut).getTime(), f = new Date(l.fin_reelle ?? l.fin_prevue).getTime();
      const ecart = t < d ? d - t : t > f ? t - f : 0;
      if (!meilleur || ecart < meilleur.ecart) meilleur = { l, ecart };
    }
    return meilleur && meilleur.ecart < 2 * JOUR ? meilleur : null;
  };
  const ecartTexte = (ms: number) => ms < 3600e3 ? `${Math.round(ms / 60000)} min` : `${Math.round(ms / 3600e3)} h`;

  return (
    <Cadre titre="Amendes" tables={['amendes']} actions={<><a className="bouton" href="/export/amendes">Exporter</a><OuvrirFormulaire>+ Saisir un avis de contravention</OuvrirFormulaire></>}>
      <details className="formulaire carte formulaire-haut">
        <summary>Nouvel avis de contravention</summary>
        <Formulaire vider action={A.ajouterAmende} className="grille">
          <Scanner genre="amende" agenceId={profil.agence_id} champChemin="avis_path" libelle="Avis de contravention" />
          <input type="hidden" name="avis_path" />
          <label>Immatriculation *<input name="immatriculation" list="immats" required placeholder="AB123CD" /></label>
          <datalist id="immats">{vehicules?.map((v: any) => <option key={plaque(v.immatriculation)} value={plaque(v.immatriculation)} />)}</datalist>
          <label>Date et heure de l&apos;infraction *<input name="date_infraction" type="datetime-local" required /></label>
          <label>Infraction<input name="type" placeholder="Excès de vitesse, stationnement…" /></label>
          <label>Lieu<input name="lieu" /></label>
          <label>Montant (€)<input name="montant" type="number" step="0.01" /></label>
          <label>N° de l&apos;avis<input name="numero_avis" /></label>
          <label>Date limite de désignation<input name="echeance" type="date" /></label>
          <Envoyer>Enregistrer</Envoyer>
        </Formulaire>
        <p className="gris" style={{ fontSize: 13, marginBottom: 0 }}>Avec la date et l&apos;heure, Fleet retrouve la location en cours et donc le conducteur. Sans date limite saisie, elle est fixée à 45 jours.</p>
      </details>
      <div className="filtres">
        {[['a_traiter', 'À traiter'], ['designee', 'Désignées'], ['payee', 'Payées']].map(([k, v]) => (
          <a key={k} href={`/amendes?filtre=${k}`} className={filtre === k ? 'actif' : ''}>{v}</a>
        ))}
      </div>
      {(amendes ?? []).map((a: any) => {
        const reste = a.echeance ? Math.ceil((new Date(a.echeance).getTime() - Date.now()) / JOUR) : null;
        const urgent = reste !== null && reste < 3 && !['designee', 'payee'].includes(a.statut);
        return (
          <section key={a.id} className="carte">
            <div className="titre" style={{ marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>{plaque(a.vehicules?.immatriculation)} · {a.type ?? 'Amende'} {a.montant ? `· ${euros(a.montant)}` : ''}</h2>
              <span className="ligne">
                <span className={`pastille ${a.statut}`}>{statutAmende[a.statut]}</span>
                {reste !== null && !['designee', 'payee'].includes(a.statut) && <span className={`badge ${urgent ? 'rouge' : 'gris'}`}>{reste < 0 ? 'Délai dépassé' : `J-${reste}`}</span>}
              </span>
            </div>
            <div className="infos">
              <div><span>Infraction</span><b>{dateHeure(a.date_infraction)}</b></div>
              <div><span>Lieu</span><b>{a.lieu ?? '—'}</b></div>
              <div><span>Conducteur</span><b>{a.clients ? <a className="lien" href={`/clients/${a.clients.id}`}>{a.clients.prenom} {a.clients.nom}</a> : 'Non trouvé'}</b></div>
              <div><span>Location</span><b>{a.locations ? <a className="lien" href={`/locations/${a.locations.id}`}>N° {a.locations.numero}</a> : '—'}</b></div>
              <div><span>À désigner avant le</span><b className={urgent ? 'retard' : ''}>{date(a.echeance)}</b></div>
            </div>
            <div className="ligne" style={{ marginTop: 12 }}>
              <Fichier compact agenceId={profil.agence_id} dossier={`amendes/${a.id}`} nom="avis" libelle="Avis" camera
                lien={liens[a.avis_path]} action={A.avisAmende.bind(null, a.id)} />
              {!a.clients && (
                <Formulaire action={A.clientAmende.bind(null, a.id)} className="ligne">
                  <select name="client_id" style={{ width: 'auto' }}><option value="">Choisir le conducteur…</option>
                    {clients?.map((c: any) => <option key={c.id} value={c.id}>{c.nom} {c.prenom}</option>)}</select>
                  <Envoyer className="bouton petit">Associer</Envoyer>
                </Formulaire>
              )}
              {a.clients && a.statut !== 'designee' && a.statut !== 'payee' && <Formulaire action={A.statutAmende.bind(null, a.id, 'designee')}><Envoyer className="bouton petit principal">Marquer désignée</Envoyer></Formulaire>}
              {a.statut !== 'refusee' && a.statut !== 'payee' && <Formulaire action={A.statutAmende.bind(null, a.id, 'refusee')}><Envoyer className="bouton petit">Refusée</Envoyer></Formulaire>}
              {a.statut !== 'payee' && <Formulaire action={A.statutAmende.bind(null, a.id, 'payee')}><Envoyer className="bouton petit">Payée par l&apos;agence</Envoyer></Formulaire>}
            </div>
            {!a.clients && (() => { const p = plusProche(a); if (!p) return null; const avant = new Date(a.date_infraction) < new Date(p.l.debut); return (
              <div className="suggestion-amende">
                <span>Infraction {avant ? `${ecartTexte(p.ecart)} avant le départ` : `${ecartTexte(p.ecart)} après le retour`} de la location <a className="lien" href={`/locations/${p.l.id}`}>N° {p.l.numero}</a> · <b>{p.l.clients?.prenom} {p.l.clients?.nom}</b>. C&apos;est probablement ce conducteur.</span>
                <Formulaire action={A.clientAmende.bind(null, a.id)}><input type="hidden" name="client_id" value={p.l.client_id} /><Envoyer className="bouton petit principal">Associer</Envoyer></Formulaire>
              </div>); })()}
            {a.clients && !['designee', 'payee'].includes(a.statut) && (
              <details className="fiche-antai">
                <summary>Préparer la désignation ANTAI</summary>
                <p className="gris" style={{ fontSize: 13, margin: '6px 0 10px' }}>Les informations dans l&apos;ordre du formulaire, à copier une par une.</p>
                {([
                  ['N° de l\u2019avis', a.numero_avis], ['Date de l\u2019infraction', dateHeure(a.date_infraction)], ['Immatriculation', plaque(a.vehicules?.immatriculation)],
                  ['Nom', a.clients.nom], ['Prénom', a.clients.prenom], ['Date de naissance', a.clients.date_naissance ? date(a.clients.date_naissance) : null],
                  ['Adresse', a.clients.adresse], ['N° de permis', a.clients.numero_permis], ['Permis délivré le', a.clients.date_permis ? date(a.clients.date_permis) : null],
                ] as [string, string | null][]).map(([lib, val]) => (
                  <div key={lib} className="fichier"><span><span className="gris">{lib}</span><br /><b>{val || <span className="retard">à compléter sur la fiche client</span>}</b></span>{val && <Copier texte={val} libelle="Copier" />}</div>
                ))}
                <div className="ligne" style={{ marginTop: 10 }}><a className="bouton petit principal" href="https://www.antai.gouv.fr/" target="_blank" rel="noreferrer">Ouvrir le site ANTAI</a>
                  <a className="bouton petit" href={`/clients/${a.clients.id}`}>Compléter la fiche client</a></div>
              </details>
            )}
            {a.conducteur_designe && <p className="gris" style={{ fontSize: 13, marginBottom: 0 }}>Désigné : {a.conducteur_designe}</p>}
          </section>
        );
      })}
      {!amendes?.length && <p className="vide carte">Aucune amende dans cette liste.</p>}
      <p className="gris" style={{ fontSize: 13 }}>La désignation se fait sur le site de l&apos;ANTAI. Réception automatique des avis : plus tard, avec un partenaire.</p>
    </Cadre>
  );
}
