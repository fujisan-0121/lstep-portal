/**
 * Cloudflare Access の JWT (Cf-Access-Jwt-Assertion) を検証して、ログイン中のメールアドレスを取り出す。
 *
 * 独自のパスワード認証は持たない。誰がアクセスしているかは Cloudflare Access が保証する。
 * ヘッダー `Cf-Access-Authenticated-User-Email` は署名されていないため信用せず、必ず JWT を検証する。
 */

export interface AccessIdentity {
  email: string;
  name?: string;
}

interface Jwk {
  kid: string;
  kty: string;
  alg: string;
  n: string;
  e: string;
  use?: string;
}

interface JwksCache {
  fetchedAt: number;
  keys: Map<string, CryptoKey>;
}

const JWKS_TTL_MS = 60 * 60 * 1000; // 1時間
let jwksCache: JwksCache | null = null;

function b64urlToBytes(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson<T>(segment: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(segment))) as T;
}

async function loadJwks(teamDomain: string, force = false): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (!force && jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;

  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
    cf: { cacheTtl: 300, cacheEverything: true },
  } as RequestInit);
  if (!res.ok) throw new Error(`JWKS の取得に失敗しました (${res.status})`);
  const body = (await res.json()) as { keys: Jwk[] };

  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (jwk.kty !== 'RSA') continue;
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    keys.set(jwk.kid, key);
  }
  jwksCache = { fetchedAt: now, keys };
  return keys;
}

export interface VerifyOptions {
  teamDomain: string;
  audience: string;
}

/**
 * JWT を検証し、正当なら identity を返す。不正なら null。
 */
export async function verifyAccessJwt(token: string, opts: VerifyOptions): Promise<AccessIdentity | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;

  let header: { alg?: string; kid?: string };
  let payload: { aud?: string | string[]; exp?: number; nbf?: number; iss?: string; email?: string; name?: string };
  try {
    header = decodeJson(h);
    payload = decodeJson(p);
  } catch {
    return null;
  }
  if (header.alg !== 'RS256' || !header.kid) return null;

  // 署名検証（鍵がローテーションされていた場合は1回だけ再取得）
  const data = new TextEncoder().encode(`${h}.${p}`);
  const sig = b64urlToBytes(s);
  let key = (await loadJwks(opts.teamDomain)).get(header.kid);
  if (!key) key = (await loadJwks(opts.teamDomain, true)).get(header.kid);
  if (!key) return null;
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data);
  if (!ok) return null;

  // クレーム検証
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null;
  if (payload.iss !== `https://${opts.teamDomain}`) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(opts.audience)) return null;
  if (!payload.email) return null;

  return { email: payload.email.toLowerCase(), name: payload.name };
}

/** リクエストから Access の JWT を取り出す（ヘッダー優先、次に Cookie） */
export function extractAccessToken(req: Request): string | null {
  const header = req.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = req.headers.get('Cookie') ?? '';
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return m ? m[1] : null;
}
