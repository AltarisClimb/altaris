/* Progressive Web App — real offline support, CDC §7.
   Only registers over http(s); a file:// open stays a plain page.
   A separate file (not inline in index.html) so the CSP can forbid inline scripts. */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
