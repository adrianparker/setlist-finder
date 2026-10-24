import { MusicBrainzClient } from '../services/musicBrainzClient.js';
import { SetlistFmClient } from '../services/setlistFmClient.js';
import { SpotifyClient } from '../services/spotifyClient.js';
import { SpotifyAuth } from '../services/spotifyAuth.js';
import { SpotifyMatcher } from '../services/spotifyMatcher.js';
import { Logger } from '../services/logger.js';
import { findSourceSetlists, predictSetlist, DEFAULT_SOURCE_SHOWS } from '../services/setlistPredictor.js';
import {
  matchSongs,
  formatMatchTable,
  buildPlaylistTitle,
  buildPlaylistDescription,
  validatePerformanceDate,
  saveShowPlaylist
} from '../services/playlistBuilder.js';

function createDefaultDeps() {
  const logger = new Logger();
  return {
    logger,
    mbClient: new MusicBrainzClient(logger),
    setlistClient: new SetlistFmClient(logger),
    spotifyClient: new SpotifyClient(logger),
    matcher: new SpotifyMatcher(logger),
    auth: new SpotifyAuth(logger),
    output: (text) => console.log(text)
  };
}

/**
 * Today's date on this computer as YYYYMMDD
 */
export function localToday() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

function parseShowCount(value) {
  if (value === undefined) return DEFAULT_SOURCE_SHOWS;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`--shows must be a whole number of at least 1 (got "${value}")`);
  }
  return count;
}

/**
 * Create or update the one Spotify playlist for a show. For today or a future date the
 * setlist is predicted from the performer's most recent earlier setlists on setlist.fm.
 * @param {Object} options - { performer, date, shows, private, dryRun } from Commander
 * @param {Object} deps - injected services, for testing
 * @returns {Promise<Object|null>} { prediction, results, saved } or null on failure
 */
export async function gig(options, deps) {
  let logger = deps?.logger;
  try {
    deps = deps || createDefaultDeps();
    logger = deps.logger;

    const date = validatePerformanceDate(options.date);
    const name = buildPlaylistTitle(date, options.performer);
    const description = buildPlaylistDescription(options.performer);
    const performer = options.performer.trim();
    const showCount = parseShowCount(options.shows);
    const today = deps.today || localToday();

    if (date < today) {
      throw new Error(`${date} is in the past; actual setlists are not supported yet`);
    }

    // Sign in before the slower setlist.fm calls so a sign-in problem shows up straight away
    const userAccessToken = options.dryRun ? null : await deps.auth.getUserAccessToken();

    const artist = await deps.mbClient.searchArtist(performer);
    if (!artist?.mbid) {
      throw new Error(`No artist found for "${performer}"`);
    }

    const setlists = await findSourceSetlists(deps, artist.mbid, date, showCount);
    if (setlists.length === 0) {
      throw new Error(`No setlists with songs found for ${artist.name} before ${date}`);
    }

    const prediction = predictSetlist(setlists);
    logger.info(`Predicting from ${prediction.showCount} show(s): ` +
      prediction.sources.map(s => `${s.eventDate} ${s.venue}, ${s.city} (${s.songCount} songs)`).join('; '));

    // Search Spotify under setlist.fm's spelling of the artist, which matches Spotify's more often than typed input
    const spotifyArtist = setlists[0].artist?.name || artist.name;
    logger.info(`Matching ${prediction.songs.length} song(s) with Spotify...`);
    const results = await matchSongs(deps, spotifyArtist, prediction.songs);
    deps.output(`\n${formatMatchTable(results)}\n`);

    if (options.dryRun) {
      logger.info(`Dry run: no playlist created or changed. Title would be "${name}"; description "${description}"`);
      return { prediction, results, saved: null };
    }

    const saved = await saveShowPlaylist(deps, userAccessToken, {
      date,
      performer,
      name,
      description,
      // On update, only change visibility when --private is given
      isPublic: options.private ? false : undefined
    }, results);

    const summary = {
      created: `Playlist "${saved.playlist.name}" created with ${saved.playlist.tracksAdded} track(s)`,
      updated: `Playlist "${saved.playlist.name}" updated (${saved.changes.join(' and ')} changed)`,
      unchanged: `Playlist "${saved.playlist.name}" is already up to date`
    };
    logger.info(summary[saved.action]);
    logger.info(`URL: ${saved.playlist.externalUrl}`);
    return { prediction, results, saved };
  } catch (error) {
    (logger || console).error(`Gig command error: ${error.message}`);
    process.exitCode = 1;
    return null;
  }
}
