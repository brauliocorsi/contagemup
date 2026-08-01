// Auto-reload when a new build is deployed.
// The service worker is now a kill-switch, so we detect new versions by
// comparing the hashed entry-script URL in the freshly fetched index.html
// with the one this page booted from. If it changed, a new build is live.

const POLL_INTERVAL_MS = 60_000;
const STORAGE_KEY = "app-auto-reload-at";
const MIN_RELOAD_GAP_MS = 30_000;

function currentEntryScript(): string | null {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'));
  const entry = scripts.find((s) => /\/assets\/index-.*\.js$/.test(s.src)) ?? scripts[0];
  return entry ? new URL(entry.src, location.href).pathname : null;
}

function entryScriptFromHtml(html: string): string | null {
  const matches = Array.from(html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g));
  const found = matches.map((m) => m[1]).find((src) => /\/assets\/index-.*\.js$/.test(src)) ?? matches[0]?.[1];
  return found ? new URL(found, location.href).pathname : null;
}

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(STORAGE_KEY) || 0);
    if (Date.now() - last < MIN_RELOAD_GAP_MS) return; // avoid reload loops
    sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  location.reload();
}

async function checkForUpdate(baseline: string) {
  try {
    const res = await fetch(`/?_v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const html = await res.text();
    const next = entryScriptFromHtml(html);
    if (next && next !== baseline) reloadOnce();
  } catch {
    /* offline or transient — ignore */
  }
}

export function initVersionCheck() {
  if (typeof window === "undefined") return;
  if (!import.meta.env.PROD) return;

  const baseline = currentEntryScript();
  if (!baseline) return;

  const run = () => void checkForUpdate(baseline);

  const timer = window.setInterval(run, POLL_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run();
  });
  window.addEventListener("focus", run);
  window.addEventListener("pagehide", () => window.clearInterval(timer));

  run();
}
