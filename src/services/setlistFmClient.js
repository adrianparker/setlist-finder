import 'dotenv/config';

// wait given milliseconds before executing each Setlist.fm request, to avoid 429 "Too Many Requests" errors
const timeout = 2500;

export class SetlistFmClient {
  constructor(logger) {
    this.logger = logger;
    this.baseUrl = 'https://api.setlist.fm/rest/1.0';
    this.apiKey = process.env.SETLISTFM_API_KEY;
  }
  
  /**
   * Search an artist's setlists, newest first, 20 per page
   * @param {string} mbid - MusicBrainz artist ID
   * @param {string|null} city - optional city name filter
   * @param {number} page - result page, starting at 1
   */
  async searchSetlistsByArtist(mbid, city = null, page = 1) {
    const url = new URL(`${this.baseUrl}/search/setlists`);
    url.searchParams.append('artistMbid', mbid);
    if (city) {
      url.searchParams.append('cityName', city);
    }
    if (page > 1) {
      url.searchParams.append('p', String(page));
    }
    return await this.doFetch(url);
  }

  async getSetlist(setlistId) {
    const url = new URL(`${this.baseUrl}/setlist/${setlistId}`);
    return await this.doFetch(url)
  }

  async doFetch(url) {
    if (!this.apiKey) {
      throw new Error('SETLISTFM_API_KEY environment variable is not set');
    }
    await new Promise(resolve => setTimeout(resolve, timeout));
    
    this.logger.info(`Setlist.fm API Request: GET ${url.toString()}`);
    const response = await fetch(url.toString(), {
      headers: {
      'x-api-key': this.apiKey,
      'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Setlist.fm API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}