// Guarded PWA registration wrapper.
// Registers the service worker only in the published app; in dev / Lovable
// preview / iframe / ?sw=off it unregisters any stale worker to avoid
// serving cached UI.

const SW_URL = "/sw.js";

function isRefusedContext(): boolean {
  if (!import.meta.env.PROD) return true;
  if (typeof window === "undefined") return true;

  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }

  const host = window.location.hostname;
  if (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  ) {
    return true;
  }

  if (new URLSearchParams(window.location.search).has("sw")) {
    const v = new URLSearchParams(window.location.search).get("sw");
    if (v === "off") return true;
  }

  return false;
}

async function unregisterMatching() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL || "";
          return url.endsWith(SW_URL);
        })
        .map((r) => r.unregister()),
    );
  } catch {
    /* ignore */
  }
}

export function initPWA() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  if (isRefusedContext()) {
    void unregisterMatching();
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SW_URL, { type: "classic" })
      .then((reg) => {
        // Auto-reload once when a new SW takes control, so users see the new UI
        // without needing to close all tabs.
        let reloaded = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (reloaded) return;
          reloaded = true;
          window.location.reload();
        });

        // Poll for updates periodically (hourly) so long-lived tabs pick up new builds.
        setInterval(() => {
          reg.update().catch(() => undefined);
        }, 60 * 60 * 1000);
      })
      .catch(() => undefined);
  });
}
