const DEFAULT_TMDB_READ_ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIwNTdiN2I0YTQ0N2FlNWZkMWE2NzgzNWQ0MGUxMGJmMiIsIm5iZiI6MTc3NjYwOTMxMS4zMTksInN1YiI6IjY5ZTRlODFmMTU5NzQ3MGJiMWQyOTY2YSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.29ZSdmJgeCH7M_8HJ_Yt1mvg7apqnlZEPI4Ly2EgN34';
const DEFAULT_TMDB_API_KEY = '057b7b4a447ae5fd1a67835d40e10bf2';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

export function getTmdbApiKey() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem('hp-tmdb-api-key') || DEFAULT_TMDB_API_KEY;
  }
  return DEFAULT_TMDB_API_KEY;
}

export function getTmdbToken() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem('hp-tmdb-token') || DEFAULT_TMDB_READ_ACCESS_TOKEN;
  }
  return DEFAULT_TMDB_READ_ACCESS_TOKEN;
}

export function setTmdbApiKey(key, token) {
  if (typeof window !== 'undefined' && window.localStorage) {
    if (!key || !key.trim()) {
      localStorage.removeItem('hp-tmdb-api-key');
    } else {
      localStorage.setItem('hp-tmdb-api-key', key.trim());
    }

    if (!token || !token.trim()) {
      localStorage.removeItem('hp-tmdb-token');
    } else {
      localStorage.setItem('hp-tmdb-token', token.trim());
    }
  }
}

function getAuthHeaders() {
  const token = getTmdbToken();
  const headers = { 'Accept': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Look up TMDB data by IMDb ID (e.g. "tt0120338") or TMDB ID
 */
export async function enrichMediaWithTmdb(mediaMeta) {
  if (!mediaMeta) return null;

  const apiKey = getTmdbApiKey();
  const headers = getAuthHeaders();
  const imdbId = mediaMeta.id;
  const isImdb = typeof imdbId === 'string' && imdbId.startsWith('tt');
  const type = mediaMeta.type === 'series' || mediaMeta.type === 'tv' ? 'tv' : 'movie';

  try {
    let tmdbResult = null;
    let tmdbType = type;

    if (isImdb) {
      // Find TMDB ID from IMDb ID
      const findUrl = `${TMDB_BASE_URL}/find/${encodeURIComponent(imdbId)}?external_source=imdb_id&api_key=${apiKey}`;
      const findRes = await fetch(findUrl, { headers });
      if (!findRes.ok) throw new Error(`TMDB find failed: ${findRes.status}`);
      const findData = await findRes.json();

      if (findData.movie_results?.length > 0) {
        tmdbResult = findData.movie_results[0];
        tmdbType = 'movie';
      } else if (findData.tv_results?.length > 0) {
        tmdbResult = findData.tv_results[0];
        tmdbType = 'tv';
      } else if (findData.tv_episode_results?.length > 0) {
        tmdbResult = findData.tv_episode_results[0];
        tmdbType = 'tv_episode';
      }
    }

    if (!tmdbResult && !isImdb && !isNaN(imdbId)) {
      // Direct TMDB ID lookup
      const detailsUrl = `${TMDB_BASE_URL}/${type}/${imdbId}?api_key=${apiKey}&append_to_response=credits`;
      const res = await fetch(detailsUrl, { headers });
      if (res.ok) {
        tmdbResult = await res.json();
      }
    }

    if (!tmdbResult) {
      return mediaMeta;
    }

    // Fetch full details for richer data (tagline, runtime, genres, backdrops)
    let fullDetails = tmdbResult;
    if (tmdbResult.id && tmdbType !== 'tv_episode') {
      try {
        const detailUrl = `${TMDB_BASE_URL}/${tmdbType}/${tmdbResult.id}?api_key=${apiKey}&append_to_response=credits`;
        const detailRes = await fetch(detailUrl, { headers });
        if (detailRes.ok) {
          fullDetails = await detailRes.json();
        }
      } catch {}
    }

    // If TV show with specific season & episode, fetch episode details
    let episodeDetails = null;
    if (tmdbType === 'tv' && mediaMeta.season && mediaMeta.episode) {
      try {
        const epUrl = `${TMDB_BASE_URL}/tv/${tmdbResult.id}/season/${mediaMeta.season}/episode/${mediaMeta.episode}?api_key=${apiKey}`;
        const epRes = await fetch(epUrl, { headers });
        if (epRes.ok) {
          episodeDetails = await epRes.json();
        }
      } catch {}
    }

    const backdropPath = episodeDetails?.still_path || fullDetails.backdrop_path || fullDetails.poster_path;
    const posterPath = fullDetails.poster_path || fullDetails.backdrop_path;

    const runtimeMinutes = fullDetails.runtime || (fullDetails.episode_run_time ? fullDetails.episode_run_time[0] : null);
    const runtimeFormatted = runtimeMinutes ? `${Math.floor(runtimeMinutes / 60)}h ${runtimeMinutes % 60}m` : null;

    return {
      ...mediaMeta,
      title: fullDetails.title || fullDetails.name || mediaMeta.title,
      tagline: fullDetails.tagline || null,
      description: episodeDetails?.overview || fullDetails.overview || mediaMeta.description || '',
      year: (fullDetails.release_date || fullDetails.first_air_date || '').slice(0, 4) || mediaMeta.year,
      rating: fullDetails.vote_average ? fullDetails.vote_average.toFixed(1) : null,
      runtime: runtimeFormatted,
      genres: fullDetails.genres ? fullDetails.genres.map(g => g.name) : (mediaMeta.genres || []),
      poster: posterPath ? `${IMAGE_BASE_URL}/w500${posterPath}` : mediaMeta.poster,
      backdrop: backdropPath ? `${IMAGE_BASE_URL}/original${backdropPath}` : null,
      episodeTitle: episodeDetails?.name ? `S${mediaMeta.season}E${mediaMeta.episode} - ${episodeDetails.name}` : mediaMeta.episodeTitle,
    };
  } catch (err) {
    console.warn('[TMDB] Enrichment failed, falling back to standard metadata:', err);
    return mediaMeta;
  }
}
