import { MusicBrainzClient } from '../services/musicBrainzClient.js';
import { SetlistFmClient } from '../services/setlistFmClient.js';
import { SpotifyClient } from '../services/spotifyClient.js';
import { SpotifyMatcher } from '../services/spotifyMatcher.js';
import { parseSetlistSongs } from '../services/setlistParser.js';
import { SpotifyAuth } from '../services/spotifyAuth.js';
import {
  matchSongs,
  formatMatchTable,
  buildPlaylistTitle,
  buildPlaylistDescription,
  setlistDateToPerformanceDate,
  createPlaylistFromMatches
} from '../services/playlistBuilder.js';
import { Logger } from '../services/logger.js';
import readline from 'readline';

const logger = new Logger();
const mbClient = new MusicBrainzClient(logger);
const setlistClient = new SetlistFmClient(logger);
let spotifyClient;
try {
  spotifyClient = new SpotifyClient(logger);
} catch (err) {
  logger.warn(`Spotify client initialization failed: ${err.message}`);
}
const spotifyMatcher = new SpotifyMatcher(logger);

async function createPlaylistForSetlist(setlistResponse, rl) {
  if (!spotifyClient) {
    logger.warn('Spotify client not available, skipping song matching');
    return;
  }

  try {
    await buildSetlistPlaylist(setlistResponse, {
      logger,
      spotifyClient,
      matcher: spotifyMatcher,
      auth: new SpotifyAuth(logger),
      output: (text) => console.log(text),
      // Close the prompt once answered so Spotify sign-in can read the terminal if needed
      confirm: async (question) => {
        const answer = await prompt(rl, question);
        rl.close();
        return answer;
      }
    });
  } catch (err) {
    logger.error(`Failed to create Spotify playlist: ${err.message}`);
  }
}

function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function getArtistMBID(artistName) {
  logger.info(`Searching for artist: ${artistName}`);
  const result = await mbClient.searchArtist(artistName);

  if (!result) {
    logger.info(`No results found for artist: ${artistName}`);
    return null;
  }

  logger.info(`Selected ${artistName} MBID: ${result.mbid}`);

  return result;
}

async function getCity(rl) {
  const city = await prompt(rl, `Enter a city (optional): `);
  logger.debug(`City provided: ${city? city : 'None'}`);
  return city;
}

async function searchSetlists(mbid, city) {
  return setlistClient.searchSetlistsByArtist(mbid, city);
}

function displaySetlists(data) {
  const setlistIDs = [];
  if (!data.setlist || data.setlist.length === 0) {
    logger.info('No setlists found.');
    return setlistIDs;
  }

  logger.info(`Found ${data.setlist.length} setlist(s):`);
  
  data.setlist.forEach((setlist, index) => {
    const eventDate = setlist.eventDate || 'Date unknown';
    const venueName = setlist.venue?.name || 'Unknown venue';
    const city = setlist.venue?.city?.name || 'Unknown city';
    const country = setlist.venue?.city?.country?.name || 'Unknown country';
    logger.info(`${index + 1}. ${eventDate} Venue: ${venueName}, ${city}, ${country} Setlist ID: ${setlist.id}`);
    setlistIDs.push(setlist.id);
  });
  return setlistIDs;
}

export async function setlist() {
  const rl = createReadlineInterface();

  try {
    const artistName = await prompt(rl, `Enter artist name: `);

    if (!artistName) {
      logger.warn('Artist name cannot be empty');
      rl.close();
      return;
    }

    const artist = await getArtistMBID(artistName);

    if (!(artist && artist.mbid)) {
      logger.info(`No MBID found for ${artistName}, exiting.`);
      rl.close();
      return;
    }

    const city = await getCity(rl);

    const setlistData = await searchSetlists(artist.mbid, city);
    const matchingSetlists = displaySetlists(setlistData);

    //TODO offer option to select from multiple setlists if more than one found; or choose; or most recent with songs; or...
    if (matchingSetlists && matchingSetlists.length > 0) {
      try {
        const setlistResponse = await setlistClient.getSetlist(matchingSetlists[0]);

        if (setlistResponse) {
          displaySetlist(setlistResponse);
          await createPlaylistForSetlist(setlistResponse, rl);
        } else {
          logger.info(`No setlist content for ID: ${matchingSetlists}`);
        }
      } catch (err) {
        logger.error(`Failed to fetch setlist details: ${err.message}`);
      }
    }

  } catch (error) {
    logger.error(`Setlist command error: ${error.message}`);
    process.exit(1);
  } finally {
    rl.close();
  }
}

function displaySetlist(setlistResponse) {
  if(!setlistResponse) {
    logger.error('No setlist response to display.');
    return null;
  }

  const artistName = setlistResponse.artist?.name || 'Unknown Artist';
  const venueName = setlistResponse.venue?.name || 'Unknown Venue';
  const cityName = setlistResponse.venue?.city?.name || 'Unknown City';
  const countryName = setlistResponse.venue?.city?.country?.name || 'Unknown Country';
  const eventDate = setlistResponse.eventDate || 'Unknown Date';
  const setlistId = setlistResponse.id || 'Unknown ID';
  const url = setlistResponse.url || '';
  const summary = `${artistName} @ ${venueName}, ${cityName} ${countryName} on ${eventDate} (ID: ${setlistId} ${url})`;

  logger.info(summary);
  return summary;
}

/**
 * Match a setlist's songs to Spotify, print the matches and, if confirmed, create a playlist
 * in the signed-in user's account titled "YYYYMMDD performer - predicted setlist".
 * @param {Object} setlistResponse - setlist from setlist.fm
 * @param {Object} deps - { logger, spotifyClient, matcher, auth, output, confirm }
 * @returns {Promise<Object|null>} { results, playlist } or null when nothing was matched
 */
export async function buildSetlistPlaylist(setlistResponse, deps) {
  const { logger } = deps;
  const performer = setlistResponse.artist?.name;
  const name = buildPlaylistTitle(setlistDateToPerformanceDate(setlistResponse.eventDate), performer);
  const description = buildPlaylistDescription(performer);

  const parsed = parseSetlistSongs(setlistResponse);
  const songs = parsed.filter(song => !song.isTape);
  const tapesSkipped = parsed.length - songs.length;
  if (tapesSkipped > 0) {
    logger.debug(`Skipping ${tapesSkipped} tape(s)`);
  }

  if (songs.length === 0) {
    logger.info('No songs found to match');
    return null;
  }

  logger.info(`Matching ${songs.length} setlist song(s) with Spotify...`);
  const results = await matchSongs(deps, performer, songs.map(song => ({
    name: song.songName,
    note: song.isEncoreSet ? 'encore' : ''
  })));
  deps.output(`\n${formatMatchTable(results)}\n`);

  if (!results.some(result => result.uri)) {
    logger.warn('No songs matched on Spotify, so no playlist can be created');
    return { results, playlist: null };
  }

  const answer = await deps.confirm(`Create Spotify playlist "${name}"? (y/N): `);
  if (!/^y(es)?$/i.test(answer || '')) {
    logger.info('Skipping playlist creation');
    return { results, playlist: null };
  }

  const userAccessToken = await deps.auth.getUserAccessToken();
  const created = await createPlaylistFromMatches(deps, userAccessToken, { name, description, isPublic: true }, results);
  logger.info(`Playlist "${created.name}" created with ${created.tracksAdded} track(s)`);
  logger.info(`URL: ${created.externalUrl}`);
  return { results, playlist: created };
}
