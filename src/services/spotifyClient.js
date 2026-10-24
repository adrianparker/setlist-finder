import 'dotenv/config';
import { cleanSearchTerm } from './songName.js';

// Development-mode apps may request at most 10 search results at a time (February 2026 change)
const SEARCH_PAGE_SIZE = 10;
const SEARCH_MAX_PAGES = 2;

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

  /**
   * Search Spotify for an artist's song. Runs the field-filtered search plus a second
   * "<song> live" search, so live versions are not crowded out by the 10-result limit,
   * fetches a further page when a page is full, and merges the results without duplicates.
   */
  async searchTracks(artistName, songName) {
    try {
      // Validate inputs
      if (!artistName || !songName) {
        this.logger.warn(`Invalid search parameters: artist="${artistName}", song="${songName}"`);
        return [];
      }

      const token = await this.getAccessToken();

      // Build query with field filters: artist:name track:name
      const query = `artist:${artistName} track:${cleanSearchTerm(songName)}`;
      const tracks = await this.searchTrackPages(token, query);

      try {
        tracks.push(...await this.searchTrackPages(token, `${query} live`));
      } catch (err) {
        this.logger.warn(`Spotify live search failed for "${artistName} - ${songName}": ${err.message}`);
      }

      const seen = new Set();
      return tracks
        .filter(track => !seen.has(track.id) && seen.add(track.id))
        .map(track => ({
          id: track.id,
          name: track.name,
          uri: track.uri,
          explicit: track.explicit,
          popularity: track.popularity,
          artists: track.artists.map(a => ({ name: a.name, id: a.id })),
          album: {
            id: track.album.id,
            name: track.album.name,
            albumType: track.album.album_type,
            releaseDate: track.album.release_date,
            images: track.album.images || []
          }
        }));
    } catch (err) {
      this.logger.error(`Spotify search failed for "${artistName} - ${songName}": ${err.message}`);
      return [];
    }
  }

  /**
   * Run one search query, fetching up to SEARCH_MAX_PAGES pages of SEARCH_PAGE_SIZE results
   * @private
   */
  async searchTrackPages(token, query) {
    const tracks = [];
    for (let pageIndex = 0; pageIndex < SEARCH_MAX_PAGES; pageIndex++) {
      const offset = pageIndex * SEARCH_PAGE_SIZE;
      const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${SEARCH_PAGE_SIZE}&offset=${offset}`;
      this.logger.debug(`Spotify search: "${query}" offset ${offset}`);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const items = data.tracks?.items || [];
      tracks.push(...items);

      if (items.length < SEARCH_PAGE_SIZE) break;
    }
    return tracks;
  }

  /**
   * Create a playlist in the signed-in user's account (POST /me/playlists).
   * Requires a user access token from SpotifyAuth; client-credentials tokens cannot create playlists.
   */
  async createPlaylist(userAccessToken, playlistName, { isPublic = false, description = 'Setlist playlist created by setlist-finder' } = {}) {
    try {
      if (!userAccessToken || !playlistName) {
        this.logger.warn(`Invalid parameters: token="${!!userAccessToken}", name="${playlistName}"`);
        throw new Error('User access token and playlist name are required');
      }

      const url = 'https://api.spotify.com/v1/me/playlists';

      this.logger.debug(`Creating Spotify playlist: "${playlistName}" (public: ${isPublic})`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: playlistName,
          public: isPublic,
          description
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
        externalUrl: data.external_urls?.spotify || `https://open.spotify.com/playlist/${data.id}`,
        name: data.name
      };
    } catch (err) {
      this.logger.error(`Failed to create Spotify playlist: ${err.message}`);
      throw err;
    }
  }

  /**
   * Send a request with a user access token and return the parsed JSON body (null if empty)
   * @private
   */
  async userRequest(userAccessToken, method, url, body) {
    if (!userAccessToken) {
      throw new Error('User access token is required');
    }

    this.logger.debug(`Spotify API request: ${method} ${url}`);
    const options = { method, headers: { 'Authorization': `Bearer ${userAccessToken}` } };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;
      throw new Error(`HTTP ${response.status}: ${errorMessage}`);
    }

    // Some endpoints, such as changing playlist details, return an empty body
    return response.json ? response.json().catch(() => null) : null;
  }

  /**
   * Get the signed-in user's Spotify ID (GET /me)
   */
  async getCurrentUser(userAccessToken) {
    const data = await this.userRequest(userAccessToken, 'GET', 'https://api.spotify.com/v1/me');
    return { id: data.id, displayName: data.display_name };
  }

  /**
   * List every playlist in the signed-in user's library (GET /me/playlists), 50 per page
   */
  async listMyPlaylists(userAccessToken) {
    const playlists = [];
    let url = 'https://api.spotify.com/v1/me/playlists?limit=50';
    while (url) {
      const data = await this.userRequest(userAccessToken, 'GET', url);
      for (const playlist of data.items || []) {
        if (!playlist) continue;
        playlists.push({
          id: playlist.id,
          name: playlist.name,
          description: playlist.description || '',
          isPublic: playlist.public,
          ownerId: playlist.owner?.id,
          externalUrl: playlist.external_urls?.spotify || `https://open.spotify.com/playlist/${playlist.id}`
        });
      }
      url = data.next;
    }
    this.logger.debug(`Found ${playlists.length} playlist(s) in the user's library`);
    return playlists;
  }

  /**
   * Change a playlist's name and description, and its visibility only when isPublic is given
   * (PUT /playlists/{id})
   */
  async updatePlaylistDetails(userAccessToken, playlistId, { name, description, isPublic } = {}) {
    const body = { name, description };
    if (isPublic !== undefined) body.public = isPublic;
    await this.userRequest(userAccessToken, 'PUT', `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}`, body);
    this.logger.info(`Playlist details updated: "${name}" (ID: ${playlistId})`);
  }

  /**
   * Read the URIs of a playlist's tracks in order (GET /playlists/{id}/items), 50 per page
   */
  async getPlaylistTrackUris(userAccessToken, playlistId) {
    const uris = [];
    let url = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items?limit=50`;
    while (url) {
      const data = await this.userRequest(userAccessToken, 'GET', url);
      for (const entry of data.items || []) {
        // "item" replaced the deprecated "track" field; local or removed tracks may be null
        const uri = (entry?.item || entry?.track)?.uri;
        if (uri) uris.push(uri);
      }
      url = data.next;
    }
    return uris;
  }

  /**
   * Replace all of a playlist's tracks, keeping its ID (PUT /playlists/{id}/items).
   * PUT takes at most 100 URIs, so any beyond that are appended in order.
   */
  async replacePlaylistTracks(userAccessToken, playlistId, trackUris) {
    const url = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items`;
    await this.userRequest(userAccessToken, 'PUT', url, { uris: trackUris.slice(0, 100) });
    for (let i = 100; i < trackUris.length; i += 100) {
      await this.userRequest(userAccessToken, 'POST', url, { uris: trackUris.slice(i, i + 100) });
    }
    this.logger.info(`Replaced playlist ${playlistId} tracks with ${trackUris.length} track(s)`);
  }

  /**
   * Append tracks to a playlist in order (POST /playlists/{id}/items), 100 per request.
   * Requires a user access token from SpotifyAuth.
   */
  async addTracksToPlaylist(userAccessToken, playlistId, trackUris) {
    try {
      if (!userAccessToken) {
        throw new Error('User access token is required');
      }

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

      let snapshotId = null;
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const url = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items`;

        this.logger.debug(`Adding batch ${batchIndex + 1}/${batches.length} (${batch.length} tracks)`);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${userAccessToken}`,
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
        snapshotId = data.snapshot_id || snapshotId;
      }

      this.logger.info(`Successfully added ${trackUris.length} track(s) to playlist`);

      return {
        tracksAdded: trackUris.length,
        batches: batches.length,
        snapshotId
      };
    } catch (err) {
      this.logger.error(`Failed to add tracks to playlist: ${err.message}`);
      throw err;
    }
  }
}
