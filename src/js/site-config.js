/* Site config: single source of truth for canonical domain.
   SETUP (one-time, 2 min):
   1. Buy/deploy domain (e.g. chargetruth.in), point DNS to host.
   2. Set <meta name="ct-site-url" content="https://yourdomain"> in index.html
      OR localStorage ct-site-url — this module reads meta first, then storage,
      then falls back to placeholder (warns in console + footer).
   3. Re-run: node scripts/prerender-seo.js && node scripts/indexnow-submit.js
   All canonicals/sitemap/JSON-LD/prerender derive from siteUrl(). No more
   hardcoded example.com drift. */
export function siteUrl() {
  try {
    const m = document.querySelector('meta[name="ct-site-url"]');
    const fromMeta = (m?.content || '').replace(/\/$/, '');
    if (fromMeta && !fromMeta.includes('example.com')) return fromMeta;
    const fromLS = (localStorage.getItem('ct-site-url') || '').replace(/\/$/, '');
    if (fromLS && !fromLS.includes('example.com')) return fromLS;
  } catch {}
  return 'https://chargetruth.example.com'; // placeholder until step 2 done
}
export function isPlaceholderDomain() {
  return siteUrl().includes('example.com');
}
/* Analytics: GA4 AI-referral isolation (no GTM — keeps INP budget).
   Set localStorage ct-ga4-id = G-XXXXXXX. Tracks ?utm_source=chatgpt/perplexity/copilot
   + document.referrer chatgpt.com/perplexity.ai/copilot as ai_referral events. */
export function initAnalytics() {
  try {
    const id = localStorage.getItem('ct-ga4-id') || '';
    if (!id) return { enabled: false, reason: 'set localStorage ct-ga4-id = G-XXXXXXX' };
    const s = document.createElement('script');
    s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    const gtag = (...a) => window.dataLayer.push(a);
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', id, { send_page_view: true });
    const ref = document.referrer || '';
    const utm = new URLSearchParams(location.search).get('utm_source') || '';
    if (/chatgpt|openai|perplexity|copilot|gemini|claude/i.test(ref + ' ' + utm)) {
      gtag('event', 'ai_referral', { referrer: ref.slice(0, 200), utm_source: utm });
    }
    return { enabled: true, id };
  } catch { return { enabled: false, reason: 'error' }; }
}
