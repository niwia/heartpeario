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
 * Query all active stream addons with progressive callback as each addon finishes
 */
export async function fetchStreamsProgressive(addons, type, id, onChunk) {
  const streamAddons = (addons || []).filter(a => a.enabled && hasResource(a, 'stream', type));
  if (!streamAddons.length) return [];

  const allStreams = [];

  const promises = streamAddons.map(async (addon) => {
    try {
      const baseUrl = getAddonBaseUrl(addon.manifestUrl);
      const url = `${baseUrl}/stream/${type}/${encodeURIComponent(id)}.json`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return [];
      const data = await res.json();
      const streams = (data.streams || [])
        .filter(s => !!(s.url || s.externalUrl || s.infoHash))
        .map(s => ({
          ...s,
          addonName: addon.name,
          addonLogo: addon.logo,
          addonId: addon.id,
        }));

      if (streams.length > 0) {
        allStreams.push(...streams);
        if (typeof onChunk === 'function') {
          onChunk(streams, addon);
        }
      }
      return streams;
    } catch {
      return [];
    }
  });

  await Promise.allSettled(promises);
  return allStreams;
}

/**
 * Backwards compatible fetchStreams
 */
export async function fetchStreams(addons, type, id) {
  return fetchStreamsProgressive(addons, type, id, null);
}

/**
 * Query all active subtitle addons + OpenSubtitles with progressive callback
 */
export async function fetchSubtitlesProgressive(addons, type, id, onChunk) {
  const subAddons = (addons || []).filter(a => a.enabled && hasResource(a, 'subtitles', type));
  
  const sources = subAddons.map(a => ({
    name: a.name,
    url: `${getAddonBaseUrl(a.manifestUrl)}/subtitles/${type}/${encodeURIComponent(id)}.json`,
  }));

  if (!subAddons.some(a => a.manifestUrl.includes('opensubtitles'))) {
    sources.push({
      name: 'OpenSubtitles v3',
      url: `${OPENSUBTITLES_URL}/subtitles/${type}/${encodeURIComponent(id)}.json`,
    });
  }

  const seen = new Set();
  const allSubs = [];

  const promises = sources.map(async (src) => {
    try {
      const res = await fetch(src.url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return [];
      const data = await res.json();
      const subs = (data.subtitles || [])
        .filter(s => !!s.url)
        .map(s => ({
          ...s,
          addonName: src.name,
        }));

      const newSubs = [];
      for (const s of subs) {
        if (!seen.has(s.url)) {
          seen.add(s.url);
          newSubs.push(s);
        }
      }

      if (newSubs.length > 0) {
        allSubs.push(...newSubs);
        if (typeof onChunk === 'function') {
          onChunk(newSubs, src.name);
        }
      }
      return newSubs;
    } catch {
      return [];
    }
  });

  await Promise.allSettled(promises);
  return allSubs;
}

/**
 * Backwards compatible fetchSubtitles
 */
export async function fetchSubtitles(addons, type, id) {
  return fetchSubtitlesProgressive(addons, type, id, null);
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
