import ScanOrdinateur from '@/app/_c/ScanOrdinateur';
import PapiersClient, { cheminsPapiers } from '@/app/_c/PapiersClient';
import { notFound } from 'next/navigation';
import { utilisateurCourant, liensFichiers } from '@/lib/agence';
import { statutLocation, statutAmende, date, dateHeure, euros } from '@/lib/format';
import * as A from '../../actions';
import Cadre from '../../_c/Cadre';
import Formulaire from '../../_c/Formulaire';
import Envoyer from '../../_c/Envoyer';
import Fichier from '../../_c/Fichier';
import ChampsClient from '../../_c/ChampsClient';
import Onglets from '../../_c/Onglets';

export const dynamic = 'force-dynamic';

export default async function FicheClient({ params }: { params: { id: string } }) {
  const { supabase, profil } = await utilisateurCourant();
  const { data: c } = await supabase.from('clients').select('*').eq('id', params.id).maybeSingle();
  if (!c) notFound();
  const [{ data: locations }, { data: amendes }] = await Promise.all([
    supabase.from('locations').select('id, numero, debut, fin_prevue, fin_reelle, statut, prix_total, caution_statut, vehicules(immatriculation, marque, modele)')
      .eq('client_id', c.id).order('debut', { ascending: false }),
    supabase.from('amendes').select('id, date_infraction, type, montant, statut, vehicules(immatriculation)').eq('client_id', c.id).order('date_infraction', { ascending: false }),
  ]);
  const liens = await liensFichiers(supabase, cheminsPapiers(c));
  const utiles = (locations ?? []).filter((l: any) => l.statut !== 'annulee');
  const total = utiles.reduce((s: number, l: any) => s + Number(l.prix_total ?? 0), 0);
  const ancienPermis = c.date_permis ? (Date.now() - new Date(c.date_permis).getTime()) / (365.25 * 24 * 3600 * 1000) : null;

  return (
    <Cadre retour={{ lien: '/clients', texte: 'Clients' }} tables={['clients', 'locations']}
      titre={<>{c.nom} {c.prenom} {utiles.length > 0 && <span className="badge gris">{utiles.length} location{utiles.length > 1 ? 's' : ''}</span>}</>}
      actions={<>
        {c.liste_noire && <span className="pastille depasse">Liste noire</span>}
        <a className="bouton principal" href={`/locations/nouvelle?client=${c.id}`}>+ Louer</a>
      </>}>
      {c.liste_noire && <div className="alerte-bandeau">Client en liste noire (conduite à risque ou incident). {c.note}</div>}
      <Onglets panneaux={[
        { cle: 'resume', titre: 'Résumé', contenu: <>
      <section className="chiffres">
        <div><span>Locations</span><b>{utiles.length}</b></div>
        <div><span>Total dépensé</span><b>{euros(total)}</b></div>
        <div><span>Ancienneté du permis</span><b>{ancienPermis === null ? '—' : `${Math.floor(ancienPermis)} an${ancienPermis >= 2 ? 's' : ''}`}</b></div>
        <div><span>Amendes</span><b>{amendes?.length ?? 0}</b></div>
      </section>
        <section className="carte">
          <h2>Coordonnées</h2>
          <Formulaire action={A.majClient.bind(null, c.id)} className="grille">
            <ChampsClient c={c} />
            <label className="pleine">Note interne<input name="note" defaultValue={c.note ?? ''} placeholder="Ex. motif de la liste noire" /></label>
            <Envoyer className="bouton">Enregistrer</Envoyer>
          </Formulaire>
          <div className="ligne" style={{ marginTop: 12 }}>
            {c.telephone && <a className="bouton petit" href={`tel:${c.telephone}`}>Appeler</a>}
            {c.telephone && <a className="bouton petit" href={`https://wa.me/${c.telephone.replace(/\D/g, '').replace(/^0/, '33')}`} target="_blank" rel="noreferrer">WhatsApp</a>}
            {c.email && <a className="bouton petit" href={`mailto:${c.email}`}>E-mail</a>}
          </div>
        </section>
        </> },
        { cle: 'papiers', titre: 'Papiers', contenu: <>
        <section className="carte">
          <h2>Papiers</h2>
          <ScanOrdinateur clientId={c.id} />
          <PapiersClient c={c} agenceId={profil.agence_id} liens={liens} />
          <p className="gris" style={{ fontSize: 13 }}>Sur le téléphone, « Photo » ouvre directement l&apos;appareil photo.</p>
          <Formulaire action={A.listeNoire.bind(null, c.id, !c.liste_noire)} style={{ marginTop: 10 }} succes={c.liste_noire ? 'Retiré de la liste noire' : 'Ajouté à la liste noire'} confirmer={c.liste_noire ? undefined : 'Mettre ce client en liste noire ?'}>
            <Envoyer className={`bouton petit ${c.liste_noire ? '' : 'danger'}`}>{c.liste_noire ? 'Retirer de la liste noire' : 'Mettre en liste noire'}</Envoyer>
          </Formulaire>
        </section>
        </> },
        { cle: 'locations', titre: `Locations (${locations?.length ?? 0})`, contenu: <>
        <section className="carte">
          <h2>Historique des locations</h2>
          {!locations?.length && <p className="gris">Aucune location.</p>}
          {locations?.map((l: any) => (
            <a key={l.id} href={`/locations/${l.id}`} className="fichier">
              <span>N° {l.numero} · {l.vehicules?.immatriculation} {[l.vehicules?.marque, l.vehicules?.modele].filter(Boolean).join(' ')}
                <br /><span className="gris">{date(l.debut)} → {date(l.fin_reelle ?? l.fin_prevue)} · {euros(l.prix_total)}</span></span>
              <span className={`pastille ${l.statut}`}>{statutLocation[l.statut]}</span>
            </a>
          ))}
        </section>
        </> },
        { cle: 'amendes', titre: 'Amendes', badge: (amendes ?? []).filter((a: any) => ['a_designer', 'infos_manquantes'].includes(a.statut)).length, contenu: <>
        <section className="carte">
          <h2>Amendes</h2>
          {!amendes?.length && <p className="gris">Aucune amende.</p>}
          {amendes?.map((a: any) => (
            <a key={a.id} href="/amendes" className="fichier">
              <span>{a.vehicules?.immatriculation} · {a.type ?? 'Amende'} · {euros(a.montant)}<br /><span className="gris">{dateHeure(a.date_infraction)}</span></span>
              <span className={`pastille ${a.statut}`}>{statutAmende[a.statut]}</span>
            </a>
          ))}
        </section>
        </> },
      ]} />
    </Cadre>
  );
}
