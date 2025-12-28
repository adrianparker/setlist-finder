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

async function getArtistMBID(rl, artistName) {
  logger.info(`Setlist command: Searching for artist: ${artistName}`);
  const result = await mbClient.searchArtist(artistName);

  if (!result) {
    console.log(`\nNo artist found matching "${artistName}"\n`);
    logger.info(`No results found for artist: ${artistName}`);
    return null;
  }

  console.log(`\nFound artist: ${result.name}`);
  console.log(`  MBID: ${result.mbid}\n`);
  logger.info(`Successfully found artist MBID: ${result.mbid}`);

  return result;
}

async function getCity(rl) {
  const city = await prompt(rl, 'Enter a city (optional): ');

  if (city) {
    console.log(`\nCity: ${city}\n`);
    logger.info(`City provided: ${city}`);
  } else {
    console.log('\nNo city specified\n');
    logger.info('No city provided');
  }

  return city;
}

async function searchSetlists(mbid, city) {
  return setlistClient.searchSetlistsByArtist(mbid, city);
}

function displaySetlists(data) {
  if (!data.setlist || data.setlist.length === 0) {
    console.log('No setlists found.\n');
    return;
  }

  console.log(`Found ${data.setlist.length} setlist(s):\n`);
  
  data.setlist.forEach((setlist, index) => {
    const eventDate = setlist.eventDate || 'Date unknown';
    const venueName = setlist.venue?.name || 'Unknown venue';
    const city = setlist.venue?.city?.name || 'Unknown city';
    const country = setlist.venue?.city?.country?.name || 'Unknown country';
    
    console.log(`${index + 1}. ${eventDate}`);
    console.log(`   Venue: ${venueName}, ${city}, ${country}`);
    console.log(`   Setlist ID: ${setlist.id}\n`);
  });
  return data.setlist[0].id;
}

export async function setlist() {
  const rl = createReadlineInterface();

  try {
    const artistName = await prompt(rl, '\nEnter artist name: ');

    if (!artistName) {
      console.log('\nArtist name cannot be empty\n');
      rl.close();
      return;
    }

    const artist = await getArtistMBID(rl, artistName);

    if (!artist) {
      rl.close();
      return;
    }

    const city = await getCity(rl);

    const setlistData = await searchSetlists(artist.mbid, city);
    const mostRecentMatchingSetlist = displaySetlists(setlistData);

    if (mostRecentMatchingSetlist) {
      console.log(`Most recent matching setlist ID: ${mostRecentMatchingSetlist}`);
      try {
        const setlistResponse = await setlistClient.getSetlist(mostRecentMatchingSetlist);

        if (setlistResponse) {
          console.log('\nSetlist content:\n');
          console.log(JSON.stringify(setlistResponse, null, 2));
          logger.info(`Fetched setlist details for ID: ${mostRecentMatchingSetlist}`);
        } else {
          console.log('\nNo setlist content returned from getSetlist\n');
          logger.info(`No setlist content for ID: ${mostRecentMatchingSetlist}`);
        }
      } catch (err) {
        logger.error(`Failed to fetch setlist details: ${err.message}`);
        console.error(`\nError fetching setlist details: ${err.message}\n`);
      }
    }

    logger.info('Setlist search completed successfully');
  } catch (error) {
    logger.error(`Setlist command error: ${error.message}`);
    console.error(`\nError: ${error.message}\n`);
    process.exit(1);
  } finally {
    rl.close();
  }
}