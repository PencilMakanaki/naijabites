// Share previews: gives product and vendor links a proper title, description and photo
// (WhatsApp, Facebook and Google read these from the page before any scripts run).
import { formatNaira } from '@naijabites/shared/money';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (text, max) => { const t = String(text ?? '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1).trimEnd()}\u2026` : t; };

/** Puts the preview tags into the page's HTML. meta = { title, description, image, url, type }. */
export function injectMeta(html, meta) {
  const tags = [
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<link rel="canonical" href="${esc(meta.url)}" />`,
    `<meta property="og:site_name" content="NaijaBites" />`,
    `<meta property="og:type" content="${esc(meta.type ?? 'website')}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${esc(meta.url)}" />`,
    ...(meta.image ? [`<meta property="og:image" content="${esc(meta.image)}" />`] : []),
    `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}" />`,
  ].join('\n    ');
  return html
    .replace(/<meta name="description"[^>]*>\s*/i, '')
    .replace(/<title>[^<]*<\/title>/i, `<title>${esc(meta.title)}</title>`)
    .replace('</head>', `    ${tags}\n  </head>`);
}

export function createMetaResolver({ catalogue, config }) {
  const origin = config.appOrigin;
  const absolute = (url) => (!url ? undefined : /^https?:\/\//i.test(url) ? url : `${origin}${url}`);

  return async function resolveMeta(path) {
    let match = /^\/p\/([0-9A-HJKMNP-TV-Z]{26})$/.exec(path);
    if (match) {
      const p = await catalogue.getProduct(match[1]);
      if (!p) return null;
      return {
        title: `${p.name} from ${p.vendor.name} | NaijaBites`,
        description: clip(`${formatNaira(p.priceKobo)} per ${p.unit}. ${p.description}`, 200),
        image: absolute(p.image?.url),
        url: `${origin}${path}`,
        type: 'product',
      };
    }
    match = /^\/vendors\/([a-z0-9][a-z0-9-]{0,79})$/.exec(path);
    if (match) {
      const v = await catalogue.getVendor(match[1]);
      if (!v) return null;
      const where = v.branches[0] ? ` in ${v.branches[0].area}, ${v.branches[0].city}` : '';
      return {
        title: `${v.name} | NaijaBites`,
        description: clip(`${v.name}${where}. ${v.description || 'Local food vendor on NaijaBites.'}`, 200),
        url: `${origin}${path}`,
        type: 'website',
      };
    }
    return null;
  };
}
