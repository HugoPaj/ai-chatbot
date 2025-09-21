import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { isDevelopmentEnvironment } from './lib/constants';
import { isAdminEmail } from './lib/auth/admin';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith('/ping')) {
    return new Response('pong', { status: 200 });
  }

  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // Allow unauthenticated access to login page
  if (pathname === '/login') {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  if (!token) {
    const redirectUrl = encodeURIComponent(request.url);

    return NextResponse.redirect(
      new URL(`/login?redirectUrl=${redirectUrl}`, request.url),
    );
  }

  const userEmail = token?.email ?? '';
  const isAdmin = isAdminEmail(userEmail);

  // Redirect authenticated users away from auth pages
  if (token && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Protect dashboard route - only allow authenticated users
  if (pathname === '/dashboard') {
    if (!token) {
      const redirectUrl = encodeURIComponent(request.url);
      return NextResponse.redirect(
        new URL(`/login?redirectUrl=${redirectUrl}`, request.url),
      );
    }
  }

  // Protect admin API routes - only allow admin users
  if (pathname.startsWith('/api/admin') && !isAdmin) {
    console.log(
      `Admin access denied for email: ${userEmail}, path: ${pathname}`,
    );
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }


  // Add user type to request headers for API routes to use
  const response = NextResponse.next();

  if (token && pathname.startsWith('/api/')) {
    let userType = token.type as string;

    // Ensure user type is properly set with fallbacks
    if (!userType) {
      userType = isAdmin ? 'admin' : 'free';
    }

    response.headers.set('x-user-id', token.id as string);
    response.headers.set('x-user-type', userType);
    response.headers.set('x-user-email', userEmail);
  }

  return response;
}

export const config = {
  matcher: [
    '/',
    '/chat/:id',
    '/dashboard',
    '/api/:path*',
    '/login',

    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
