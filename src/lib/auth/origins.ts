/**
 * Origin allowlist for Better Auth (pure: no I/O, unit-tested in origins.test.ts).
 *
 * Better Auth rejects credentialed POSTs (sign-in, sign-out, reset…) whose
 * `Origin` is not in `trustedOrigins` with FORBIDDEN "Invalid origin". The check
 * only fires when the request carries a Cookie header, which is why it looked
 * intermittent: a fresh browser passed, a browser with any cookie (stale session,
 * `_vercel_jwt` from Deployment Protection, …) failed.
 *
 * Previously, with `BETTER_AUTH_URL` set, the allowlist was ONLY that URL, so the
 * same deployment reached through its `*.vercel.app` URL, a branch/preview URL,
 * a `www.` variant or a second custom domain was rejected. Without it, the list
 * trusted `*.vercel.app` (any Vercel customer's site) in production.
 *
 * Now: production trusts exactly this deployment's own origins (explicit URL,
 * `APP_ORIGINS`, and the system env Vercel injects). Wildcard sandbox hosts are
 * added only outside production (live preview / local dev).
 */

export type EnvLike = Record<string, string | undefined>;

/** Sandbox/live-preview host patterns. NEVER trusted in production. */
export const DEV_PREVIEW_HOST_PATTERNS = ["*.grok-sandbox.com", "*.vusercontent.net", "*.vercel.run"] as const;

export const LOCAL_DEV_ORIGINS = ["http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080"] as const;

const read = (env: EnvLike, key: string) => {
  const v = env[key]?.trim();
  return v ? v : undefined;
};

/**
 * Normalize a URL or bare host to a canonical origin (`https://host[:port]`).
 * Strips path, query, trailing slash and casing; returns null for garbage.
 */
export function toOrigin(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname) return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

export type AuthOrigins = {
  /** Exact origins (and, outside production, host wildcards) for `trustedOrigins`. */
  trustedOrigins: string[];
  /** Hosts for Better Auth's dynamic `baseURL.allowedHosts`. */
  allowedHosts: string[];
};

/**
 * Check a concrete origin against the same allowlist semantics used by the
 * auth server. Wildcards are suffix patterns such as `*.grok-sandbox.com`.
 */
export function isAllowedAuthOrigin(origin: string, authOrigins: AuthOrigins): boolean {
  const normalized = toOrigin(origin);
  if (!normalized) return false;
  if (authOrigins.trustedOrigins.includes(normalized)) return true;
  try {
    const host = new URL(normalized).hostname.toLowerCase();
    return authOrigins.trustedOrigins.some((candidate) => {
      if (!candidate.includes("*")) return false;
      try {
        const wildcardUrl = new URL(candidate.replace("*.", "placeholder."));
        const suffix = wildcardUrl.hostname.replace(/^placeholder\./, "");
        return host.endsWith(`.${suffix}`) && host !== suffix;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export function buildAuthOrigins(env: EnvLike, opts: { production: boolean }): AuthOrigins {
  // Production must trust only explicitly configured public origins plus the
  // project production URL Vercel exposes. Deployment/branch URLs are omitted
  // intentionally: in production they may point at a preview deployment and
  // should never become trusted merely because Vercel injected an env var.
  const productionCandidates = [
    read(env, "BETTER_AUTH_URL"),
    read(env, "APP_URL"),
    ...(read(env, "APP_ORIGINS")?.split(",") ?? []),
    read(env, "VERCEL_PROJECT_PRODUCTION_URL"),
  ];
  const previewCandidates = [
    read(env, "VERCEL_BRANCH_URL"),
    read(env, "VERCEL_URL"),
  ];
  const candidates = (opts.production ? productionCandidates : [...productionCandidates, ...previewCandidates])
    .filter((v): v is string => Boolean(v));

  const exact = [...new Set(candidates.map(toOrigin).filter((o): o is string => Boolean(o)))];
  const exactHosts = exact.map((o) => new URL(o).host);

  if (opts.production) {
    return { trustedOrigins: exact, allowedHosts: [...new Set(exactHosts)] };
  }

  const wildcards = [...DEV_PREVIEW_HOST_PATTERNS];
  return {
    trustedOrigins: [
      ...new Set([
        ...exact,
        ...LOCAL_DEV_ORIGINS,
        ...wildcards,
        ...wildcards.flatMap((h) => [`https://${h}`, `http://${h}`]),
      ]),
    ],
    allowedHosts: [...new Set([...exactHosts, ...wildcards, "localhost", "127.0.0.1", "[::1]"])],
  };
}
