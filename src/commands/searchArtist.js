import { MusicBrainzClient } from '../services/musicBrainzClient.js';
import { Logger } from '../services/logger.js';

const logger = new Logger();
const mbClient = new MusicBrainzClient(logger);

export async function searchArtist(artistName) {
  try {
    logger.info(`Searching for artist: ${artistName}`);
    const result = await mbClient.searchArtist(artistName);
    
    if (result) {
      console.log(`\n✓ Found artist: ${result.name}`);
      console.log(`  MBID: ${result.mbid}\n`);
    } else {
      console.log(`\n✗ No artist found matching "${artistName}"\n`);
    }
  } catch (error) {
    logger.error(`Error searching for artist: ${error.message}`);
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}