import { utilisateurCourant } from '@/lib/agence';
import { date, euros } from '@/lib/format';
import Cadre from '../_c/Cadre';

export const dynamic = 'force-dynamic';
const statuts: Record<string, string> = { envoye: 'Envoyé', accepte: 'Accepté', refuse: 'Refusé' };
const classes: Record<string, string> = { envoye: 'reservee', accepte: 'ok', refuse: 'annulee' };

export default async function Devis({ searchParams }: { searchParams: { filtre?: string } }) {
  const { supabase } = await utilisateurCourant();
  const filtre = searchParams.filtre ?? 'envoye';
  let q = supabase.from('devis').select('id, numero, client_nom, debut, fin, prix_total, statut, valide_jusqu, created_at, vehicules(immatriculation, marque, modele)').order('created_at', { ascending: false }).limit(200);
  if (filtre !== 'tous') q = q.eq('statut', filtre);
  const { data: devis } = await q;
  return (
    <Cadre titre="Devis" tables={['devis']} actions={<a className="bouton principal" href="/devis/nouveau">+ Nouveau devis</a>}>
      <div className="filtres">
        {[['envoye', 'En attente'], ['accepte', 'Acceptés'], ['refuse', 'Refusés'], ['tous', 'Tous']].map(([k, v]) => (
          <a key={k} href={`/devis?filtre=${k}`} className={filtre === k ? 'actif' : ''}>{v}</a>
        ))}
      </div>
      <div className="tableau">
        <table className="cartes">
          <thead><tr><th>Client</th><th>Dates</th><th>Prix</th><th>Statut</th><th className="masque-mobile">Véhicule</th></tr></thead>
          <tbody>
            {(devis ?? []).map((d: any) => {
              const expire = d.statut === 'envoye' && d.valide_jusqu && new Date(d.valide_jusqu) < new Date(new Date().toDateString());
              return (
                <tr key={d.id}>
                  <td><a className="bloc" href={`/devis/${d.id}`}><b>{d.client_nom}</b><br /><span className="gris">D-{String(d.numero).padStart(4, '0')} · {date(d.created_at)}</span></a></td>
                  <td>{date(d.debut)} → {date(d.fin)}</td>
                  <td>{euros(d.prix_total)}</td>
                  <td><span className={`pastille ${expire ? 'depasse' : classes[d.statut]}`}>{expire ? 'Expiré' : statuts[d.statut]}</span></td>
                  <td className="masque-mobile">{d.vehicules ? `${d.vehicules.immatriculation} · ${[d.vehicules.marque, d.vehicules.modele].filter(Boolean).join(' ')}` : <span className="gris">À choisir</span>}</td>
                </tr>
              );
            })}
            {!devis?.length && <tr><td colSpan={5}><div className="vide-guide"><b>Aucun devis ici</b>Un client demande un prix ? Faites le devis en 10 secondes et envoyez-le sur WhatsApp.<br /><a className="bouton principal" href="/devis/nouveau">+ Nouveau devis</a></div></td></tr>}
          </tbody>
        </table>
      </div>
    </Cadre>
  );
}
