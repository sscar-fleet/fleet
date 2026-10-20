import { supabaseServeur } from '@/lib/supabase';
import { dateHeure, euros, km, plaque } from '@/lib/format';
import SignerContrat from './SignerContrat';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Signature du contrat', robots: { index: false } };

// Page publique : le client lit le résumé de sa location et signe au doigt, sans compte
export default async function Signer({ params }: { params: { jeton: string } }) {
  const valide = /^[0-9a-f-]{36}$/i.test(params.jeton);
  const { data: c } = valide ? await supabaseServeur().rpc('voir_contrat', { le_jeton: params.jeton }) : { data: null };

  async function signer(image: string) {
    'use server';
    const { error } = await supabaseServeur().rpc('signer_contrat', { le_jeton: params.jeton, image });
    if (error) return { erreur: error.message.includes('déjà') ? 'Ce contrat est déjà signé.' : error.message };
    return {};
  }

  if (!c) {
    return (
      <main className="signer">
        <section className="signer-carte"><h1>Lien non valable</h1>
          <p>Ce lien de signature n&apos;existe pas ou la location est terminée. Contactez votre loueur.</p></section>
      </main>
    );
  }
  const lignes: [string, string][] = [
    ['Véhicule', `${c.vehicule} · ${plaque(c.immatriculation)}`],
    ['Départ', dateHeure(c.debut)],
    ['Retour', dateHeure(c.fin)],
    ['Prix', euros(c.prix)],
    ...(c.caution ? [['Caution', euros(c.caution)] as [string, string]] : []),
    ['Kilométrage', c.km_inclus != null ? `${km(c.km_inclus)} inclus${c.prix_km_sup ? `, puis ${euros(c.prix_km_sup)} par km` : ''}` : 'Illimité'],
  ];

  return (
    <main className="signer" style={{ ['--accent' as any]: c.agence_couleur || '#0ea896' }}>
      <section className="signer-carte">
        <p className="signer-agence">{c.agence}</p>
        <h1>Contrat de location n° {String(c.numero).padStart(5, '0')}</h1>
        <p className="signer-client">Bonjour {c.client}, vérifiez votre location puis signez en bas de la page.</p>
        <dl className="signer-infos">{lignes.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        {c.conditions && (
          <details className="signer-conditions"><summary>Lire les conditions générales</summary><p>{c.conditions}</p></details>
        )}
        {c.signe
          ? <p className="signer-ok">Contrat signé{c.signe_le ? ` le ${dateHeure(c.signe_le)}` : ''}. Merci, à bientôt.</p>
          : <SignerContrat signer={signer} />}
        {c.agence_telephone && <p className="signer-aide">Une question ? Appelez {c.agence} au {c.agence_telephone}.</p>}
      </section>
    </main>
  );
}
