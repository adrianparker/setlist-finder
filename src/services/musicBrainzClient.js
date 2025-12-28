export class MusicBrainzClient {
  constructor(logger) {
    this.logger = logger;
    this.baseUrl = 'https://musicbrainz.org/ws/2';
    this.userAgent = 'SetlistFinder/1.0.0 (Adrian Parker adrian@iceknife.com)';
  }

  async searchArtist(artistName) {
    const url = new URL(`${this.baseUrl}/artist?query=${encodeURIComponent(artistName)}&fmt=json`);
    
    this.logger.info(`API Request: GET ${url.toString()}`);

    try {
      const response = await fetch(url.toString(), {
        headers: { 'User-Agent': this.userAgent }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.logger.info(`API Response: ${data.artists?.length || 0} results found`);

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