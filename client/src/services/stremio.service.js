// ── Stremio Addons & Discovery Service ──────────────────────────────────────

const CINEMETA_URL = 'https://v3-cinemeta.strem.io';
const OPENSUBTITLES_URL = 'https://opensubtitles-v3.strem.io';

export function normalizeManifestUrl(input) {
  let url = (input || '').trim();
  if (!url) return '';

  // Handle stremio:// protocol
  if (url.startsWith('stremio://')) {
    url = 'https://' + url.slice('stremio://'.length);
  }

  // If missing protocol
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  // Ensure ends with manifest.json
  if (!url.endsWith('/manifest.json')) {
    url = url.replace(/\/+$/, '') + '/manifest.json';
  }

  return url;
}

export function getAddonBaseUrl(manifestUrl) {
  return manifestUrl.replace(/\/manifest\.json$/i, '');
}

/**
 * Fetch and validate a Stremio addon manifest
 */
export async function fetchManifest(manifestUrl) {
  const url = normalizeManifestUrl(manifestUrl);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} when fetching manifest`);
  const manifest = await res.json();
  if (!manifest || !manifest.id || !manifest.name) {
    throw new Error('Invalid Stremio manifest format');
  }
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version || '1.0.0',
    description: manifest.description || '',
    logo: manifest.logo || manifest.icon || null,
    resources: manifest.resources || [],
    types: manifest.types || ['movie', 'series'],
    manifestUrl: url,
    enabled: true,
  };
}

/**
 * Search movies and series using Cinemeta catalog
 */
export async function searchCatalog(query) {
  const q = (query || '').trim();
  if (!q) return { movies: [], series: [] };

  const encoded = encodeURIComponent(q);
  const [moviesRes, seriesRes] = await Promise.allSettled([
    fetch(`${CINEMETA_URL}/catalog/movie/top/search=${encoded}.json`).then(r => r.json()),
    fetch(`${CINEMETA_URL}/catalog/series/top/search=${encoded}.json`).then(r => r.json()),
  ]);

  const movies = moviesRes.status === 'fulfilled' ? (moviesRes.value.metas || []) : [];
  const series = seriesRes.status === 'fulfilled' ? (seriesRes.value.metas || []) : [];

  return { movies, series };
}

/**
 * Get detailed metadata (and episode list for series) from Cinemeta
 */
export async function getMeta(type, id) {
  const cleanId = id.split(':')[0]; // tt123456:1:1 -> tt123456
  const res = await fetch(`${CINEMETA_URL}/meta/${type}/${cleanId}.json`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.meta || null;
}

/**
 * Query all active stream addons for available video streams
 */
export async function fetchStreams(addons, type, id) {
  const streamAddons = (addons || []).filter(a => a.enabled && hasResource(a, 'stream', type));
  if (!streamAddons.length) return [];

  const results = await Promise.allSettled(
    streamAddons.map(async (addon) => {
      const baseUrl = getAddonBaseUrl(addon.manifestUrl);
      const url = `${baseUrl}/stream/${type}/${encodeURIComponent(id)}.json`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return [];
      const data = await res.json();
      const streams = data.streams || [];
      return streams.map(s => ({
        ...s,
        addonName: addon.name,
        addonLogo: addon.logo,
        addonId: addon.id,
      }));
    })
  );

  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(s => !!(s.url || s.externalUrl || s.infoHash));
}

/**
 * Query all active subtitle addons + OpenSubtitles for subtitle tracks
 */
export async function fetchSubtitles(addons, type, id) {
  const subAddons = (addons || []).filter(a => a.enabled && hasResource(a, 'subtitles', type));
  
  // Ensure OpenSubtitles fallback is present
  const urls = subAddons.map(a => `${getAddonBaseUrl(a.manifestUrl)}/subtitles/${type}/${encodeURIComponent(id)}.json`);
  if (!subAddons.some(a => a.manifestUrl.includes('opensubtitles'))) {
    urls.push(`${OPENSUBTITLES_URL}/subtitles/${type}/${encodeURIComponent(id)}.json`);
  }

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return [];
      const data = await res.json();
      return data.subtitles || [];
    })
  );

  const allSubs = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(s => !!s.url);

  // De-duplicate by URL
  const seen = new Set();
  return allSubs.filter(sub => {
    if (seen.has(sub.url)) return false;
    seen.add(sub.url);
    return true;
  });
}

function hasResource(addon, resourceName, type) {
  if (!addon.resources) return true;
  return addon.resources.some(r => {
    if (typeof r === 'string') return r === resourceName;
    if (r && r.name === resourceName) {
      return !r.types || r.types.includes(type);
    }
    return false;
  });
}
