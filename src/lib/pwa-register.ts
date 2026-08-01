// App-shell service worker cleanup.
// The old Workbox worker kept serving stale UI. /sw.js is now a kill-switch
// worker that clears its caches and unregisters itself. We register it once in
// production so returning browsers get the replacement, then stop.

const SW_URL = "/sw.js";

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

  if (!import.meta.env.PROD) {
    void unregisterMatching();
    return;
  }

  // Fetch the replacement worker so already-registered clients update to the
  // kill-switch version, which then removes itself.
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.update().catch(() => undefined))))
      .catch(() => undefined);
    void unregisterMatching();
  });
}
