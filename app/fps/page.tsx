import OuvrirFormulaire from '@/app/_c/OuvrirFormulaire';
import { utilisateurCourant, liensFichiers } from '@/lib/agence';
import { donneesAgence } from '@/lib/donnees';
import { lienWhatsApp } from '@/lib/whatsapp';
import { dateHeure, date, euros, JOUR, plaque } from '@/lib/format';
import * as A from '../actions';
import Cadre from '../_c/Cadre';
import Formulaire from '../_c/Formulaire';
import Envoyer from '../_c/Envoyer';
import Scanner from '../_c/Scanner';
import LienAction from '../_c/LienAction';
import { relanceDue, messageRelance, libelleRelance, totalFps } from '@/lib/fps';
import BoutonPdf from '../_c/BoutonPdf';

export const dynamic = 'force-dynamic';

const STATUT: Record<string, [string, string]> = {
  a_refacturer: ['À refacturer', 'a_designer'], client_inconnu: ['Client à trouver', 'infos_manquantes'], refacture: ['Refacturé, en attente', 'reservee'],
  rembourse: ['Remboursé', 'ok'], conteste: ['Contesté par le client', 'en_cours'], abandonne: ['Abandonné', 'annulee'],
};
const FILTRES: [string, string, string[]][] = [
  ['a_traiter', 'À traiter', ['a_refacturer', 'client_inconnu']], ['refacture', 'En attente de paiement', ['refacture']],
  ['termines', 'Terminés', ['rembourse', 'conteste', 'abandonne']], ['tous', 'Tous', Object.keys(STATUT)],
];

// FPS : le loueur règle le forfait (dû par le titulaire de la carte grise), puis le refacture au client qui avait la voiture
export default async function Fps({ searchParams }: { searchParams: { filtre?: string } }) {
  const { supabase, profil } = await utilisateurCourant();
  const filtre = FILTRES.find((f) => f[0] === searchParams.filtre) ?? FILTRES[0];
  const [{ data: liste, error }, { data: tous }, { data: clients }, { data: vehicules }, agence] = await Promise.all([
    supabase.from('fps').select('*, vehicules(id, immatriculation, marque, modele, carte_grise_path), clients(id, nom, prenom, telephone, email, adresse), locations!fps_location_id_fkey(id, numero)')
      .in('statut', filtre[2]).order('limite_paiement', { ascending: true }),
    supabase.from('fps').select('statut, montant, frais_gestion, rembourse_le'),
    supabase.from('clients').select('id, nom, prenom').order('nom'),
    supabase.from('vehicules').select('immatriculation').neq('statut', 'sorti').order('immatriculation'),
    donneesAgence(supabase, profil.agence_id),
  ]);
  const { data: ag } = await supabase.from('agences').select('frais_fps').eq('id', profil.agence_id).single();
  const liens = await liensFichiers(supabase, (liste ?? []).flatMap((f: any) => [f.avis_path, f.vehicules?.carte_grise_path]));

  // Le client n'a pas été trouvé : on propose la location la plus proche dans le temps (48 h)
  const sansClient = (liste ?? []).filter((f: any) => !f.clients && f.vehicule_id);
  const { data: locsProches } = sansClient.length
    ? await supabase.from('locations').select('id, numero, vehicule_id, debut, fin_prevue, fin_reelle, client_id, clients(nom, prenom)')
        .in('vehicule_id', Array.from(new Set(sansClient.map((f: any) => f.vehicule_id)))).neq('statut', 'annulee')
    : { data: [] as any[] };
  const plusProche = (f: any) => {
    const t = new Date(f.date_constat).getTime();
    let best: { l: any; ecart: number } | null = null;
    for (const l of (locsProches ?? []).filter((x: any) => x.vehicule_id === f.vehicule_id && x.client_id)) {
      const d = new Date(l.debut).getTime(), fin = new Date(l.fin_reelle ?? l.fin_prevue).getTime();
      const ecart = t < d ? d - t : t > fin ? t - fin : 0;
      if (!best || ecart < best.ecart) best = { l, ecart };
    }
    return best && best.ecart < 2 * JOUR ? best : null;
  };

  const total = (f: any) => Number(f.montant ?? 0) + Number(f.frais_gestion ?? 0);
  // Clients dont une caution est encore en main : le FPS peut y être retenu
  const idsClients = Array.from(new Set((liste ?? []).map((f: any) => f.client_id).filter(Boolean)));
  const { data: cautions } = idsClients.length
    ? await supabase.from('locations').select('client_id, caution_montant, caution_retenue').in('client_id', idsClients).eq('caution_statut', 'prise')
    : { data: [] as any[] };
  const cautionDispo = (f: any) => (cautions ?? []).some((l: any) => l.client_id === f.client_id && (l.caution_montant == null || Number(l.caution_montant) - Number(l.caution_retenue ?? 0) >= totalFps(f)));
  const aRecuperer = (tous ?? []).filter((f: any) => ['a_refacturer', 'client_inconnu', 'refacture'].includes(f.statut)).reduce((s: number, f: any) => s + total(f), 0);
  const debutMois = new Date(); debutMois.setDate(1); debutMois.setHours(0, 0, 0, 0);
  const recupereMois = (tous ?? []).filter((f: any) => f.statut === 'rembourse' && f.rembourse_le && new Date(f.rembourse_le) >= debutMois);
  const jours = (d?: string | null) => (d ? Math.ceil((new Date(d + 'T23:59:59').getTime() - Date.now()) / JOUR) : null);

  return (
    <Cadre titre="FPS · forfaits post-stationnement" tables={['fps']}
      actions={<OuvrirFormulaire>+ Ajouter un avis de FPS</OuvrirFormulaire>}>
      {error && <div className="alerte-bandeau">Le module FPS est en cours d’activation. Réessayez dans quelques minutes.</div>}
      <details className="formulaire carte formulaire-haut">
        <summary>Nouvel avis de FPS</summary>
        <Formulaire vider action={A.ajouterFps} className="grille" succes="FPS enregistré">
          <Scanner genre="fps" agenceId={profil.agence_id} champChemin="avis_path" libelle="Avis de FPS" />
          <input type="hidden" name="avis_path" />
          <label>Immatriculation *<input name="immatriculation" list="immats-fps" required placeholder="AB123CD" /></label>
          <datalist id="immats-fps">{vehicules?.map((v: any) => <option key={v.immatriculation} value={plaque(v.immatriculation)} />)}</datalist>
          <label>Date et heure du stationnement *<input name="date_constat" type="datetime-local" required /></label>
          <label>Collectivité<input name="collectivite" placeholder="Ville de Paris" /></label>
          <label>Lieu<input name="lieu" /></label>
          <label>Montant du FPS (€)<input name="montant" type="number" step="0.01" inputMode="decimal" /></label>
          <label>Frais de gestion (€)<input name="frais_gestion" type="number" step="0.01" inputMode="decimal" placeholder={String(ag?.frais_fps ?? 0)} /></label>
          <label>N° de l&apos;avis<input name="numero_avis" /></label>
          <label>Date d&apos;envoi de l&apos;avis<input name="date_avis" type="date" /></label>
          <label>Date limite de paiement<input name="limite_paiement" type="date" /></label>
          <Envoyer>Enregistrer</Envoyer>
        </Formulaire>
        <p className="gris" style={{ fontSize: 13, marginBottom: 0 }}>Avec la date et l&apos;heure, Fleet retrouve la location et donc le client à refacturer. Le délai de contestation (un mois après l&apos;envoi de l&apos;avis) se calcule tout seul.</p>
      </details>

      <section className="chiffres">
        <div><span>À récupérer</span><b>{euros(aRecuperer)}</b></div>
        <div><span>Récupéré ce mois</span><b>{euros(recupereMois.reduce((s: number, f: any) => s + total(f), 0))}</b></div>
        <div><span>Dont frais de gestion</span><b>{euros(recupereMois.reduce((s: number, f: any) => s + Number(f.frais_gestion ?? 0), 0))}</b></div>
      </section>

      <div className="filtres">
        {FILTRES.map(([k, t]) => <a key={k} href={`/fps?filtre=${k}`} className={filtre[0] === k ? 'actif' : ''}>{t}</a>)}
      </div>

      {(liste ?? []).map((f: any) => {
        const v = f.vehicules, c = f.clients;
        const jc = jours(f.limite_contestation), jp = jours(f.limite_paiement);
        const urgentPaiement = !f.paye_tresor && jp !== null && jp <= 10;
        const base = { agence, vehicule: { immatriculation: v?.immatriculation ?? '', marque: v?.marque, modele: v?.modele, carte_grise: liens[v?.carte_grise_path] ?? null },
          client: c ? { nom: c.nom, prenom: c.prenom, telephone: c.telephone, email: c.email, adresse: c.adresse } : null,
          fps: { numero_avis: f.numero_avis, collectivite: f.collectivite, date_constat: f.date_constat, lieu: f.lieu, montant: f.montant, frais_gestion: f.frais_gestion,
            date_avis: f.date_avis, limite_contestation: f.limite_contestation, numero_location: f.locations?.numero ?? null } };
        const voiture = [v?.marque, v?.modele].filter(Boolean).join(' ');
        const message = c ? `Bonjour ${c.prenom ?? ''}, un forfait post-stationnement de ${euros(f.montant)} a été émis${f.collectivite ? ' par ' + f.collectivite : ''} pour le stationnement de la ${voiture} (${plaque(v?.immatriculation)}) le ${dateHeure(f.date_constat)}${f.lieu ? ', ' + f.lieu : ''}, pendant votre location. Comme prévu au contrat, il vous est refacturé${Number(f.frais_gestion) > 0 ? ` avec ${euros(f.frais_gestion)} de frais de gestion, soit ${euros(total(f))}` : ''}. Je vous envoie la facture. Si vous souhaitez le contester, je peux vous fournir le mandat pour faire le recours vous-même avant le ${date(f.limite_contestation)}.` : '';
        const p = !c ? plusProche(f) : null;
        return (
          <section key={f.id} className="carte">
            <div className="titre" style={{ marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>{plaque(v?.immatriculation)} · {f.collectivite ?? 'FPS'} · {euros(f.montant)}{Number(f.frais_gestion) > 0 ? <span className="gris" style={{ fontWeight: 400 }}> + {euros(f.frais_gestion)} de frais</span> : null}</h2>
              <span className="ligne">
                <span className={`pastille ${STATUT[f.statut]?.[1] ?? ''}`}>{STATUT[f.statut]?.[0] ?? f.statut}</span>
                <span className={`badge ${f.paye_tresor ? 'gris' : urgentPaiement ? 'rouge' : 'gris'}`}>{f.paye_tresor ? 'Réglé au Trésor' : jp === null ? 'À régler' : jp < 0 ? 'Majoré' : `À régler · J-${jp}`}</span>
              </span>
            </div>
            <div className="infos">
              <div><span>Stationnement</span><b>{dateHeure(f.date_constat)}</b></div>
              <div><span>Lieu</span><b>{f.lieu ?? '—'}</b></div>
              <div><span>Client</span><b>{c ? <a className="lien" href={`/clients/${c.id}`}>{c.prenom} {c.nom}</a> : 'Non trouvé'}</b></div>
              <div><span>Location</span><b>{f.locations ? <a className="lien" href={`/locations/${f.locations.id}`}>N° {f.locations.numero}</a> : '—'}</b></div>
              <div><span>Contestation avant le</span><b className={jc !== null && jc <= 7 && jc >= 0 && ['a_refacturer', 'refacture'].includes(f.statut) ? 'retard' : ''}>{date(f.limite_contestation)}{jc !== null && jc >= 0 ? ` (J-${jc})` : jc !== null ? ' (passé)' : ''}</b></div>
              <div><span>Paiement avant le</span><b className={urgentPaiement ? 'retard' : ''}>{date(f.limite_paiement)}</b></div>
            </div>

            {p && (
              <div className="suggestion-amende">
                <span>Stationnement {new Date(f.date_constat) < new Date(p.l.debut) ? 'juste avant le départ' : 'juste après le retour'} de la location <a className="lien" href={`/locations/${p.l.id}`}>N° {p.l.numero}</a> · <b>{p.l.clients?.prenom} {p.l.clients?.nom}</b>. C&apos;est probablement ce client.</span>
                <Formulaire action={A.clientFps.bind(null, f.id)}><input type="hidden" name="client_id" value={p.l.client_id} /><Envoyer className="bouton petit principal">Associer</Envoyer></Formulaire>
              </div>
            )}

            <div className="ligne" style={{ marginTop: 12, flexWrap: 'wrap' }}>
              {f.avis_path && liens[f.avis_path] && <a className="bouton petit" href={liens[f.avis_path]} target="_blank" rel="noreferrer">Voir l&apos;avis</a>}
              {!c && (
                <Formulaire action={A.clientFps.bind(null, f.id)} className="ligne">
                  <select name="client_id" style={{ width: 'auto' }}><option value="">Choisir le client…</option>
                    {clients?.map((x: any) => <option key={x.id} value={x.id}>{x.nom} {x.prenom}</option>)}</select>
                  <Envoyer className="bouton petit">Associer</Envoyer>
                </Formulaire>
              )}
              {c && <BoutonPdf genre="fps_facture" nom={`refacturation-fps-${plaque(v?.immatriculation)}.pdf`} libelle="Facture PDF" classe="bouton petit" donnees={base} />}
              {c?.telephone && f.statut === 'a_refacturer' && <LienAction href={lienWhatsApp(c.telephone, message)} action={A.statutFps.bind(null, f.id, 'refacture')}>Envoyer par WhatsApp</LienAction>}
              {c?.telephone && f.statut === 'refacture' && <a className="bouton petit" target="_blank" rel="noreferrer" href={lienWhatsApp(c.telephone, message)}>Renvoyer la facture</a>}
              {c?.email && ['a_refacturer', 'refacture'].includes(f.statut) && <a className="bouton petit" href={`mailto:${c.email}?subject=${encodeURIComponent(`Forfait post-stationnement ${plaque(v?.immatriculation)}`)}&body=${encodeURIComponent(message)}`}>Par e-mail</a>}
              {c && f.statut === 'a_refacturer' && <Formulaire action={A.statutFps.bind(null, f.id, 'refacture')} succes="Noté comme refacturé"><Envoyer className="bouton petit principal">Marquer refacturé</Envoyer></Formulaire>}
              {c && f.statut === 'refacture' && <Formulaire action={A.statutFps.bind(null, f.id, 'rembourse')} succes="Remboursement noté"><Envoyer className="bouton petit principal">Le client a payé</Envoyer></Formulaire>}
              {c && ['a_refacturer', 'refacture'].includes(f.statut) && <BoutonPdf genre="fps_mandat" nom={`mandat-rapo-${plaque(v?.immatriculation)}.pdf`} libelle="Mandat de contestation" classe="bouton petit" donnees={base} />}
              {c && ['a_refacturer', 'refacture'].includes(f.statut) && cautionDispo(f) && <Formulaire action={A.retenirCautionFps.bind(null, f.id)} succes="Retenu sur la caution" confirmer={`Retenir ${euros(total(f))} sur la caution de ${c.prenom ?? ''} ${c.nom} ?`}><Envoyer className="bouton petit">Retenir sur la caution</Envoyer></Formulaire>}
              {!f.paye_tresor && f.statut !== 'abandonne' && <LienAction href="https://www.stationnement.gouv.fr" copier={f.numero_avis ?? undefined}>Payer sur stationnement.gouv.fr{f.numero_avis ? ' (n° copié)' : ''}</LienAction>}
              <Formulaire action={A.payeTresorFps.bind(null, f.id, !f.paye_tresor)}><Envoyer className="bouton petit">{f.paye_tresor ? 'Annuler « réglé au Trésor »' : 'J’ai réglé le FPS'}</Envoyer></Formulaire>
            </div>

            {(() => {
              const n = relanceDue(f);
              const histo = [f.refacture_le && `facture envoyée le ${date(f.refacture_le)}`, f.relance1_le && `relance 1 le ${date(f.relance1_le)}`, f.relance2_le && `relance 2 le ${date(f.relance2_le)}`, f.mise_en_demeure_le && `mise en demeure le ${date(f.mise_en_demeure_le)}`].filter(Boolean).join(' · ');
              return <>
                {n && c && (
                  <div className="relance-due">
                    <span><b>{libelleRelance[n]}</b> · {n === 3 ? 'le client n’a pas payé malgré deux relances.' : 'le client n’a pas encore payé.'}</span>
                    <span className="ligne">
                      {n < 3 && c.telephone && <LienAction className="bouton petit principal" href={lienWhatsApp(c.telephone, messageRelance(n as 1 | 2, { prenom: c.prenom, voiture, immat: v?.immatriculation, date_constat: f.date_constat, total: total(f), agence: agence.nom }))} action={A.relancerFps.bind(null, f.id, n)}>Relancer par WhatsApp</LienAction>}
                      {n < 3 && c.email && <LienAction href={`mailto:${c.email}?subject=${encodeURIComponent('Rappel : forfait post-stationnement ' + plaque(v?.immatriculation))}&body=${encodeURIComponent(messageRelance(n as 1 | 2, { prenom: c.prenom, voiture, immat: v?.immatriculation, date_constat: f.date_constat, total: total(f), agence: agence.nom }))}`} action={A.relancerFps.bind(null, f.id, n)}>Par e-mail</LienAction>}
                      {n === 3 && <BoutonPdf genre="fps_demeure" nom={`mise-en-demeure-fps-${plaque(v?.immatriculation)}.pdf`} libelle="Mise en demeure PDF" classe="bouton petit principal" donnees={base} />}
                      {n === 3 && <Formulaire action={A.relancerFps.bind(null, f.id, 3)} succes="Mise en demeure notée"><Envoyer className="bouton petit">Mise en demeure envoyée</Envoyer></Formulaire>}
                    </span>
                  </div>
                )}
                {histo && <p className="gris" style={{ fontSize: 12.5, margin: '8px 0 0' }}>Suivi : {histo}.</p>}
              </>;
            })()}
            <details className="options" style={{ marginTop: 8 }}>
              <summary>+ Plus (frais, contestation, abandon)</summary>
              <div className="ligne" style={{ flexWrap: 'wrap', marginTop: 8 }}>
                <Formulaire action={A.fraisFps.bind(null, f.id)} className="ligne">
                  <input name="frais_gestion" type="number" step="0.01" defaultValue={f.frais_gestion ?? 0} style={{ width: 110 }} aria-label="Frais de gestion" />
                  <Envoyer className="bouton petit">Changer les frais</Envoyer>
                </Formulaire>
                {f.statut !== 'conteste' && <Formulaire action={A.statutFps.bind(null, f.id, 'conteste')}><Envoyer className="bouton petit">Le client conteste</Envoyer></Formulaire>}
                {f.statut !== 'abandonne' && <Formulaire action={A.statutFps.bind(null, f.id, 'abandonne')} confirmer="Abandonner la refacturation de ce FPS ?"><Envoyer className="bouton petit">Abandonner</Envoyer></Formulaire>}
                {['conteste', 'abandonne', 'rembourse'].includes(f.statut) && <Formulaire action={A.statutFps.bind(null, f.id, c ? 'a_refacturer' : 'client_inconnu')}><Envoyer className="bouton petit">Remettre à traiter</Envoyer></Formulaire>}
              </div>
            </details>
          </section>
        );
      })}
      {!error && !liste?.length && (
        <div className="carte vide-guide"><b>{filtre[0] === 'a_traiter' ? 'Aucun FPS à traiter' : 'Rien dans cette liste'}</b>
          Un avis de FPS arrive ? Prenez-le en photo ou déposez le PDF : Fleet retrouve le client, prépare la facture et le message.</div>
      )}
      <p className="gris" style={{ fontSize: 13 }}>Le FPS est dû par le titulaire de la carte grise : réglez-le avant la date limite pour éviter la majoration, puis refacturez-le. Pensez à prévoir la refacturation des FPS et des frais de gestion dans vos conditions de location.</p>
    </Cadre>
  );
}
