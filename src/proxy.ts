/* Proxy (früher „middleware“): schützt alle Seiten – ohne Sitzung geht es zu /login */
import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|assets/|manifest.webmanifest).*)'],
};
