/** Resolve project-owned URLs under the production base and preserve explicit HTTP(S) targets. */
export function resolveFrameUrl(source, base = '/', origin = 'http://localhost') {
  if (typeof source !== 'string' || !source.trim()) throw new Error('A demo or fallback URL is required.');
  const input = source.trim();
  if (/^https?:\/\//i.test(input)) return new URL(input).href;
  if (/^[a-z][a-z\d+.-]*:/i.test(input) || input.startsWith('//') || input.includes('\\')) throw new Error('Unsupported URL scheme. Use a local asset path or an explicit HTTP(S) URL.');
  const originUrl = new URL(origin);
  const baseUrl = new URL(base.endsWith('/') ? base : `${base}/`, `${originUrl.origin}/`);
  if (baseUrl.origin !== originUrl.origin) throw new Error('The build base must be a local URL path.');
  const url = input.startsWith(baseUrl.pathname) ? new URL(input, originUrl.origin) : new URL(input.replace(/^\//, ''), baseUrl);
  if (url.origin !== originUrl.origin || !url.pathname.startsWith(baseUrl.pathname)) throw new Error('The local URL escapes the configured build base.');
  return `${url.pathname}${url.search}${url.hash}`;
}
