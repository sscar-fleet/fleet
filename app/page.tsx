import { papiersComplets } from '@/app/_c/PapiersClient';
import { utilisateurCourant } from '@/lib/agence';
import { debutJour, heure, date, echeance, JOUR, plaque } from '@/lib/format';
import Cadre from './_c/Cadre';
import SuiviFlotte, { type LigneSuivi } from './_c/SuiviFlotte';
import { suiviAgence, kmEstime } from '@/lib/telematique';
import GrillePlanning, { chargerPlanning } from './_c/GrillePlanning';
import { calculerPilotage } from '@/lib/pilotage';
import { versJour, euros } from '@/lib/format';
import { lienWhatsApp, messageDepart, messageRetour, messageRetard } from '@/lib/whatsapp';
import { relanceDue, aPayerBientot, messageRelance, libelleRelance, totalFps } from '@/lib/fps';
import LienAction from './_c/LienAction';
import * as A from './actions';

export const dynamic = 'force-dynamic';

export default async function Accueil() {
  const { supabase, profil } = await utilisateurCourant();
  const aujourdhui = debutJour(0);
  const demain = debutJour(1);
  const maintenant = new Date().toISOString();

  const [{ data: departs }, { data: retours }, { data: retards }, { data: amendes }, { data: vehicules }, { data: entretiens }] = await Promise.all([
    supabase.from('locations')
      .select('id, numero, debut, caution_statut, caution_montant, vehicules(immatriculation, marque, modele, statut), clients(nom, prenom, telephone, permis_path, permis_verso_path, piece_identite_path, piece_identite_verso_path, justificatif_domicile_path, liste_noire), etats_des_lieux(type, statut)')
      .eq('statut', 'reservee').lt('debut', demain).order('debut'),
    supabase.from('locations')
      .select('id, numero, fin_prevue, vehicules(immatriculation, marque, modele), clients(nom, prenom, telephone)')
      .eq('statut', 'en_cours').gte('fin_prevue', aujourdhui).lt('fin_prevue', demain).order('fin_prevue'),
    supabase.from('locations')
      .select('id, numero, fin_prevue, vehicules(immatriculation, marque, modele), clients(nom, prenom, telephone)')
      .eq('statut', 'en_cours').lt('fin_prevue', maintenant).order('fin_prevue'),
    supabase.from('amendes').select('id, echeance, statut').in('statut', ['a_designer', 'infos_manquantes']),
    supabase.from('vehicules').select('id, immatriculation, assurance_echeance, ct_echeance, statut'),
    supabase.from('entretiens').select('id, retour_prevu, vehicules(immatriculation)').eq('statut', 'en_cours').lt('retour_prevu', maintenant),
  ]);

  const planning = await chargerPlanning(supabase, versJour(new Date()), 7);
  // Flotte en direct (mini carte) : seulement si le suivi GPS est actif pour l'agence
  const suivi = await suiviAgence(supabase);
  let lignesGps: LigneSuivi[] = [];
  if (suivi.actif) {
    const [{ data: vt }, { data: enCours }] = await Promise.all([
      supabase.from('vehicules').select('id, immatriculation, marque, modele, statut, km, traceurs(*)').neq('statut', 'sorti').not('traceur_id', 'is', null),
      supabase.from('locations').select('id, vehicule_id, fin_prevue, clients(nom, prenom)').eq('statut', 'en_cours'),
    ]);
    lignesGps = (vt ?? []).map((v: any): LigneSuivi => {
      const t = v.traceurs; const e = t ? suivi.etats.get(String(t.imei)) : undefined;
      const loc = (enCours ?? []).find((l: any) => l.vehicule_id === v.id) as any;
      return { id: v.id, immat: plaque(v.immatriculation), marque: v.marque, modele: v.modele, statut: v.statut,
        etat: !e ? 'hors_ligne' : t.moteur_coupe ? 'coupe' : !e.enLigne ? 'hors_ligne' : e.enMouvement ? 'roule' : 'arret',
        vitesse: e?.vitesse ?? 0, contact: e?.contact ?? null, lat: e?.lat ?? null, lng: e?.lng ?? null, le: e?.le ?? null, km: kmEstime(t, e) ?? v.km,
        client: loc ? [loc.clients?.prenom, loc.clients?.nom].filter(Boolean).join(' ') : null, retour: loc?.fin_prevue ?? null, location_id: loc?.id ?? null };
    });
  }
  // Guide de démarrage pour un nouveau loueur
  const [{ data: ag }, { count: nbClients }, { count: nbLocations }] = await Promise.all([
    supabase.from('agences').select('adresse, gerant_nom, signature_path').eq('id', profil.agence_id).single(),
    supabase.from('clients').select('id', { count: 'exact', head: true }),
    supabase.from('locations').select('id', { count: 'exact', head: true }),
  ]);
  const etapesDemarrage = [
    { fait: !!(ag?.adresse && ag?.gerant_nom && ag?.signature_path), titre: 'Renseigner l\u2019agence (adresse, gérant, signature)', lien: '/parametres', bouton: 'Réglages' },
    { fait: (vehicules ?? []).length > 0, titre: 'Ajouter un premier véhicule', lien: '/vehicules', bouton: 'Ajouter' },
    { fait: (nbClients ?? 0) > 0, titre: 'Créer un premier client', lien: '/clients', bouton: 'Ajouter' },
    { fait: (nbLocations ?? 0) > 0, titre: 'Faire une première location', lien: '/locations/nouvelle', bouton: 'Commencer' },
  ];
  const demarrageFini = etapesDemarrage.every((e) => e.fait);
  // FPS à suivre : à régler avant la majoration, ou client à relancer
  const { data: fpsOuverts } = await supabase.from('fps').select('id, statut, montant, frais_gestion, date_constat, limite_paiement, paye_tresor, refacture_le, relance1_le, relance2_le, mise_en_demeure_le, vehicules(immatriculation, marque, modele), clients(prenom, nom, telephone)')
    .in('statut', ['a_refacturer', 'client_inconnu', 'refacture', 'conteste']);
  const fpsAPayer = (fpsOuverts ?? []).filter((f: any) => aPayerBientot(f));
  const fpsARelancer = (fpsOuverts ?? []).filter((f: any) => relanceDue(f) && f.clients);
  const pilotage = await calculerPilotage(supabase, 'mois');
  const mois = pilotage.periodes[pilotage.periodes.length - 1];
  const moisPrec = pilotage.periodes[pilotage.periodes.length - 2];
  const caMois = mois.recettes;
  const flotte = ['loue', 'disponible', 'maintenance', 'hors_service'].map((k) => ({ k, n: (vehicules ?? []).filter((v: any) => v.statut === k).length }));
  const totalFlotte = (vehicules ?? []).filter((v: any) => v.statut !== 'sorti').length;
  const libFlotte: Record<string, string> = { loue: 'Loués', disponible: 'Disponibles', maintenance: 'En maintenance', hors_service: 'Hors service' };
  const couleur: Record<string, string> = { loue: 'var(--turquoise)', disponible: 'var(--vert)', maintenance: 'var(--orange)', hors_service: 'var(--rouge)' };

  // Alertes : papiers qui expirent, entretiens qui traînent, départs pas faits
  const alertes: { texte: string; lien: string; niveau: string }[] = [];
  (vehicules ?? []).forEach((v: any) => {
    if (v.statut === 'hors_service' || v.statut === 'sorti') return;
    const a = echeance(v.assurance_echeance); const c = echeance(v.ct_echeance);
    if (a) alertes.push({ texte: `${plaque(v.immatriculation)} : assurance ${a === 'depasse' ? 'expirée' : 'expire'} le ${date(v.assurance_echeance)}`, lien: `/vehicules/${v.id}`, niveau: a });
    if (c) alertes.push({ texte: `${plaque(v.immatriculation)} : contrôle technique ${c === 'depasse' ? 'dépassé' : 'à faire'} le ${date(v.ct_echeance)}`, lien: `/vehicules/${v.id}`, niveau: c });
  });
  (entretiens ?? []).forEach((e: any) => alertes.push({ texte: `${plaque(e.vehicules?.immatriculation)} : retour du garage prévu le ${date(e.retour_prevu)}, toujours en maintenance`, lien: e.id ? `/entretiens/${e.id}` : '/entretiens', niveau: 'proche' }));
  // Prêts entre loueurs : véhicule emprunté à rendre sous 2 jours, véhicule prêté pas revenu
  const [{ data: emprunts }, { data: pretsRetard }] = await Promise.all([
    supabase.from('vehicules').select('*').eq('financement', 'pret').neq('statut', 'sorti'),
    supabase.from('entretiens').select('id, garage, retour_prevu, vehicules(immatriculation)').eq('type', 'transfert').eq('statut', 'en_cours').lt('retour_prevu', new Date().toISOString()),
  ]);
  (emprunts ?? []).filter((v: any) => v.pret_retour && new Date(v.pret_retour).getTime() - Date.now() < 2 * 864e5)
    .forEach((v: any) => alertes.push({ texte: `${plaque(v.immatriculation)} : à rendre à ${v.pret_par ?? 'son propriétaire'} le ${date(v.pret_retour)}`, lien: '/prets', niveau: new Date(v.pret_retour).getTime() < Date.now() ? 'depasse' : 'proche' }));
  (pretsRetard ?? []).forEach((e: any) => alertes.push({ texte: `${plaque(e.vehicules?.immatriculation)} : prêté à ${e.garage ?? 'un confrère'}, devait revenir le ${date(e.retour_prevu)}`, lien: '/prets', niveau: 'depasse' }));
  // Kbis de plus de 3 mois (date lue par l'IA au dépôt)
  const { data: agK } = await supabase.from("agences").select("*").eq("id", profil.agence_id).single();
  if ((agK as any)?.kbis_date && Date.now() - new Date((agK as any).kbis_date).getTime() > 92 * 864e5)
    alertes.push({ texte: `Extrait Kbis de plus de 3 mois (du ${date((agK as any).kbis_date)}) : à renouveler`, lien: '/parametres', niveau: 'depasse' });
  (departs ?? []).forEach((l: any) => {
    if (new Date(l.debut).getTime() < Date.now() - 2 * 3600 * 1000)
      alertes.push({ texte: `Contrat ${l.numero} : départ prévu à ${heure(l.debut)} ${new Date(l.debut) < new Date(aujourdhui) ? 'le ' + date(l.debut) : ''} pas encore fait`, lien: `/locations/${l.id}`, niveau: 'proche' });
  });

  const amendesUrgentes = (amendes ?? []).filter((a: any) => a.echeance && new Date(a.echeance).getTime() - Date.now() < 3 * JOUR).length;
  const occupation = totalFlotte ? Math.round((flotte[0].n / totalFlotte) * 100) : 0;
  const tuiles: { titre: string; valeur: string | number; detail?: string; lien: string; classe: string; actif: boolean }[] = [
    { titre: 'Départs du jour', valeur: departs?.length ?? 0, lien: '/locations?filtre=departs', classe: 'ok', actif: (departs?.length ?? 0) > 0 },
    { titre: 'Retours du jour', valeur: retours?.length ?? 0, lien: '/locations?filtre=retours', classe: 'ok', actif: (retours?.length ?? 0) > 0 },
    { titre: 'En retard', valeur: retards?.length ?? 0, lien: '/locations?filtre=retard', classe: 'danger', actif: (retards?.length ?? 0) > 0 },
    { titre: 'Loués aujourd\u2019hui', valeur: `${flotte[0].n}/${totalFlotte}`, detail: `${occupation} % de la flotte`, lien: '/vehicules', classe: 'info', actif: true },
    ...(profil.role === 'gerant' ? [{ titre: 'Encaissé ce mois', valeur: euros(caMois), detail: moisPrec && moisPrec.recettes > 0 ? `${caMois >= moisPrec.recettes ? '▲' : '▼'} vs ${euros(moisPrec.recettes)} le mois dernier` : 'depuis le 1er du mois', lien: '/pilotage', classe: 'info', actif: true }] : []),
    { titre: 'Amendes', valeur: amendes?.length ?? 0, detail: amendesUrgentes ? `${amendesUrgentes} urgente${amendesUrgentes > 1 ? 's' : ''}` : 'à désigner', lien: '/amendes', classe: amendesUrgentes ? 'danger' : 'alerte', actif: (amendes?.length ?? 0) > 0 },
    { titre: 'Alertes', valeur: alertes.length, detail: 'papiers, garage', lien: '#alertes', classe: 'alerte', actif: alertes.length > 0 },
  ];

  const nom = (c: any) => [c?.prenom, c?.nom].filter(Boolean).join(' ');
  const voiture = (v: any) => [v?.marque, v?.modele].filter(Boolean).join(' ');

  // Une seule liste « Aujourd'hui », dans l'ordre de l'heure : retards d'abord, puis départs et retours
  type Ligne = { id: string; genre: 'retard' | 'depart' | 'retour'; quand: string; v: any; c: any; voyants?: { ok: boolean; titre: string }[]; wa?: string };
  const lignes: Ligne[] = [
    ...(retards ?? []).map((l: any) => ({ id: l.id, genre: 'retard' as const, quand: l.fin_prevue, v: l.vehicules, c: l.clients,
      wa: l.clients?.telephone ? lienWhatsApp(l.clients.telephone, messageRetard(l.clients.prenom, voiture(l.vehicules) || l.vehicules?.immatriculation, l.fin_prevue)) : undefined })),
    ...[
      ...(departs ?? []).map((l: any) => ({ id: l.id, genre: 'depart' as const, quand: l.debut, v: l.vehicules, c: l.clients,
        voyants: [
          { ok: papiersComplets(l.clients) && !l.clients?.liste_noire, titre: 'Client vérifié' },
          { ok: l.caution_statut === 'prise' || !l.caution_montant, titre: 'Caution prise' },
          { ok: l.vehicules?.statut === 'disponible', titre: 'Voiture prête' },
          { ok: (l.etats_des_lieux ?? []).some((e: any) => e.type === 'depart'), titre: 'État des lieux commencé' },
        ],
        wa: l.clients?.telephone ? lienWhatsApp(l.clients.telephone, messageDepart(l.clients.prenom, voiture(l.vehicules) || l.vehicules?.immatriculation, l.debut, profil.agences?.nom ?? '')) : undefined })),
      ...(retours ?? []).map((l: any) => ({ id: l.id, genre: 'retour' as const, quand: l.fin_prevue, v: l.vehicules, c: l.clients,
        wa: l.clients?.telephone ? lienWhatsApp(l.clients.telephone, messageRetour(l.clients.prenom, voiture(l.vehicules) || l.vehicules?.immatriculation, l.fin_prevue)) : undefined })),
    ].sort((a, b) => a.quand.localeCompare(b.quand)),
  ];
  const etiquette = { retard: 'Retard', depart: 'Départ', retour: 'Retour' };
  const jourTexte = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Cadre titre={<>Bonjour {profil.nom.split(' ')[0]} <span className="gris" style={{ fontWeight: 400, fontSize: 16 }}>· {jourTexte}</span></>}
      tables={['locations', 'vehicules', 'amendes', 'entretiens', 'etats_des_lieux']}
>
      {profil.role === 'gerant' && !demarrageFini && (
        <section className="carte demarrage">
          <h2>Pour bien démarrer ({etapesDemarrage.filter((e) => e.fait).length}/4)</h2>
          <ol>{etapesDemarrage.map((e) => (
            <li key={e.titre} className={e.fait ? 'fait' : ''}>
              <span style={{ display: 'flex', alignItems: 'center' }}><span className="coche">{e.fait ? '✓' : ''}</span>{e.titre}</span>
              {!e.fait && <a className="bouton petit principal" href={e.lien}>{e.bouton}</a>}
            </li>
          ))}</ol>
        </section>
      )}
      <section className="kpis">
        {tuiles.map((t) => (
          <a key={t.titre} href={t.lien} className={`kpi ${t.actif ? t.classe : ''}`}>
            <span className="lib">{t.titre}</span><b>{t.valeur}</b>{t.detail ? <span className="det">{t.detail}</span> : null}
          </a>
        ))}
      </section>

      {lignesGps.length > 0 && (
        <section className="carte gps-accueil">
          <div className="titre" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>Flotte en direct</h2>
            <a className="bouton petit" href="/carte">Ouvrir le suivi GPS</a>
          </div>
          <SuiviFlotte lignes={lignesGps} demo={suivi.actif && suivi.demo} compact />
        </section>
      )}

      <section className="carte">
        <div className="titre" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Planning de la semaine</h2>
          <a className="bouton petit" href="/planning">Ouvrir le planning</a>
        </div>
        <GrillePlanning p={planning} compact />
      </section>

      <div className="accueil-bas">
        <section className="carte">
          <h2>Aujourd&apos;hui</h2>
          {!lignes.length && <p className="gris" style={{ marginBottom: 0 }}>Aucun départ ni retour prévu. Journée calme.</p>}
          {lignes.map((x) => (
            <div key={x.genre + x.id} className="fichier">
              <a href={`/locations/${x.id}`} className="jour">
                <span className={`etiquette ${x.genre}`}>{etiquette[x.genre]}</span>
                <span><b>{x.genre === 'retard' ? date(x.quand) + ' ' : ''}{heure(x.quand)}</b> · {plaque(x.v?.immatriculation)} {voiture(x.v)}<br />
                  <span className="gris">{nom(x.c)}{x.c?.liste_noire ? ' · liste noire' : ''}</span></span>
              </a>
              <span className="ligne">
                {x.voyants && <span className="voyants" title={x.voyants.map((y) => `${y.ok ? '✔' : '✘'} ${y.titre}`).join('\n')}>
                  {x.voyants.map((y, i) => <i key={i} className={`voyant ${y.ok ? 'on' : ''}`} />)}</span>}
                {x.wa && <a className="bouton petit" target="_blank" rel="noreferrer" href={x.wa}>WhatsApp</a>}
              </span>
            </div>
          ))}
          {lignes.some((x) => x.voyants) && <p className="gris" style={{ fontSize: 12.5, marginBottom: 0 }}>Voyants d&apos;un départ : client vérifié · caution · voiture prête · état des lieux</p>}
        </section>

        <div className="pile">
          {(fpsAPayer.length > 0 || fpsARelancer.length > 0) && (
            <section className="carte">
              <div className="titre" style={{ marginBottom: 10 }}>
                <h2 style={{ margin: 0 }}>FPS à suivre</h2>
                <a className="bouton petit" href="/fps">Tout voir</a>
              </div>
              {fpsAPayer.map((f: any) => (
                <a key={'p' + f.id} href="/fps" className="fichier">
                  <span><b>À régler avant le {date(f.limite_paiement)}</b> · {plaque(f.vehicules?.immatriculation)} · {euros(f.montant)}<br /><span className="gris">Sinon majoration de 20 % (50 € minimum)</span></span>
                  <span className={`pastille ${new Date(f.limite_paiement) < new Date() ? 'depasse' : 'proche'}`}>{new Date(f.limite_paiement) < new Date() ? 'Majoré' : 'Bientôt'}</span>
                </a>
              ))}
              {fpsARelancer.map((f: any) => {
                const n = relanceDue(f)!;
                const c = f.clients;
                return (
                  <div key={'r' + f.id} className="fichier">
                    <span><b>{libelleRelance[n]}</b> · {c.prenom} {c.nom}<br /><span className="gris">{euros(totalFps(f))} · FPS du {date(f.date_constat)} · {plaque(f.vehicules?.immatriculation)}</span></span>
                    {n < 3 && c.telephone
                      ? <LienAction className="bouton petit principal" href={lienWhatsApp(c.telephone, messageRelance(n as 1 | 2, { prenom: c.prenom, voiture: voiture(f.vehicules), immat: f.vehicules?.immatriculation, date_constat: f.date_constat, total: totalFps(f), agence: profil.agences?.nom ?? '' }))} action={A.relancerFps.bind(null, f.id, n)}>Relancer</LienAction>
                      : <a className="bouton petit" href="/fps">Ouvrir</a>}
                  </div>
                );
              })}
            </section>
          )}
          <section className="carte">
            <div className="titre" style={{ marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>Ma flotte</h2>
              <span className="gris">{totalFlotte} véhicule{totalFlotte > 1 ? 's' : ''} · {totalFlotte ? Math.round((flotte[0].n / totalFlotte) * 100) : 0} % loués</span>
            </div>
            <div className="barre-flotte">
              {flotte.filter((f) => f.n > 0).map((f) => (
                <a key={f.k} href={`/vehicules?statut=${f.k}`} style={{ flex: f.n, background: couleur[f.k] }} title={`${libFlotte[f.k]} : ${f.n}`} />
              ))}
              {!totalFlotte && <span style={{ flex: 1, background: 'var(--bord)' }} />}
            </div>
            <div className="legende">
              {flotte.filter((f) => f.n > 0 || f.k !== 'hors_service').map((f) => (
                <a key={f.k} href={`/vehicules?statut=${f.k}`}><i style={{ background: couleur[f.k] }} />{libFlotte[f.k]} <b>{f.n}</b></a>
              ))}
            </div>
          </section>

          {profil.role === 'gerant' && (
            <a href="/pilotage" className="carte mois">
              <div className="titre" style={{ marginBottom: 10 }}>
                <h2 style={{ margin: 0 }}>{mois.debut.toLocaleDateString('fr-FR', { month: 'long', timeZone: 'Europe/Paris' }).replace(/^./, (c) => c.toUpperCase())}</h2>
                <span className="lien" style={{ fontSize: 13.5 }}>Pilotage →</span>
              </div>
              <div className="trois">
                <div><span>Encaissé</span><b>{euros(mois.recettes)}</b></div>
                <div><span>Dépensé</span><b>{euros(mois.couts)}</b></div>
                <div><span>Bénéfice</span><b style={{ color: mois.resultat >= 0 ? 'var(--vert)' : 'var(--rouge)' }}>{mois.resultat >= 0 ? '+' : ''}{euros(mois.resultat)}</b></div>
              </div>
              <p className="gris" style={{ fontSize: 12.5, margin: '8px 0 0' }}>Mois dernier : {moisPrec.resultat >= 0 ? '+' : ''}{euros(moisPrec.resultat)}</p>
            </a>
          )}

          <section className="carte" id="alertes">
            <h2>Alertes {alertes.length > 0 && <span className="badge rouge">{alertes.length}</span>}</h2>
            {!alertes.length && <p className="gris" style={{ marginBottom: 0 }}>Rien à signaler.</p>}
            {alertes.map((a, i) => (
              <a key={i} href={a.lien} className="fichier"><span className={`pastille ${a.niveau}`}>{a.texte}</span></a>
            ))}
          </section>
        </div>
      </div>
    </Cadre>
  );
}
