import { MusicBrainzClient } from '../services/musicBrainzClient.js';
import { SetlistFmClient } from '../services/setlistFmClient.js';
import { Logger } from '../services/logger.js';
import readline from 'readline';

const logger = new Logger();
const mbClient = new MusicBrainzClient(logger);
const setlistClient = new SetlistFmClient(logger);

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
  const city = await prompt(rl, 'Enter a city (optional): ');
  logger.info(`City provided: ${city? city : 'None'}`);
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
    const artistName = await prompt(rl, '\nEnter artist name: ');

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
          // TODO replace with formatted output
          console.log(JSON.stringify(setlistResponse, null, 2));
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