import { MusicBrainzClient } from '../services/musicBrainzClient.js';
import { SetlistFmClient } from '../services/setlistFmClient.js';
import { SpotifyClient } from '../services/spotifyClient.js';
import { SpotifyMatcher } from '../services/spotifyMatcher.js';
import { parseSetlistSongs } from '../services/setlistParser.js';
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
  if (!data.setlist || data.setlist.length === 0) {
    logger.info('No setlists found.');
    return;
  }

  logger.info(`Found ${data.setlist.length} setlist(s):`);
  
  data.setlist.forEach((setlist, index) => {
    const eventDate = setlist.eventDate || 'Date unknown';
    const venueName = setlist.venue?.name || 'Unknown venue';
    const city = setlist.venue?.city?.name || 'Unknown city';
    const country = setlist.venue?.city?.country?.name || 'Unknown country';
    logger.info(`${index + 1}. ${eventDate} Venue: ${venueName}, ${city}, ${country} Setlist ID: ${setlist.id}`);
  });
  // TODO extract user choice when more than one setlist
  return data.setlist[0].id;
}

export async function setlist() {
  const rl = createReadlineInterface();

  try {
    const artistName = await prompt(rl, `\nEnter artist name: `);

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
    const mostRecentMatchingSetlist = displaySetlists(setlistData);

    if (mostRecentMatchingSetlist) {
      logger.info(`Most recent matching setlist ID: ${mostRecentMatchingSetlist}`);
      try {
        const setlistResponse = await setlistClient.getSetlist(mostRecentMatchingSetlist);

        if (setlistResponse) {
          displaySetlist(setlistResponse);
          await findSpotifySongs(setlistResponse);
        } else {
          logger.info(`No setlist content for ID: ${mostRecentMatchingSetlist}`);
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
    return;
  }

  const artistName = setlistResponse.artist?.name || 'Unknown Artist';
  const venueName = setlistResponse.venue?.name || 'Unknown Venue';
  const cityName = setlistResponse.venue?.city?.name || 'Unknown City';
  const countryName = setlistResponse.venue?.city?.country?.name || 'Unknown Country';
  const eventDate = setlistResponse.eventDate || 'Unknown Date';
  const setlistId = setlistResponse.id || 'Unknown ID';
  const url = setlistResponse.url || '';

  logger.info(`${artistName} @ ${venueName}, ${cityName} ${countryName} on ${eventDate} (ID: ${setlistId} ${url})`);
  console.log(JSON.stringify(setlistResponse, null, 2))
}

async function findSpotifySongs(setlistResponse) {
  if (!spotifyClient) {
    logger.warn('Spotify client not available, skipping song matching');
    return;
  }

  try {
    logger.info('\\nMatching setlist songs with Spotify...');
    const songs = parseSetlistSongs(setlistResponse);
    
    if (songs.length === 0) {
      logger.info('No songs found to match');
      return;
    }

    logger.info(`Found ${songs.length} song(s) in setlist\\n`);

    const playlistData = [];
    let matched = 0;
    let unmatched = 0;
    let tapeSkipped = 0;

    for (const song of songs) {
      if (song.isTape) {
        logger.debug(`Skipping tape: ${song.songName}`);
        tapeSkipped++;
        continue;
      }

      try {
        const spotifyTracks = await spotifyClient.searchTracks(song.artistName, song.songName);
        const bestMatch = spotifyMatcher.findBestMatch(spotifyTracks, song.songName, song.artistName);

        if (bestMatch) {
          const playlistEntry = {
            songName: song.songName,
            artistName: song.artistName,
            setNumber: song.setNumber,
            isEncoreSet: song.isEncoreSet,
            spotifyId: bestMatch.id,
            spotifyUri: bestMatch.uri,
            spotifyName: bestMatch.name,
            album: bestMatch.album.name,
            releaseDate: bestMatch.album.releaseDate,
            popularity: bestMatch.popularity,
            explicit: bestMatch.explicit
          };
          playlistData.push(playlistEntry);
          matched++;

          logger.info(
            `✓ ${song.songName} | Album: ${bestMatch.album.name} | ` +
            `Released: ${bestMatch.album.releaseDate} | Spotify ID: ${bestMatch.id}`
          );
        } else {
          unmatched++;
          logger.warn(`✗ No Spotify match found for: ${song.artistName} - ${song.songName}`);
        }
      } catch (err) {
        unmatched++;
        logger.error(`Error matching song "${song.songName}": ${err.message}`);
      }
    }

    logger.info(
      `\\n--- Summary ---\\n` +
      `Total songs: ${songs.length} | ` +
      `Matched: ${matched} | ` +
      `Unmatched: ${unmatched}` +
      (tapeSkipped > 0 ? ` | Tapes skipped: ${tapeSkipped}` : '')
    );

    return playlistData;
  } catch (err) {
    logger.error(`Failed to match Spotify songs: ${err.message}`);
  }
}
