/**
 * Shared steps for turning an ordered list of songs into a Spotify playlist:
 * match each song, report the matches, then create the playlist and add tracks in order.
 */

export const MATCH_TYPE = {
  LIVE: 'LIVE',
  STUDIO: 'STUDIO',
  NO_MATCH: 'NO MATCH'
};

/**
 * Match songs to Spotify tracks, keeping setlist order
 * @param {Object} deps - { spotifyClient, matcher, logger }
 * @param {string} artistName - artist to match against
 * @param {Array<{name: string, note?: string}>} songs - songs in order
 * @returns {Promise<Array>} one result per song, with position, type and track details
 */
export async function matchSongs({ spotifyClient, matcher, logger }, artistName, songs) {
  const results = [];

  for (const [index, song] of songs.entries()) {
    let track = null;
    try {
      const candidates = await spotifyClient.searchTracks(artistName, song.name);
      track = matcher.findBestMatch(candidates, song.name, artistName);
    } catch (err) {
      logger.error(`Error matching song "${song.name}": ${err.message}`);
    }

    const type = !track ? MATCH_TYPE.NO_MATCH : matcher.isLive(track) ? MATCH_TYPE.LIVE : MATCH_TYPE.STUDIO;
    if (!track) {
      logger.warn(`No Spotify match found for: ${artistName} - ${song.name}`);
    }

    results.push({
      position: index + 1,
      song: song.name,
      note: song.note || '',
      type,
      trackName: track?.name || null,
      album: track?.album?.name || null,
      releaseDate: track?.album?.releaseDate || null,
      uri: track?.uri || null,
      url: track ? `https://open.spotify.com/track/${track.id}` : null
    });
  }

  return results;
}

/**
 * Count live, studio and unmatched results
 */
export function summariseMatches(results) {
  const count = type => results.filter(r => r.type === type).length;
  return {
    total: results.length,
    live: count(MATCH_TYPE.LIVE),
    studio: count(MATCH_TYPE.STUDIO),
    unmatched: count(MATCH_TYPE.NO_MATCH)
  };
}

function fit(text, width) {
  const value = text || '';
  return value.length > width ? `${value.slice(0, width - 3)}...` : value.padEnd(width);
}

/**
 * Format match results as a fixed-width text table
 * @returns {string} table text, one line per song plus header and summary
 */
export function formatMatchTable(results) {
  const columns = [
    ['#', 3, r => String(r.position).padStart(2)],
    ['Song', 34, r => r.song],
    ['Type', 8, r => r.type],
    ['Spotify track', 34, r => r.trackName],
    ['Album', 36, r => r.album],
    ['Year', 4, r => (r.releaseDate || '').slice(0, 4)]
  ];

  const row = values => values.map((v, i) => fit(v, columns[i][1])).join('  ').trimEnd();
  const lines = [
    row(columns.map(([title]) => title)),
    row(columns.map(([, width]) => '-'.repeat(width))),
    ...results.map(r => row(columns.map(([, , value]) => value(r))))
  ];

  const { total, live, studio, unmatched } = summariseMatches(results);
  lines.push('', `${total} songs: ${live} live, ${studio} studio, ${unmatched} not matched`);
  return lines.join('\n');
}

/**
 * Build the playlist title: "YYYYMMDD performer - predicted setlist"
 * @param {string} date - performance date as YYYYMMDD, e.g. "20261029"
 * @param {string} performer - band or artist name
 */
export function buildPlaylistTitle(date, performer) {
  return `${validatePerformanceDate(date)} ${validatePerformer(performer)} - predicted setlist`;
}

/**
 * Build the playlist description for a performer's upcoming show
 * @param {string} performer - band or artist name
 */
export function buildPlaylistDescription(performer) {
  return `The most likely setlist for ${validatePerformer(performer)} for their upcoming show.`;
}

/**
 * Check a performance date is a real calendar date written as YYYYMMDD
 * @returns {string} the date, unchanged
 */
export function validatePerformanceDate(date) {
  const value = String(date ?? '').trim();
  const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  const parsed = match && new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  if (!parsed || parsed.getUTCMonth() !== +match[2] - 1 || parsed.getUTCDate() !== +match[3]) {
    throw new Error(`Performance date must be a valid date as YYYYMMDD, e.g. 20261029 (got "${value}")`);
  }
  return value;
}

/**
 * Convert a setlist.fm event date (dd-MM-yyyy) to YYYYMMDD
 */
export function setlistDateToPerformanceDate(eventDate) {
  const match = String(eventDate ?? '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) {
    throw new Error(`Unrecognised setlist.fm event date "${eventDate}"`);
  }
  return validatePerformanceDate(`${match[3]}${match[2]}${match[1]}`);
}

function validatePerformer(performer) {
  const value = String(performer ?? '').trim();
  if (!value) {
    throw new Error('Performer is required');
  }
  return value;
}

/**
 * Create a playlist in the signed-in user's account and add matched tracks in order
 * @param {Object} deps - { spotifyClient, logger }
 * @param {string} userAccessToken - token from SpotifyAuth
 * @param {Object} options - { name, description, isPublic }
 * @param {Array} results - output of matchSongs
 * @returns {Promise<Object>} the created playlist with tracksAdded
 */
export async function createPlaylistFromMatches({ spotifyClient, logger }, userAccessToken, { name, description, isPublic }, results) {
  const uris = results.filter(r => r.uri).map(r => r.uri);
  if (uris.length === 0) {
    throw new Error('No matched tracks to add to a playlist');
  }

  const playlist = await spotifyClient.createPlaylist(userAccessToken, name, { isPublic, description });
  const added = await spotifyClient.addTracksToPlaylist(userAccessToken, playlist.id, uris);
  logger.info(`Added ${added.tracksAdded} track(s) to "${playlist.name}"`);

  return { ...playlist, tracksAdded: added.tracksAdded };
}
