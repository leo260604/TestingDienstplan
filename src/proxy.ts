/* Proxy (früher „middleware“): schützt alle Seiten – ohne Sitzung geht es zu /login */
import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export const { auth: proxy } = NextAuth(authConfig);

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|assets/|manifest.webmanifest).*)'],
};
