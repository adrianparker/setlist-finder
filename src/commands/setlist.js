import { MusicBrainzClient } from '../services/musicBrainzClient.js';
import { Logger } from '../services/logger.js';
import readline from 'readline';

const logger = new Logger();
const mbClient = new MusicBrainzClient(logger);

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
    console.log(`\n✗ No artist found matching "${artistName}"\n`);
    logger.info(`No results found for artist: ${artistName}`);
    return null;
  }

  console.log(`\n✓ Found artist: ${result.name}`);
  console.log(`  MBID: ${result.mbid}\n`);
  logger.info(`Successfully found artist MBID: ${result.mbid}`);

  return result;
}

async function getLocation(rl) {
  const location = await prompt(rl, 'Enter a location (optional): ');

  if (location) {
    console.log(`\n✓ Location: ${location}\n`);
    logger.info(`Location provided: ${location}`);
  } else {
    console.log('\n✓ No location specified\n');
    logger.info('No location provided');
  }

  return location;
}

export async function setlist() {
  const rl = createReadlineInterface();

  try {
    const artistName = await prompt(rl, '\n🎵 Enter artist name: ');

    if (!artistName) {
      console.log('\n✗ Artist name cannot be empty\n');
      rl.close();
      return;
    }

    const artist = await getArtistMBID(rl, artistName);

    if (!artist) {
      rl.close();
      return;
    }

    await getLocation(rl);
  } catch (error) {
    logger.error(`Setlist command error: ${error.message}`);
    console.error(`\n✗ Error: ${error.message}\n`);
    process.exit(1);
  } finally {
    rl.close();
  }
}