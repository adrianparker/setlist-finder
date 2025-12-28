import 'dotenv/config';

export class SetlistFmClient {
  constructor(logger) {
    this.logger = logger;
    this.baseUrl = 'https://api.setlist.fm/rest/1.0';
    this.apiKey = process.env.SETLISTFM_API_KEY;
  }
  
  async searchSetlistsByArtist(mbid, city = null) {
    if (!this.apiKey) {
      throw new Error('SETLISTFM_API_KEY environment variable is not set');
    }
    const url = new URL(`${this.baseUrl}/search/setlists`);
    url.searchParams.append('artistMbid', mbid);
    if (city) {
      url.searchParams.append('cityName', city);
    }

    this.logger.info(`Searching Setlist.fm for artist ${mbid}${city ? ` in ${city}` : ''}`);
    
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

  async getSetlist(setlistId) {
    if (!this.apiKey) {
      throw new Error('SETLISTFM_API_KEY environment variable is not set');
    }

    const url = new URL(`${this.baseUrl}/setlist/${setlistId}`);

    this.logger.info(`Fetching setlist ${setlistId} from Setlist.fm`);

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