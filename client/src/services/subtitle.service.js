// ── Subtitle & Language Service ─────────────────────────────────────────────

const LANG_MAP = {
  eng: 'English', en: 'English',
  spa: 'Spanish', es: 'Spanish',
  hin: 'Hindi', hi: 'Hindi',
  tam: 'Tamil', ta: 'Tamil',
  tel: 'Telugu', te: 'Telugu',
  fre: 'French', fra: 'French', fr: 'French',
  ger: 'German', deu: 'German', de: 'German',
  por: 'Portuguese', pt: 'Portuguese',
  pob: 'Portuguese (BR)',
  ita: 'Italian', it: 'Italian',
  rus: 'Russian', ru: 'Russian',
  ara: 'Arabic', ar: 'Arabic',
  jpn: 'Japanese', ja: 'Japanese',
  kor: 'Korean', ko: 'Korean',
  chi: 'Chinese', zho: 'Chinese', zh: 'Chinese',
  dut: 'Dutch', nld: 'Dutch', nl: 'Dutch',
  pol: 'Polish', pl: 'Polish',
  ron: 'Romanian', ro: 'Romanian', rum: 'Romanian',
  dan: 'Danish', da: 'Danish',
  swe: 'Swedish', sv: 'Swedish',
  nor: 'Norwegian', no: 'Norwegian',
  fin: 'Finnish', fi: 'Finnish',
  tur: 'Turkish', tr: 'Turkish',
  vie: 'Vietnamese', vi: 'Vietnamese',
  tha: 'Thai', th: 'Thai',
  ind: 'Indonesian', id: 'Indonesian',
  msa: 'Malay', ms: 'Malay', may: 'Malay',
  hrv: 'Croatian', hr: 'Croatian',
  srp: 'Serbian', sr: 'Serbian',
  ell: 'Greek', el: 'Greek', gre: 'Greek',
  heb: 'Hebrew', he: 'Hebrew',
  fas: 'Persian', fa: 'Persian', per: 'Persian',
  ukr: 'Ukrainian', uk: 'Ukrainian',
  ces: 'Czech', cs: 'Czech', cze: 'Czech',
  hun: 'Hungarian', hu: 'Hungarian',
  bul: 'Bulgarian', bg: 'Bulgarian',
  fil: 'Filipino', tl: 'Filipino',
};

export function getLanguageName(code) {
  if (!code) return 'Unknown';
  const clean = code.toLowerCase().trim();
  return LANG_MAP[clean] || code.toUpperCase();
}

/**
 * Converts standard SRT subtitle text into WebVTT format
 */
export function srtToVtt(srtText, offsetMs = 0) {
  if (!srtText) return 'WEBVTT\n\n';

  // If already WebVTT, just adjust offset if needed
  let text = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  // Strip existing WEBVTT header if present
  if (text.startsWith('WEBVTT')) {
    text = text.replace(/^WEBVTT[^\n]*\n+/g, '');
  }

  // Adjust timestamps with offset
  const timestampRegex = /(\d{2}:\d{2}:\d{2})[,.](\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2})[,.](\d{3})/g;

  function timeToMs(h, m, s, ms) {
    return parseInt(h, 10) * 3600000 + parseInt(m, 10) * 60000 + parseInt(s, 10) * 1000 + parseInt(ms, 10);
  }

  function msToVtt(totalMs) {
    const safe = Math.max(0, totalMs);
    const h = Math.floor(safe / 3600000).toString().padStart(2, '0');
    const m = Math.floor((safe % 3600000) / 60000).toString().padStart(2, '0');
    const s = Math.floor((safe % 60000) / 1000).toString().padStart(2, '0');
    const ms = Math.floor(safe % 1000).toString().padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
  }

  const converted = text.replace(timestampRegex, (match, h1, ms1, h2, ms2) => {
    // Note: regex capture groups:
    // match: "00:01:23,456 --> 00:01:25,789"
    const parts = match.split('-->').map(p => p.trim());
    const [t1, t2] = parts.map(part => {
      const [hms, ms] = part.split(/[,.]/);
      const [h, m, s] = hms.split(':');
      const msVal = timeToMs(h, m, s, ms) + offsetMs;
      return msToVtt(msVal);
    });
    return `${t1} --> ${t2}`;
  });

  return `WEBVTT\n\n${converted}`;
}

export function parseVttCues(vttText) {
  if (!vttText) return [];
  const cues = [];
  const clean = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = clean.split(/\n\s*\n/);

  function parseTime(tStr) {
    if (!tStr) return 0;
    const parts = tStr.trim().split(':');
    let h = 0, m = 0, s = 0;
    if (parts.length === 3) {
      h = parseFloat(parts[0]);
      m = parseFloat(parts[1]);
      s = parseFloat(parts[2].replace(',', '.'));
    } else if (parts.length === 2) {
      m = parseFloat(parts[0]);
      s = parseFloat(parts[1].replace(',', '.'));
    }
    return h * 3600 + m * 60 + s;
  }

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const timeLineIdx = lines.findIndex(l => l.includes('-->'));
    if (timeLineIdx >= 0) {
      const timePart = lines[timeLineIdx];
      const parts = timePart.split('-->');
      if (parts.length === 2) {
        const t1 = parts[0].trim().split(' ')[0];
        const t2 = parts[1].trim().split(' ')[0];
        const text = lines.slice(timeLineIdx + 1).join('<br>').trim();
        if (text) {
          cues.push({
            start: parseTime(t1),
            end: parseTime(t2),
            text,
          });
        }
      }
    }
  }
  return cues;
}

/**
 * Fetch subtitle text from a URL, create a WebVTT blob, and parse cues
 */
export async function loadSubtitleData(url, offsetMs = 0) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Subtitle HTTP ${res.status}`);
    const srtContent = await res.text();
    const vtt = srtToVtt(srtContent, offsetMs);
    const blob = new Blob([vtt], { type: 'text/vtt;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const cues = parseVttCues(vtt);
    return { blobUrl, vtt, cues };
  } catch (err) {
    console.warn('[Subtitles] Failed to load subtitle data:', url, err);
    return null;
  }
}

/**
 * Fetch subtitle text from a URL and create a Blob WebVTT track URL
 */
export async function createVttUrlFromRemote(url, offsetMs = 0) {
  const data = await loadSubtitleData(url, offsetMs);
  return data?.blobUrl || null;
}
