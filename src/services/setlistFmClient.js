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

  /**
   * Find an artist's setlists on one date, optionally in one city
   * @param {string} mbid - MusicBrainz artist ID
   * @param {string} date - event date as dd-MM-yyyy, as setlist.fm expects
   * @param {string|null} city - optional city name filter
   * @returns {Promise<Object>} search result; { setlist: [] } when there are none
   */
  async searchSetlistsByArtistOnDate(mbid, date, city = null) {
    const url = new URL(`${this.baseUrl}/search/setlists`);
    url.searchParams.append('artistMbid', mbid);
    url.searchParams.append('date', date);
    if (city) {
      url.searchParams.append('cityName', city);
    }
    try {
      return await this.doFetch(url);
    } catch (err) {
      // setlist.fm answers 404 when nothing matches the search
      if (/\b404\b/.test(err.message)) return { setlist: [] };
      throw err;
    }
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