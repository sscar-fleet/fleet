import { utilisateurCourant } from '@/lib/agence';
import { debutJour, heure, date, echeance, JOUR } from '@/lib/format';
import Cadre from './_c/Cadre';

export const dynamic = 'force-dynamic';

export default async function Accueil() {
  const { supabase, profil } = await utilisateurCourant();
  const aujourdhui = debutJour(0);
  const demain = debutJour(1);
  const maintenant = new Date().toISOString();

  const [{ data: departs }, { data: retours }, { data: retards }, { data: amendes }, { data: vehicules }, { data: entretiens }] = await Promise.all([
    supabase.from('locations')
      .select('id, numero, debut, caution_statut, caution_montant, vehicules(immatriculation, marque, modele, statut), clients(nom, prenom, permis_path, piece_identite_path, liste_noire), etats_des_lieux(type, statut)')
      .eq('statut', 'reservee').lt('debut', demain).order('debut'),
    supabase.from('locations')
      .select('id, numero, fin_prevue, vehicules(immatriculation, marque, modele), clients(nom, prenom, telephone)')
      .eq('statut', 'en_cours').gte('fin_prevue', aujourdhui).lt('fin_prevue', demain).order('fin_prevue'),
    supabase.from('locations')
      .select('id, numero, fin_prevue, vehicules(immatriculation), clients(nom, prenom, telephone)')
      .eq('statut', 'en_cours').lt('fin_prevue', maintenant).order('fin_prevue'),
    supabase.from('amendes').select('id, echeance, statut').in('statut', ['a_designer', 'infos_manquantes']),
    supabase.from('vehicules').select('id, immatriculation, assurance_echeance, ct_echeance, statut'),
    supabase.from('entretiens').select('id, retour_prevu, vehicules(immatriculation)').eq('statut', 'en_cours').lt('retour_prevu', maintenant),
  ]);

  // Alertes : papiers qui expirent, entretiens qui traînent, départs pas faits
  const alertes: { texte: string; lien: string; niveau: string }[] = [];
  (vehicules ?? []).forEach((v: any) => {
    if (v.statut === 'hors_service') return;
    const a = echeance(v.assurance_echeance); const c = echeance(v.ct_echeance);
    if (a) alertes.push({ texte: `${v.immatriculation} : assurance ${a === 'depasse' ? 'expirée' : 'expire'} le ${date(v.assurance_echeance)}`, lien: `/vehicules/${v.id}`, niveau: a });
    if (c) alertes.push({ texte: `${v.immatriculation} : contrôle technique ${c === 'depasse' ? 'dépassé' : 'à faire'} le ${date(v.ct_echeance)}`, lien: `/vehicules/${v.id}`, niveau: c });
  });
  (entretiens ?? []).forEach((e: any) => alertes.push({ texte: `${e.vehicules?.immatriculation} : retour du garage prévu le ${date(e.retour_prevu)}, toujours en maintenance`, lien: '/entretiens', niveau: 'proche' }));
  (departs ?? []).forEach((l: any) => {
    if (new Date(l.debut).getTime() < Date.now() - 2 * 3600 * 1000)
      alertes.push({ texte: `Contrat ${l.numero} : départ prévu à ${heure(l.debut)} ${new Date(l.debut) < new Date(aujourdhui) ? 'le ' + date(l.debut) : ''} pas encore fait`, lien: `/locations/${l.id}`, niveau: 'proche' });
  });

  const amendesUrgentes = (amendes ?? []).filter((a: any) => a.echeance && new Date(a.echeance).getTime() - Date.now() < 3 * JOUR).length;
  const tuiles = [
    { titre: 'Départs du jour', valeur: departs?.length ?? 0, lien: '/locations?filtre=departs', classe: 'ok' },
    { titre: 'Retours du jour', valeur: retours?.length ?? 0, lien: '/locations?filtre=retours', classe: 'ok' },
    { titre: 'En retard', valeur: retards?.length ?? 0, lien: '/locations?filtre=retard', classe: 'danger' },
    { titre: 'Alertes', valeur: alertes.length, lien: '#alertes', classe: 'alerte' },
    { titre: amendesUrgentes ? `Amendes à désigner (${amendesUrgentes} urgentes)` : 'Amendes à désigner', valeur: amendes?.length ?? 0, lien: '/amendes', classe: amendesUrgentes ? 'danger' : 'alerte' },
  ];

  const nom = (c: any) => [c?.prenom, c?.nom].filter(Boolean).join(' ');
  const voiture = (v: any) => [v?.marque, v?.modele].filter(Boolean).join(' ');

  return (
    <Cadre titre={`Bonjour ${profil.nom.split(' ')[0]}`} tables={['locations', 'vehicules', 'amendes', 'entretiens', 'etats_des_lieux']}
      actions={<a className="bouton principal" href="/locations/nouvelle">+ Nouvelle location</a>}>
      <section className="compteurs">
        {tuiles.map((t) => (
          <a key={t.titre} href={t.lien} className={`compteur ${t.valeur > 0 ? t.classe : ''}`}>
            <span>{t.titre}</span><b>{t.valeur}</b>
          </a>
        ))}
      </section>

      <div className="colonnes">
        <section className="carte">
          <h2>Départs du jour</h2>
          {!departs?.length && <p className="gris">Aucun départ prévu aujourd&apos;hui.</p>}
          {departs?.map((l: any) => {
            const c = l.clients; const v = l.vehicules;
            const voyants = [
              { ok: !!(c?.permis_path && c?.piece_identite_path) && !c?.liste_noire, titre: 'Client vérifié (permis et pièce scannés)' },
              { ok: l.caution_statut === 'prise' || !l.caution_montant, titre: 'Caution prise' },
              { ok: v?.statut === 'disponible', titre: 'Voiture prête' },
              { ok: (l.etats_des_lieux ?? []).some((e: any) => e.type === 'depart'), titre: 'État des lieux commencé' },
            ];
            return (
              <a key={l.id} href={`/locations/${l.id}`} className="fichier">
                <span><b>{heure(l.debut)}</b> · {v?.immatriculation} {voiture(v)}<br /><span className="gris">{nom(c)}{c?.liste_noire ? ' · liste noire' : ''}</span></span>
                <span className="voyants" title={voyants.map((x) => `${x.ok ? '✔' : '✘'} ${x.titre}`).join('\n')}>
                  {voyants.map((x, i) => <i key={i} className={`voyant ${x.ok ? 'on' : ''}`} />)}
                </span>
              </a>
            );
          })}
          {!!departs?.length && <p className="gris" style={{ fontSize: 12.5, marginBottom: 0 }}>Voyants : client vérifié · caution · voiture prête · état des lieux</p>}
        </section>

        <section className="carte">
          <h2>Retours du jour</h2>
          {!retours?.length && !retards?.length && <p className="gris">Aucun retour prévu aujourd&apos;hui.</p>}
          {retards?.map((l: any) => (
            <a key={l.id} href={`/locations/${l.id}`} className="fichier">
              <span><b className="retard">En retard</b> · {l.vehicules?.immatriculation}<br /><span className="gris">{nom(l.clients)} · prévu le {date(l.fin_prevue)} à {heure(l.fin_prevue)}</span></span>
              {l.clients?.telephone && <span className="lien">{l.clients.telephone}</span>}
            </a>
          ))}
          {retours?.map((l: any) => (
            <a key={l.id} href={`/locations/${l.id}`} className="fichier">
              <span><b>{heure(l.fin_prevue)}</b> · {l.vehicules?.immatriculation} {voiture(l.vehicules)}<br /><span className="gris">{nom(l.clients)}</span></span>
              {l.clients?.telephone && <span className="gris">{l.clients.telephone}</span>}
            </a>
          ))}
        </section>

        <section className="carte" id="alertes">
          <h2>Alertes</h2>
          {!alertes.length && <p className="gris">Rien à signaler.</p>}
          {alertes.map((a, i) => (
            <a key={i} href={a.lien} className="fichier"><span className={`pastille ${a.niveau}`}>{a.texte}</span></a>
          ))}
        </section>
      </div>
    </Cadre>
  );
}
