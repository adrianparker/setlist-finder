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

  async createPlaylist(userId, playlistName, isPublic = true) {
    try {
      const token = await this.getAccessToken();

      if (!userId || !playlistName) {
        this.logger.warn(`Invalid playlist parameters: userId="${userId}", name="${playlistName}"`);
        throw new Error('User ID and playlist name are required');
      }

      const url = `https://api.spotify.com/v1/users/${encodeURIComponent(userId)}/playlists`;
      
      this.logger.debug(`Creating Spotify playlist: "${playlistName}" for user ${userId}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: playlistName,
          public: isPublic,
          description: `Setlist playlist created by setlist-finder`
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || response.statusText;
        throw new Error(`HTTP ${response.status}: ${errorMessage}`);
      }

      const data = await response.json();
      this.logger.info(`Playlist created: "${playlistName}" (ID: ${data.id})`);

      return {
        id: data.id,
        uri: data.uri,
        externalUrl: data.external_urls?.spotify || '',
        name: data.name
      };
    } catch (err) {
      this.logger.error(`Failed to create Spotify playlist: ${err.message}`);
      throw err;
    }
  }

  async createPlaylistAsUser(userAccessToken, playlistName, isPublic = true) {
    try {
      if (!userAccessToken || !playlistName) {
        this.logger.warn(`Invalid parameters: token="${!!userAccessToken}", name="${playlistName}"`);
        throw new Error('User access token and playlist name are required');
      }

      const url = 'https://api.spotify.com/v1/me/playlists';
      
      this.logger.debug(`Creating Spotify playlist as user: "${playlistName}"`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: playlistName,
          public: isPublic,
          description: `Setlist playlist created by setlist-finder`
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || response.statusText;
        throw new Error(`HTTP ${response.status}: ${errorMessage}`);
      }

      const data = await response.json();
      this.logger.info(`Playlist created: "${playlistName}" (ID: ${data.id})`);

      return {
        id: data.id,
        uri: data.uri,
        externalUrl: data.external_urls?.spotify || '',
        name: data.name
      };
    } catch (err) {
      this.logger.error(`Failed to create Spotify playlist as user: ${err.message}`);
      throw err;
    }
  }

  async addTracksToPlaylist(playlistId, trackUris) {
    try {
      const token = await this.getAccessToken();

      if (!playlistId) {
        this.logger.warn(`Invalid playlist ID: "${playlistId}"`);
        throw new Error('Playlist ID is required');
      }

      if (!Array.isArray(trackUris) || trackUris.length === 0) {
        this.logger.warn(`Invalid or empty track URIs array`);
        throw new Error('At least one track URI is required');
      }

      this.logger.debug(`Adding ${trackUris.length} track(s) to playlist ${playlistId}`);

      // Spotify API limits 100 tracks per request, so batch them
      const batchSize = 100;
      const batches = [];
      
      for (let i = 0; i < trackUris.length; i += batchSize) {
        batches.push(trackUris.slice(i, i + batchSize));
      }

      const addedTracks = [];
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const url = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`;

        this.logger.debug(`Adding batch ${batchIndex + 1}/${batches.length} (${batch.length} tracks)`);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            uris: batch
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error?.message || response.statusText;
          throw new Error(`HTTP ${response.status}: ${errorMessage}`);
        }

        const data = await response.json();
        addedTracks.push(...(data.snapshot_id || []));
      }

      this.logger.info(`Successfully added ${trackUris.length} track(s) to playlist`);

      return {
        tracksAdded: trackUris.length,
        batches: batches.length
      };
    } catch (err) {
      this.logger.error(`Failed to add tracks to playlist: ${err.message}`);
      throw err;
    }
  }
}
