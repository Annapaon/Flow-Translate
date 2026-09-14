import { validateApiUrl } from "./security";

/** Exact hosts only; ports are not a separate host-permission boundary in Chrome. */
export function apiOrigins(urls: string[]): string[] {
  return [...new Set(urls.map(value => {
    const url = new URL(validateApiUrl(value));
    return `${url.protocol}//${url.hostname}/*`;
  }))];
}

/** Call directly from the click handler, before file reads or storage awaits. */
export function requestApiPermissions(urls: string[]): Promise<boolean> {
  const origins = apiOrigins(urls).filter(origin => ![
    "http://localhost/*", "http://127.0.0.1/*", "http://[::1]/*",
  ].includes(origin));
  // Chrome handles already-granted origins without another permission prompt.
  return origins.length ? browser.permissions.request({ origins }) : Promise.resolve(true);
}
