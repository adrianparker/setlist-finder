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

async function getLocation(rl) {
  const location = await prompt(rl, 'Enter a location (optional): ');

  if (location) {
    console.log(`\nLocation: ${location}\n`);
    logger.info(`Location provided: ${location}`);
  } else {
    console.log('\nNo location specified\n');
    logger.info('No location provided');
  }

  return location;
}

async function searchSetlists(mbid, location) {
  return setlistClient.searchSetlistsByArtist(mbid, location);
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

    const location = await getLocation(rl);

    const setlistData = await searchSetlists(artist.mbid, location);
    displaySetlists(setlistData);

    logger.info('Setlist search completed successfully');
  } catch (error) {
    logger.error(`Setlist command error: ${error.message}`);
    console.error(`\nError: ${error.message}\n`);
    process.exit(1);
  } finally {
    rl.close();
  }
}