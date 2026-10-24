import { MusicBrainzClient } from '../services/musicBrainzClient.js';
import { SetlistFmClient } from '../services/setlistFmClient.js';
import { SpotifyClient } from '../services/spotifyClient.js';
import { SpotifyAuth } from '../services/spotifyAuth.js';
import { SpotifyMatcher } from '../services/spotifyMatcher.js';
import { Logger } from '../services/logger.js';
import { findSourceSetlists, predictSetlist, DEFAULT_SOURCE_SHOWS } from '../services/setlistPredictor.js';
import { findShowSetlist } from '../services/showSetlist.js';
import { parseSetlistSongs } from '../services/setlistParser.js';
import {
  matchSongs,
  formatMatchTable,
  buildPlaylistTitle,
  buildPlaylistDescription,
  buildActualDescription,
  validatePerformanceDate,
  findShowPlaylist,
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
 * Plan a predicted setlist from the performer's most recent setlists before the show
 * @private
 */
async function planPrediction(deps, artist, performer, date, showCount) {
  const setlists = await findSourceSetlists(deps, artist.mbid, date, showCount);
  if (setlists.length === 0) {
    throw new Error(`No setlists with songs found for ${artist.name} before ${date}`);
  }

  const prediction = predictSetlist(setlists);
  deps.logger.info(`Predicting from ${prediction.showCount} show(s): ` +
    prediction.sources.map(s => `${s.eventDate} ${s.venue}, ${s.city} (${s.songCount} songs)`).join('; '));

  return {
    kind: 'predicted',
    name: buildPlaylistTitle(date, performer, 'predicted'),
    description: buildPlaylistDescription(performer),
    // setlist.fm's spelling of the artist matches Spotify's more often than typed input
    spotifyArtist: setlists[0].artist?.name || artist.name,
    songs: prediction.songs,
    prediction
  };
}

/**
 * Plan the setlist actually played, in the order played
 * @private
 */
function planActual(setlist, performer, date) {
  const songs = parseSetlistSongs(setlist)
    .filter(song => !song.isTape)
    .map(song => ({ name: song.songName, note: song.isEncoreSet ? 'encore' : '' }));

  return {
    kind: 'actual',
    name: buildPlaylistTitle(date, performer, 'actual'),
    description: buildActualDescription(performer, setlist.venue?.name, setlist.venue?.city?.name, date),
    spotifyArtist: setlist.artist?.name || performer,
    songs,
    setlist
  };
}

/**
 * Create or update the one Spotify playlist for a show, keeping its Spotify ID throughout.
 * Today or a future date: the setlist is predicted from the performer's most recent earlier
 * setlists. A past date: the setlist actually played, from setlist.fm; until one is posted,
 * the existing playlist is kept (or a prediction is created if there is none).
 * @param {Object} options - { performer, date, city, shows, private, dryRun } from Commander
 * @param {Object} deps - injected services, for testing
 * @returns {Promise<Object|null>} { kind, prediction, results, saved } or null on failure
 */
export async function gig(options, deps) {
  let logger = deps?.logger;
  try {
    deps = deps || createDefaultDeps();
    logger = deps.logger;

    const date = validatePerformanceDate(options.date);
    // Validates the performer before any API call
    buildPlaylistTitle(date, options.performer);
    const performer = options.performer.trim();
    const showCount = parseShowCount(options.shows);
    const today = deps.today || localToday();
    const isPast = date < today;

    // Sign in before the slower setlist.fm calls so a sign-in problem shows up straight away
    const userAccessToken = options.dryRun ? null : await deps.auth.getUserAccessToken();

    const artist = await deps.mbClient.searchArtist(performer);
    if (!artist?.mbid) {
      throw new Error(`No artist found for "${performer}"`);
    }

    let plan;
    if (isPast) {
      const setlist = await findShowSetlist(deps, artist.mbid, date, options.city);
      if (setlist) {
        logger.info(`Using the setlist from ${setlist.eventDate} at ${setlist.venue?.name}, ${setlist.venue?.city?.name}`);
        plan = planActual(setlist, performer, date);
      } else {
        logger.info('No setlist has been posted on setlist.fm for this show yet; try again later.');
        if (!options.dryRun) {
          const existing = await findShowPlaylist(deps, userAccessToken, { date, performer });
          if (existing) {
            logger.info(`Keeping playlist "${existing.name}" unchanged`);
            logger.info(`URL: ${existing.externalUrl}`);
            return { kind: 'existing', prediction: null, results: null, saved: { action: 'unchanged', changes: [], playlist: existing } };
          }
        }
      }
    }
    plan = plan || await planPrediction(deps, artist, performer, date, showCount);

    logger.info(`Matching ${plan.songs.length} song(s) with Spotify...`);
    const results = await matchSongs(deps, plan.spotifyArtist, plan.songs);
    deps.output(`\n${formatMatchTable(results)}\n`);

    if (options.dryRun) {
      logger.info(`Dry run: no playlist created or changed. Title would be "${plan.name}"; description "${plan.description}"`);
      return { kind: plan.kind, prediction: plan.prediction || null, results, saved: null };
    }

    const saved = await saveShowPlaylist(deps, userAccessToken, {
      date,
      performer,
      name: plan.name,
      description: plan.description,
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
    return { kind: plan.kind, prediction: plan.prediction || null, results, saved };
  } catch (error) {
    (logger || console).error(`Gig command error: ${error.message}`);
    process.exitCode = 1;
    return null;
  }
}
