import { SpotifyClient } from '../services/spotifyClient.js';
import { SpotifyAuth } from '../services/spotifyAuth.js';
import { SpotifyMatcher } from '../services/spotifyMatcher.js';
import { Logger } from '../services/logger.js';
import { loadSongList } from '../services/songList.js';
import {
  matchSongs,
  formatMatchTable,
  buildPlaylistTitle,
  buildPlaylistDescription,
  createPlaylistFromMatches
} from '../services/playlistBuilder.js';

function createDefaultDeps() {
  const logger = new Logger();
  return {
    logger,
    spotifyClient: new SpotifyClient(logger),
    matcher: new SpotifyMatcher(logger),
    auth: new SpotifyAuth(logger),
    output: (text) => console.log(text)
  };
}

/**
 * Build a Spotify playlist from a song-list file, in the file's order.
 * @param {Object} options - { file, date, performer, private, dryRun } from Commander
 * @param {Object} deps - injected services, for testing
 * @returns {Promise<Object|null>} { results, playlist } or null on failure
 */
export async function playlist(options, deps) {
  let logger = deps?.logger;
  try {
    deps = deps || createDefaultDeps();
    logger = deps.logger;

    // Build the title and description first so bad arguments fail before any API call
    const name = buildPlaylistTitle(options.date, options.performer);
    const description = buildPlaylistDescription(options.performer);
    const songList = loadSongList(options.file);
    const isPublic = !options.private;
    logger.info(`Loaded ${songList.songs.length} song(s) by ${songList.artist} from ${options.file}`);

    // Sign in before matching so a sign-in problem shows up straight away
    const userAccessToken = options.dryRun ? null : await deps.auth.getUserAccessToken();

    logger.info('Matching songs with Spotify...');
    const results = await matchSongs(deps, songList.artist, songList.songs);
    deps.output(`\n${formatMatchTable(results)}\n`);

    if (options.dryRun) {
      logger.info(`Dry run: no playlist created. Title would be "${name}"; description "${description}"`);
      return { results, playlist: null };
    }

    const created = await createPlaylistFromMatches(deps, userAccessToken, {
      name,
      description,
      isPublic
    }, results);

    logger.info(`Playlist "${created.name}" created (${isPublic ? 'public' : 'private'}) with ${created.tracksAdded} track(s)`);
    logger.info(`URL: ${created.externalUrl}`);
    return { results, playlist: created };
  } catch (error) {
    (logger || console).error(`Playlist command error: ${error.message}`);
    process.exitCode = 1;
    return null;
  }
}
