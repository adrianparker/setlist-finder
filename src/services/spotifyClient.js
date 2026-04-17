export class SpotifyClient {
  constructor(logger) {
    this.logger = logger;
    this.clientId = process.env.SPOTIFY_CLIENT_ID;
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    this.accessToken = null;
    this.tokenExpiry = null;

    if (!this.clientId || !this.clientSecret) {
      throw new Error('SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables are required');
    }
  }

  async getAccessToken() {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      this.logger.debug('Requesting Spotify access token');
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      // Token expires in seconds, cache for slightly less time (95% of expiry)
      this.tokenExpiry = Date.now() + (data.expires_in * 1000 * 0.95);
      
      this.logger.debug('Spotify access token obtained successfully');
      return this.accessToken;
    } catch (err) {
      this.logger.error(`Failed to obtain Spotify access token: ${err.message}`);
      throw err;
    }
  }

  async searchTracks(artistName, songName) {
    try {
      const token = await this.getAccessToken();
      
      // Validate inputs
      if (!artistName || !songName) {
        this.logger.warn(`Invalid search parameters: artist="${artistName}", song="${songName}"`);
        return [];
      }
  
      // Build query with field filters: artist:name track:name
      const query = `artist:${artistName} track:${songName}`;
      const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`;
  
      this.logger.debug(`Searching Spotify for: ${artistName} - ${songName}`);
  
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
  
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
  
      const data = await response.json();
      const tracks = data.tracks?.items || [];
      
      this.logger.debug(`Found ${tracks.length} track(s) on Spotify for: ${artistName} - ${songName}`);
  
      return tracks.map(track => ({
        id: track.id,
        name: track.name,
        uri: track.uri,
        explicit: track.explicit,
        popularity: track.popularity,
        artists: track.artists.map(a => ({ name: a.name, id: a.id })),
        album: {
          id: track.album.id,
          name: track.album.name,
          releaseDate: track.album.release_date,
          images: track.album.images || []
        }
      }));
    } catch (err) {
      this.logger.error(`Spotify search failed for "${artistName} - ${songName}": ${err.message}`);
      return [];
    }
  }
}
