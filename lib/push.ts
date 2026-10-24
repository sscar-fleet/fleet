// Envoi des notifications sur les téléphones, par le service d'Expo (gratuit, sans clé à gérer : Apple est
// branché côté Expo lors du build). Les téléphones désinstallés sont retirés d'eux-mêmes.
export type MessagePush = { to: string; title: string; body: string; data?: Record<string, unknown>; urgent?: boolean };

export async function envoyerPush(messages: MessagePush[], supabase?: any): Promise<number> {
  let envoyes = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const lot = messages.slice(i, i + 100);
    try {
      const rep = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST', signal: AbortSignal.timeout(10_000),
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(lot.map((m) => ({
          to: m.to, title: m.title, body: m.body, data: m.data ?? {}, sound: 'default',
          priority: 'high', channelId: 'alertes', ...(m.urgent ? { interruptionLevel: 'time-sensitive' } : {}),
        }))),
      });
      const json = await rep.json().catch(() => null);
      const tickets: any[] = json?.data ?? [];
      const morts: string[] = [];
      tickets.forEach((t, k) => {
        if (t?.status === 'ok') envoyes++;
        else if (t?.details?.error === 'DeviceNotRegistered') morts.push(lot[k].to);
      });
      if (morts.length && supabase) await supabase.from('appareils_push').update({ actif: false }).in('jeton', morts);
    } catch { /* réessayé à la prochaine tournée si la clé n'a pas été notée */ }
  }
  return envoyes;
}
