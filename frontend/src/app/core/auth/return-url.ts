/**
 * The login page redirects to whatever `returnUrl` says, so it must never be able to point off-site
 * (open redirect). Only same-app absolute paths are accepted; anything else becomes the home page.
 */
export function sanitizeReturnUrl(url: string | null | undefined): string {
  if (!url || !url.startsWith('/') || url.startsWith('//') || url.includes('\\')) {
    return '/';
  }
  if (/[\u0000-\u001f]/.test(url)) {
    return '/';
  }
  const path = url.split(/[?#]/)[0];
  if (path === '/login' || path === '/register') {
    return '/';
  }
  return url;
}
