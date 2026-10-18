import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServeur } from '@/lib/supabase';

// Retour des liens reçus par e-mail (confirmation de compte, mot de passe oublié)
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const suite = url.searchParams.get('next') || '/';
  const destination = suite.startsWith('/') ? suite : '/';
  if (code) {
    const { error } = await supabaseServeur().auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL('/login?lien=expire', url.origin));
  }
  return NextResponse.redirect(new URL(destination, url.origin));
}
