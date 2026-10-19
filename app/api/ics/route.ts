// Fichier calendrier (.ics) : ouvert depuis un iPhone, il propose « Ajouter au calendrier » (Calendrier Apple).
// Exemple : /api/ics?t=Pack%20Ultime%20·%20Golf%208&d=2026-10-20&h=10:00&dur=120&l=Atelier
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const echapper = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const deux = (n: number) => String(n).padStart(2, '0');

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const titre = (p.get('t') ?? 'Rendez-vous').slice(0, 200);
  const jour = p.get('d') ?? '';
  const heure = p.get('h') ?? '09:00';
  const duree = Math.min(Math.max(Number(p.get('dur') ?? 120) || 120, 15), 24 * 60);
  const lieu = (p.get('l') ?? '').slice(0, 200);
  const note = (p.get('n') ?? '').slice(0, 1000);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jour);
  const h = /^(\d{1,2}):(\d{2})$/.exec(heure);
  if (!m || !h) return NextResponse.json({ erreur: 'Date ou heure invalide.' }, { status: 400 });

  const debut = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +h[1], +h[2]));
  const fin = new Date(debut.getTime() + duree * 60000);
  const local = (d: Date) => `${d.getUTCFullYear()}${deux(d.getUTCMonth() + 1)}${deux(d.getUTCDate())}T${deux(d.getUTCHours())}${deux(d.getUTCMinutes())}00`;
  const maintenant = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

  const lignes = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SS CAR SYSTEM//Agenda//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE', 'TZID:Europe/Paris',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@sscarsystem.com`,
    `DTSTAMP:${maintenant}`,
    `DTSTART;TZID=Europe/Paris:${local(debut)}`,
    `DTEND;TZID=Europe/Paris:${local(fin)}`,
    `SUMMARY:${echapper(titre)}`,
    ...(lieu ? [`LOCATION:${echapper(lieu)}`] : []),
    ...(note ? [`DESCRIPTION:${echapper(note)}`] : []),
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Rendez-vous atelier', 'TRIGGER:-PT1H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return new NextResponse(lignes.join('\r\n') + '\r\n', {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'inline; filename="rendez-vous.ics"', 'cache-control': 'no-store' },
  });
}
