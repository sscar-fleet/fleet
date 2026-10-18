import { utilisateurCourant, liensFichiers } from '@/lib/agence';
import { statutAmende, dateHeure, date, euros, JOUR } from '@/lib/format';
import * as A from '../actions';
import Cadre from '../_c/Cadre';
import Formulaire from '../_c/Formulaire';
import Envoyer from '../_c/Envoyer';
import Fichier from '../_c/Fichier';

export const dynamic = 'force-dynamic';

export default async function Amendes({ searchParams }: { searchParams: { filtre?: string } }) {
  const { supabase, profil } = await utilisateurCourant();
  const filtre = searchParams.filtre ?? 'a_traiter';
  let q = supabase.from('amendes').select('*, vehicules(immatriculation), clients(id, nom, prenom, telephone), locations(id, numero)');
  q = filtre === 'a_traiter' ? q.in('statut', ['a_designer', 'infos_manquantes', 'refusee']).order('echeance') : q.eq('statut', filtre).order('date_infraction', { ascending: false });
  const [{ data: amendes }, { data: clients }, { data: vehicules }] = await Promise.all([
    q, supabase.from('clients').select('id, nom, prenom').order('nom'), supabase.from('vehicules').select('immatriculation').order('immatriculation'),
  ]);
  const liens = await liensFichiers(supabase, (amendes ?? []).map((a: any) => a.avis_path));

  return (
    <Cadre titre="Amendes" tables={['amendes']} actions={<a className="bouton" href="/export/amendes">Exporter</a>}>
      <details className="formulaire carte">
        <summary className="bouton principal">+ Saisir un avis de contravention</summary>
        <Formulaire vider action={A.ajouterAmende} className="grille">
          <label>Immatriculation *<input name="immatriculation" list="immats" required placeholder="AB123CD" /></label>
          <datalist id="immats">{vehicules?.map((v: any) => <option key={v.immatriculation} value={v.immatriculation} />)}</datalist>
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
              <h2 style={{ margin: 0 }}>{a.vehicules?.immatriculation} · {a.type ?? 'Amende'} {a.montant ? `· ${euros(a.montant)}` : ''}</h2>
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
            {a.conducteur_designe && <p className="gris" style={{ fontSize: 13, marginBottom: 0 }}>Désigné : {a.conducteur_designe}</p>}
          </section>
        );
      })}
      {!amendes?.length && <p className="vide carte">Aucune amende dans cette liste.</p>}
      <p className="gris" style={{ fontSize: 13 }}>La désignation se fait sur le site de l&apos;ANTAI. Réception automatique des avis : plus tard, avec un partenaire.</p>
    </Cadre>
  );
}
