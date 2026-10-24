import fs from 'fs';
const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

// MusicBrainz answers 503 (and sometimes 429) when its rate limit is exceeded, so these are retried
const RETRY_STATUSES = [429, 503];
const RETRY_DELAYS_MS = [1000, 2000, 4000];

export class MusicBrainzClient {
  constructor(logger) {
    this.logger = logger;
    this.baseUrl = 'https://musicbrainz.org/ws/2';
    this.userAgent = pkg.name + '/' + pkg.version;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch a URL, retrying rate-limit responses with growing waits (or the Retry-After header)
   * @private
   */
  async fetchWithRetry(url) {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, {
        headers: { 'User-Agent': this.userAgent }
      });

      if (response.ok || !RETRY_STATUSES.includes(response.status) || attempt >= RETRY_DELAYS_MS.length) {
        return response;
      }

      const retryAfterSeconds = Number(response.headers?.get?.('retry-after'));
      const delay = retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : RETRY_DELAYS_MS[attempt];
      this.logger.warn(`MusicBrainz returned HTTP ${response.status}; retrying in ${delay / 1000}s`);
      await this.sleep(delay);
    }
  }

  async searchArtist(artistName) {
    const url = new URL(`${this.baseUrl}/artist?query=${encodeURIComponent(artistName)}&fmt=json`);
    
    this.logger.info(`MusicBrainz API Request: GET ${url.toString()}`);

    try {
      const response = await this.fetchWithRetry(url.toString());

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.logger.info(`${data.artists?.length || 0} results found`);

      if (data.artists && data.artists.length > 0) {
        if (data.artists.length > 1) {
          const names = data.artists.map(a => a.name || '[unknown]').join(', ');
          this.logger.info(`Artists returned: ${names}`);
        }
        const bestMatch = data.artists[0];
        this.logger.info(`Chosen artist: ${bestMatch.name || '[unknown]'}`);
        return { name: bestMatch.name, mbid: bestMatch.id };
      }
      return null;
    } catch (error) {
      this.logger.error(`API Error: ${error.message}`);
      throw error;
    }
  }
}