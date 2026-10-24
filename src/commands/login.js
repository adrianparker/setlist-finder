import { SpotifyAuth } from '../services/spotifyAuth.js';
import { Logger } from '../services/logger.js';

const logger = new Logger();

export async function login() {
  try {
    const auth = new SpotifyAuth(logger);
    logger.info(`Using redirect URI: ${auth.redirectUri}`);
    await auth.login();
    logger.info(`Tokens stored in ${auth.tokenPath}`);
  } catch (error) {
    logger.error(`Spotify sign-in failed: ${error.message}`);
    process.exit(1);
  }
}

export function logout() {
  try {
    const auth = new SpotifyAuth(logger);
    auth.clearTokens();
    logger.info('Stored Spotify tokens removed.');
  } catch (error) {
    logger.error(`Spotify sign-out failed: ${error.message}`);
    process.exit(1);
  }
}
