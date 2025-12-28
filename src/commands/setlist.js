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

export async function setlist() {
  const rl = createReadlineInterface();

  try {
    const artistName = await prompt(rl, '\n🎵 Enter artist name: ');

    if (!artistName) {
      console.log('\n✗ Artist name cannot be empty\n');
      rl.close();
      return;
    }

    logger.info(`Setlist command: Searching for artist: ${artistName}`);
    const result = await mbClient.searchArtist(artistName);

    if (result) {
      console.log(`\n✓ Found artist: ${result.name}`);
      console.log(`  MBID: ${result.mbid}\n`);
      logger.info(`Successfully found artist MBID: ${result.mbid}`);
    } else {
      console.log(`\n✗ No artist found matching "${artistName}"\n`);
      logger.info(`No results found for artist: ${artistName}`);
    }
  } catch (error) {
    logger.error(`Setlist command error: ${error.message}`);
    console.error(`\n✗ Error: ${error.message}\n`);
    process.exit(1);
  } finally {
    rl.close();
  }
}