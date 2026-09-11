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

/**
 * Parse raw Stremio addon stream metadata into structured badges
 */
export function parseStreamInfo(st) {
  if (!st) return { filename: 'Stream', format: 'mp4', videoTags: [], audioBadges: [], providerMatches: [], remainingLines: [], seeds: null };
  const name = st.name || '';
  const title = st.title || '';
  const desc = st.description || '';
  const rawUrl = st.url || st.externalUrl || '';
  let decodedUrl = '';
  try {
    decodedUrl = decodeURIComponent(rawUrl);
  } catch {
    decodedUrl = rawUrl;
  }
  const rawText = `${name}\n${title}\n${desc}\n${decodedUrl}`;
  const lines = `${name}\n${title}\n${desc}`.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Filename / Release name extraction
  let filename = '';
  // Check behaviorHints
  if (st.behaviorHints?.filename) {
    filename = st.behaviorHints.filename;
  }
  // Check query params in decoded URL (e.g. KEY5=Citizen.Vigilante...mkv or filename=...)
  if (!filename) {
    const key5Match = decodedUrl.match(/(?:KEY5|filename|file|title)=([^&]+\.(?:mkv|mp4|avi|webm|ts|m3u8))/i);
    if (key5Match) {
      filename = key5Match[1].split('/').pop();
    }
  }
  // Check URL pathname for clean video file
  if (!filename && /\.(mkv|mp4|avi|webm|ts|m3u8)/i.test(decodedUrl)) {
    const urlPath = decodedUrl.split('?')[0].split('/').pop();
    if (urlPath && /\.(mkv|mp4|avi|webm|ts|m3u8)/i.test(urlPath) && !urlPath.startsWith('movie.') && !urlPath.startsWith('video.')) {
      filename = urlPath;
    }
  }
  // Check lines from title/desc/name with extension
  if (!filename) {
    const fileLine = lines.find(l => /\.(mkv|mp4|avi|webm|ts|m3u8)/i.test(l));
    if (fileLine) {
      filename = fileLine;
    }
  }
  // If no extension found, prefer the first line of title/description that is not just the addon name
  if (!filename) {
    const cleanCandidate = lines.find(l => {
      const lower = l.toLowerCase();
      if (lower === name.toLowerCase()) return false;
      if (/^(⚙️|⚡|\[|\baddon\b|\bstream\b)/i.test(l) && l.length < 25) return false;
      return true;
    });
    filename = cleanCandidate || lines[0] || 'Direct Stream';
  }

  // 2. Size (e.g. 2.20 GB, 952 MB, 1.3 GiB)
  const sizeMatch = rawText.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|GiB|MiB))/i);
  const size = sizeMatch ? sizeMatch[1].toUpperCase() : null;

  // 3. Seeds / Peers (e.g. 👤 25, 25 seeds)
  const seedsMatch = rawText.match(/(?:👤|seeds?|peers?|seeders?)[:\s]*(\d+)/i);
  const seeds = seedsMatch ? seedsMatch[1] : null;

  // 4. Languages (e.g. English, Hindi, Multi)
  const langMatch = rawText.match(/(?:🗣|audio|lang|languages?)[:\s]*([^\n•]+)/i);
  let languages = langMatch ? langMatch[1].trim() : null;
  if (!languages && /hindi/i.test(rawText) && /english/i.test(rawText)) languages = 'English, Hindi';
  else if (!languages && /english/i.test(rawText)) languages = 'English';

  // 5. Audio Codecs
  const audioBadges = [];
  if (/atmos/i.test(rawText)) audioBadges.push('Dolby Atmos');
  else if (/truehd/i.test(rawText)) audioBadges.push('TrueHD');
  else if (/dts-hd|dts/i.test(rawText)) audioBadges.push('DTS');
  else if (/ddp|dd\+|e-?ac-?3/i.test(rawText)) audioBadges.push('DDP 5.1');
  else if (/ac-?3|5\.1/i.test(rawText)) audioBadges.push('5.1 Audio');
  else if (/aac/i.test(rawText)) audioBadges.push('AAC');

  // 6. Video / Source Tags
  const videoTags = [];
  if (/remux/i.test(rawText)) videoTags.push('REMUX');
  if (/bluray|bdrip/i.test(rawText)) videoTags.push('BluRay');
  else if (/web-?dl|webrip/i.test(rawText)) videoTags.push('WEB-DL');
  if (/dovi|dolby\s*vision|dv/i.test(rawText)) videoTags.push('DV');
  if (/hdr10\+|hdr/i.test(rawText)) videoTags.push('HDR');
  if (/10bit|10-bit/i.test(rawText)) videoTags.push('10-bit');
  if (/hevc|x265|h\.?265/i.test(rawText)) videoTags.push('HEVC / x265');
  else if (/x264|h\.?264|avc/i.test(rawText)) videoTags.push('x264');

  // 7. Provider Host / Extra Info
  const providerMatches = [];
  if (/febbox/i.test(rawText)) providerMatches.push('⚡ Febbox');
  if (/shegu/i.test(rawText) && !providerMatches.includes('⚡ Febbox')) providerMatches.push('⚡ Shegu');
  if (/torbox/i.test(rawText)) providerMatches.push('⚡ Torbox');
  if (/debrid|realdebrid|rd\+/i.test(rawText)) providerMatches.push('⚡ Debrid');
  if (/alldebrid/i.test(rawText)) providerMatches.push('⚡ AllDebrid');
  if (/premiumize/i.test(rawText)) providerMatches.push('⚡ Premiumize');
  if (/hdhub4u/i.test(rawText)) providerMatches.push('HDHub4u');
  if (/workers/i.test(rawText)) providerMatches.push('⚡ Workers');

  // 8. Container Format
  const urlLower = rawUrl.toLowerCase();
  const decodedLower = decodedUrl.toLowerCase();
  const textLower = rawText.toLowerCase();
  let format = 'mp4';
  if (urlLower.includes('.m3u8') || urlLower.includes('/direct/external/') || textLower.includes('.m3u8')) {
    format = 'hls';
  } else if (urlLower.includes('.mkv') || decodedLower.includes('.mkv') || textLower.includes('.mkv')) {
    format = 'mkv';
  }

  // 9. Quality label
  let quality = '';
  const qText = rawText.toUpperCase();
  if (qText.includes('4K') || qText.includes('2160P')) quality = '4K';
  else if (qText.includes('1080P')) quality = '1080p';
  else if (qText.includes('720P')) quality = '720p';
  else if (qText.includes('480P') || qText.includes('360P')) quality = 'SD';

  const remainingLines = lines.filter(l => {
    if (l === filename) return false;
    if (filename.includes(l) && l.length > 5) return false;
    if (st.name && l.includes(st.name)) return false;
    if (/^(4k|1080p|720p|sd)$/i.test(l)) return false;
    return true;
  }).slice(0, 3);

  return {
    filename,
    size,
    seeds,
    languages,
    audioBadges,
    videoTags,
    providerMatches,
    format,
    quality,
    remainingLines,
  };
}
