export function pathWithoutApiPrefix(url: string): string {
  const pathOnly = (url.split('?')[0] ?? '') || '/';
  const stripped = pathOnly.replace(/^\/api(?=\/|$)/, '');
  return stripped || '/';
}
