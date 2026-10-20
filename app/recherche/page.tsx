import { utilisateurCourant } from '@/lib/agence';
import { statutVehicule, statutLocation, date, plaque, tel } from '@/lib/format';
import Cadre from '../_c/Cadre';

export const dynamic = 'force-dynamic';

// Une seule recherche pour tout : véhicule, client ou location
export default async function Recherche({ searchParams }: { searchParams: { q?: string } }) {
  const { supabase } = await utilisateurCourant();
  const q = (searchParams.q ?? '').trim();
  const motif = `%${q.replace(/[%,()]/g, ' ')}%`;
  const motifPlaque = `%${q.toUpperCase().replace(/[\s-]/g, '')}%`;
  const numero = /^\d{1,6}$/.test(q) ? Number(q) : null;
  const [{ data: vehicules }, { data: clients }, { data: locations }] = q.length < 2 ? [{ data: [] }, { data: [] }, { data: [] }] as any : await Promise.all([
    supabase.from('vehicules').select('id, immatriculation, marque, modele, statut').or(`immatriculation.ilike.${motifPlaque},marque.ilike.${motif},modele.ilike.${motif}`).limit(20),
    supabase.from('clients').select('id, nom, prenom, telephone, email').or(`nom.ilike.${motif},prenom.ilike.${motif},telephone.ilike.${motif},email.ilike.${motif}`).limit(20),
    numero !== null
      ? supabase.from('locations').select('id, numero, debut, fin_prevue, statut, vehicules(immatriculation), clients(nom, prenom)').eq('numero', numero).limit(5)
      : Promise.resolve({ data: [] }),
  ]);
  const total = (vehicules?.length ?? 0) + (clients?.length ?? 0) + (locations?.length ?? 0);

  return (
    <Cadre titre={q ? `« ${q} »` : 'Rechercher'}>
      <form className="recherche" style={{ maxWidth: 'none', marginBottom: 18 }}>
        <input name="q" type="search" defaultValue={q} autoFocus placeholder="Immatriculation, modèle, nom, téléphone, n° de contrat…" />
      </form>
      {q.length >= 2 && !total && <div className="vide-guide carte"><b>Rien trouvé</b>Essayez une partie de l&apos;immatriculation, le nom du client ou son téléphone.</div>}
      {!!vehicules?.length && <section className="carte"><h2>Véhicules</h2>
        {vehicules.map((v: any) => (
          <a key={v.id} href={`/vehicules/${v.id}`} className="fichier"><span><b>{plaque(v.immatriculation)}</b> · {[v.marque, v.modele].filter(Boolean).join(' ')}</span><span className={`pastille ${v.statut}`}>{statutVehicule[v.statut]}</span></a>
        ))}</section>}
      {!!clients?.length && <section className="carte"><h2>Clients</h2>
        {clients.map((c: any) => (
          <a key={c.id} href={`/clients/${c.id}`} className="fichier"><span><b>{c.nom}</b> {c.prenom}</span><span className="gris">{c.telephone ? tel(c.telephone) : c.email ?? ''}</span></a>
        ))}</section>}
      {!!locations?.length && <section className="carte"><h2>Locations</h2>
        {locations.map((l: any) => (
          <a key={l.id} href={`/locations/${l.id}`} className="fichier"><span><b>N° {l.numero}</b> · {plaque(l.vehicules?.immatriculation)} · {l.clients?.prenom} {l.clients?.nom}<br /><span className="gris">{date(l.debut)} → {date(l.fin_prevue)}</span></span><span className={`pastille ${l.statut}`}>{statutLocation[l.statut]}</span></a>
        ))}</section>}
    </Cadre>
  );
}
