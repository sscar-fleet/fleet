import { notFound } from 'next/navigation';
import { utilisateurCourant, liensFichiers } from '@/lib/agence';
import { dateHeure, date, euros, plaque, versJour } from '@/lib/format';
import { TYPES_SINISTRE, STATUT_SINISTRE, ETAPES_SINISTRE, FINIS, RESPONSABILITES } from '@/lib/sinistres';
import { nomChauffeur } from '@/lib/transport';
import * as S from '../actions';
import Cadre from '../../_c/Cadre';
import Formulaire from '../../_c/Formulaire';
import Envoyer from '../../_c/Envoyer';
import Fichier from '../../_c/Fichier';

export const dynamic = 'force-dynamic';
const GENRES: Record<string, string> = { note: 'Note', appel: 'Appel', relance: 'Relance', courrier: 'Courrier / document', statut: 'Étape' };

// Dossier sinistre : où on en est, ce qui manque, ce qui s'est passé, et quand relancer
export default async function Sinistre({ params }: { params: { id: string } }) {
  const { supabase, profil, transport } = await utilisateurCourant();
  const { data: s } = await supabase.from('sinistres').select('*, vehicules(id, immatriculation, marque, modele), chauffeurs(id, prenom, nom, telephone), clients(id, prenom, nom, telephone)').eq('id', params.id).maybeSingle();
  if (!s) notFound();
  const [{ data: suivi }, { data: vehicules }, { data: chauffeurs }] = await Promise.all([
    supabase.from('sinistre_suivi').select('*').eq('sinistre_id', s.id).order('created_at', { ascending: false }),
    supabase.from('vehicules').select('id, immatriculation').neq('statut', 'sorti').order('immatriculation'),
    transport ? supabase.from('chauffeurs').select('id, prenom, nom').eq('actif', true).order('prenom') : Promise.resolve({ data: [] as any[] }),
  ]);
  const docs: any[] = Array.isArray(s.documents) ? s.documents : [];
  const liens = await liensFichiers(supabase, [...docs.map((d) => d.chemin), ...(s.photos ?? []), ...(suivi ?? []).map((x: any) => x.fichier_path)]);
  const etape = ETAPES_SINISTRE.findIndex(([k]) => k === s.statut);
  const fini = FINIS.includes(s.statut);
  const suivante = !fini && etape >= 0 && etape < ETAPES_SINISTRE.length - 1 ? ETAPES_SINISTRE[etape + 1] : null;
  const aujourdhui = versJour(new Date());
  const conducteur = s.chauffeurs ?? s.clients;
  const faits = docs.filter((d) => d.fait).length;

  return (
    <Cadre titre={`${TYPES_SINISTRE[s.type] ?? 'Sinistre'} · ${plaque(s.vehicules?.immatriculation) || 'véhicule ?'}`} retour={{ lien: '/sinistres', texte: 'Sinistres' }} tables={['sinistres']}>
      <section className="carte">
        <div className="etapes-sinistre">
          {ETAPES_SINISTRE.map(([k, v], i) => <span key={k} className={i < etape || s.statut === 'clos' ? 'fait' : i === etape ? 'actuel' : ''}>{v}</span>)}
        </div>
        {s.statut === 'refuse' && <p style={{ color: 'var(--rouge)', fontWeight: 700 }}>Refusé par l&apos;assureur</p>}
        <div className="ligne" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {suivante && <Formulaire action={S.etapeSinistre.bind(null, s.id, suivante[0])} succes={`Étape : ${suivante[1]}`}><Envoyer className="bouton principal">Passer à : {suivante[1]}</Envoyer></Formulaire>}
          {!fini && <Formulaire action={S.etapeSinistre.bind(null, s.id, 'clos')} confirmer="Clore ce dossier ?" succes="Dossier clos"><Envoyer className="bouton">Clore le dossier</Envoyer></Formulaire>}
          {!fini && <Formulaire action={S.etapeSinistre.bind(null, s.id, 'refuse')} confirmer="L'assureur refuse de prendre en charge ?" succes="Refus noté"><Envoyer className="bouton">Refusé</Envoyer></Formulaire>}
          {fini && <Formulaire action={S.etapeSinistre.bind(null, s.id, 'declare')} succes="Dossier rouvert"><Envoyer className="bouton">Rouvrir</Envoyer></Formulaire>}
          {!fini && s.prochaine_relance && <span className={s.prochaine_relance <= aujourdhui ? 'badge rouge' : 'gris'} style={{ alignSelf: 'center' }}>{s.prochaine_relance <= aujourdhui ? 'À relancer aujourd’hui' : `Prochaine relance le ${date(s.prochaine_relance)}`}</span>}
        </div>
      </section>

      <div className="deux-colonnes">
        <section className="carte">
          <h2 style={{ marginTop: 0 }}>Documents demandés <span className="gris" style={{ fontWeight: 500, fontSize: 15 }}>· {faits}/{docs.length}</span></h2>
          {docs.map((d, i) => (
            <div key={i} className="fichier">
              <Formulaire action={S.cocherDocument.bind(null, s.id, i)} succes={false}>
                <button className="case-doc" aria-label={d.fait ? `Décocher ${d.nom}` : `Cocher ${d.nom}`}>{d.fait ? '☑' : '☐'} <span style={{ textDecoration: d.fait ? 'line-through' : undefined, color: d.fait ? 'var(--gris)' : undefined }}>{d.nom}</span></button>
              </Formulaire>
              <Fichier compact agenceId={profil.agence_id} dossier={`sinistres/${s.id}`} nom={`doc-${i}`} libelle={d.chemin ? 'Voir / remplacer' : 'Joindre'} lien={d.chemin ? liens[d.chemin] : null} camera action={S.joindreDocument.bind(null, s.id, i)} />
            </div>
          ))}
          <Formulaire action={S.ajouterDocument.bind(null, s.id)} className="ligne" vider style={{ gap: 8, marginTop: 10 }} succes="Ajouté">
            <input name="nom" placeholder="Autre document demandé…" /><Envoyer className="bouton petit">Ajouter</Envoyer>
          </Formulaire>
          <h3>Photos</h3>
          <div className="ligne" style={{ gap: 8, flexWrap: 'wrap' }}>
            {(s.photos ?? []).map((p: string) => liens[p] ? <a key={p} href={liens[p]} target="_blank" rel="noreferrer"><img src={liens[p]} alt="Photo du sinistre" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 10 }} /></a> : null)}
            <Fichier compact agenceId={profil.agence_id} dossier={`sinistres/${s.id}`} nom="photo" libelle="+ Photo" camera accept="image/*" action={S.photoSinistre.bind(null, s.id)} />
          </div>
        </section>

        <section className="carte">
          <h2 style={{ marginTop: 0 }}>Suivi</h2>
          <Formulaire action={S.suiviSinistre.bind(null, s.id)} className="grille" vider succes="Ajouté au suivi">
            <label>Type<select name="genre"><option value="appel">Appel</option><option value="relance">Relance</option><option value="note">Note</option><option value="courrier">Courrier reçu</option></select></label>
            <label className="pleine">Ce qui s&apos;est passé<input name="texte" placeholder="Appelé l'assureur : expert passe jeudi…" /></label>
            <Envoyer>Ajouter</Envoyer>
          </Formulaire>
          <div style={{ marginTop: 8 }}><Fichier agenceId={profil.agence_id} dossier={`sinistres/${s.id}`} nom="courrier" libelle="Ajouter un courrier de l'assureur (photo ou PDF)" camera action={S.courrierSinistre.bind(null, s.id)} /></div>
          <p className="gris" style={{ fontSize: 12.5 }}>Chaque appel, relance ou courrier repousse la prochaine relance de 7 jours. Fleet vous prévient quand il faut relancer.</p>
          {(suivi ?? []).map((x: any) => (
            <div key={x.id} className="fichier" style={{ alignItems: 'flex-start' }}>
              <span><span className="gris" style={{ fontSize: 12.5 }}>{dateHeure(x.created_at)} · {GENRES[x.genre] ?? x.genre}</span><br />{x.texte}{x.fichier_path && liens[x.fichier_path] ? <> · <a className="lien" href={liens[x.fichier_path]} target="_blank" rel="noreferrer">Ouvrir</a></> : null}</span>
            </div>
          ))}
        </section>
      </div>

      <section className="carte">
        <h2 style={{ marginTop: 0 }}>Dossier</h2>
        <p className="gris" style={{ marginTop: 0 }}>{dateHeure(s.date_sinistre)}{conducteur ? ` · conducteur : ${nomChauffeur(conducteur)}` : ''}{conducteur?.telephone ? ` · ${conducteur.telephone}` : ''}</p>
        <Formulaire action={S.majSinistre.bind(null, s.id)} className="grille" succes="Dossier enregistré">
          <label>Véhicule<select name="vehicule_id" defaultValue={s.vehicule_id ?? ''}><option value="">—</option>{(vehicules ?? []).map((v: any) => <option key={v.id} value={v.id}>{plaque(v.immatriculation)}</option>)}</select></label>
          {transport ? <label>Chauffeur<select name="chauffeur_id" defaultValue={s.chauffeur_id ?? ''}><option value="">—</option>{(chauffeurs ?? []).map((c: any) => <option key={c.id} value={c.id}>{nomChauffeur(c)}</option>)}</select></label> : <input type="hidden" name="chauffeur_id" value={s.chauffeur_id ?? ''} />}
          <label>Lieu<input name="lieu" defaultValue={s.lieu ?? ''} /></label>
          <label>Responsabilité<select name="responsabilite" defaultValue={s.responsabilite}>{Object.entries(RESPONSABILITES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Assureur<input name="assureur" defaultValue={s.assureur ?? ''} /></label>
          <label>N° de dossier<input name="numero_dossier" defaultValue={s.numero_dossier ?? ''} /></label>
          <label>Expert<input name="expert" defaultValue={s.expert ?? ''} placeholder="Cabinet, téléphone" /></label>
          <label>Prochaine relance<input name="prochaine_relance" type="date" defaultValue={s.prochaine_relance ?? ''} /></label>
          <label className="pleine">Ce qui s&apos;est passé<input name="description" defaultValue={s.description ?? ''} /></label>
          <label className="pleine">Tiers<input name="tiers" defaultValue={s.tiers ?? ''} /></label>
          <label>Montant estimé (€)<input name="montant_estime" type="number" step="0.01" defaultValue={s.montant_estime ?? ''} /></label>
          <label>Franchise (€)<input name="franchise" type="number" step="0.01" defaultValue={s.franchise ?? ''} /></label>
          <label>Remboursé (€)<input name="montant_rembourse" type="number" step="0.01" defaultValue={s.montant_rembourse ?? ''} /></label>
          <label>Reste à charge (€)<input name="reste_a_charge" type="number" step="0.01" defaultValue={s.reste_a_charge ?? ''} /></label>
          {transport && <label>Retenu au chauffeur (€)<input name="retenue_chauffeur" type="number" step="0.01" defaultValue={s.retenue_chauffeur ?? ''} /></label>}
          <Envoyer>Enregistrer</Envoyer>
        </Formulaire>
        {s.reste_a_charge ? <p className="gris" style={{ fontSize: 13 }}>Le reste à charge ({euros(s.reste_a_charge)}) compte dans le coût du véhicule.</p> : null}
      </section>
    </Cadre>
  );
}
