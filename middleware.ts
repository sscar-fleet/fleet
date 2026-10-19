import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (liste) => {
          liste.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          liste.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // Lien d'e-mail arrivé sur la racine : on le fait passer par la page de retour
  if (request.nextUrl.pathname === '/' && request.nextUrl.searchParams.get('code')) {
    const cible = new URL('/auth/callback', request.url);
    cible.searchParams.set('code', request.nextUrl.searchParams.get('code')!);
    return NextResponse.redirect(cible);
  }
  const { data } = await supabase.auth.getUser();
  const publique = ['/app', '/sscs', '/api/ics', '/api/mobile', '/api/lire', '/login', '/auth', '/mot-de-passe', '/invitation', '/signer', '/scan', '/api/scans', '/confidentialite', '/conditions']
    .some((p) => request.nextUrl.pathname.startsWith(p));
  if (!data.user && !publique) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo-.*\\.svg).*)'],
};
