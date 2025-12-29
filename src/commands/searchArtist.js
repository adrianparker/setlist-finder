import { MusicBrainzClient } from '../services/musicBrainzClient.js';
import { Logger } from '../services/logger.js';

const logger = new Logger();
const mbClient = new MusicBrainzClient(logger);

export async function searchArtist(artistName) {
  try {
    logger.info(`Searching for artist: ${artistName}`);
    const result = await mbClient.searchArtist(artistName);
    
    logger.debug(`\nFound artist: ${result && result.name ? result.name : 'None'}`);
    if (result && result.mbid) {
      logger.info(`MBID: ${result.mbid}\n`);
    }
  } catch (error) {
    logger.error(`Error searching for artist: ${error.message}`);
    process.exit(1);
  }
}