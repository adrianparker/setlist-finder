import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { SpotifyClient } from '../../src/services/spotifyClient.js';

describe('SpotifyClient', () => {
  let client;
  let logger;
  let fetchStub;

  beforeEach(() => {
    logger = {
      info: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub(),
      warn: sinon.stub()
    };

    process.env.SPOTIFY_CLIENT_ID = 'test-client-id';
    process.env.SPOTIFY_CLIENT_SECRET = 'test-client-secret';

    fetchStub = sinon.stub(global, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;
  });

  describe('constructor', () => {
    it('should throw error if SPOTIFY_CLIENT_ID is missing', () => {
      delete process.env.SPOTIFY_CLIENT_ID;
      expect(() => new SpotifyClient(logger)).to.throw('SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables are required');
    });

    it('should throw error if SPOTIFY_CLIENT_SECRET is missing', () => {
      delete process.env.SPOTIFY_CLIENT_SECRET;
      expect(() => new SpotifyClient(logger)).to.throw('SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables are required');
    });

    it('should initialize successfully with valid credentials', () => {
      client = new SpotifyClient(logger);
      expect(client.clientId).to.equal('test-client-id');
      expect(client.clientSecret).to.equal('test-client-secret');
      expect(client.accessToken).to.be.null;
    });
  });

  describe('getAccessToken', () => {
    beforeEach(() => {
      client = new SpotifyClient(logger);
    });

    it('should request and cache access token on first call', async () => {
      const mockToken = 'test-access-token-123';
      const mockResponse = {
        ok: true,
        json: sinon.stub().resolves({
          access_token: mockToken,
          expires_in: 3600
        })
      };

      fetchStub.resolves(mockResponse);

      const token = await client.getAccessToken();

      expect(token).to.equal(mockToken);
      expect(client.accessToken).to.equal(mockToken);
      expect(client.tokenExpiry).to.exist;
      expect(logger.debug.called).to.be.true;
    });

    it('should return cached token if still valid', async () => {
      const mockToken = 'test-access-token-123';
      client.accessToken = mockToken;
      client.tokenExpiry = Date.now() + 100000; // Valid for 100 more seconds

      const token = await client.getAccessToken();

      expect(token).to.equal(mockToken);
      expect(fetchStub.called).to.be.false; // Should not call fetch
    });

    it('should handle token request errors', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      };

      fetchStub.resolves(mockResponse);

      try {
        await client.getAccessToken();
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('HTTP 401');
        expect(logger.error.called).to.be.true;
      }
    });
  });

  describe('searchTracks', () => {
    beforeEach(() => {
      client = new SpotifyClient(logger);
      client.accessToken = 'cached-token';
      client.tokenExpiry = Date.now() + 100000;
    });

    it('should search for tracks and return formatted results', async () => {
      const mockSearchResponse = {
        ok: true,
        json: sinon.stub().resolves({
          tracks: {
            items: [
              {
                id: 'track-1',
                name: 'Test Song',
                uri: 'spotify:track:track-1',
                explicit: false,
                popularity: 75,
                artists: [{ name: 'Test Artist', id: 'artist-1' }],
                album: {
                  id: 'album-1',
                  name: 'Test Album',
                  release_date: '2023-01-01',
                  images: []
                }
              }
            ]
          }
        })
      };

      fetchStub.resolves(mockSearchResponse);

      const results = await client.searchTracks('Test Artist', 'Test Song');

      expect(results).to.be.an('array');
      expect(results).to.have.lengthOf(1);
      expect(results[0]).to.have.all.keys('id', 'name', 'uri', 'explicit', 'popularity', 'artists', 'album');
      expect(results[0].id).to.equal('track-1');
      expect(results[0].artists[0].name).to.equal('Test Artist');
    });

    it('should return empty array if no tracks found', async () => {
      const mockSearchResponse = {
        ok: true,
        json: sinon.stub().resolves({ tracks: { items: [] } })
      };

      fetchStub.resolves(mockSearchResponse);

      const results = await client.searchTracks('Unknown Artist', 'Unknown Song');

      expect(results).to.be.an('array');
      expect(results).to.have.lengthOf(0);
    });

    it('should handle search errors gracefully', async () => {
      const mockSearchResponse = {
        ok: false,
        statusText: 'Not Found'
      };

      fetchStub.resolves(mockSearchResponse);

      const results = await client.searchTracks('Test Artist', 'Test Song');

      expect(results).to.be.an('array');
      expect(results).to.have.lengthOf(0);
      expect(logger.error.called).to.be.true;
    });
  });

  describe('createPlaylist', () => {
    beforeEach(() => {
      client = new SpotifyClient(logger);
    });

    it('should create a playlist with the user access token via /me/playlists', async () => {
      const mockResponse = {
        ok: true,
        json: sinon.stub().resolves({
          id: 'playlist-456',
          uri: 'spotify:playlist:playlist-456',
          name: 'User Playlist',
          external_urls: {
            spotify: 'https://open.spotify.com/playlist/playlist-456'
          }
        })
      };

      fetchStub.resolves(mockResponse);

      const result = await client.createPlaylist('user-token-xyz', 'User Playlist', { isPublic: false, description: 'My notes' });

      expect(result).to.have.all.keys('id', 'uri', 'externalUrl', 'name');
      expect(result.id).to.equal('playlist-456');
      expect(result.externalUrl).to.equal('https://open.spotify.com/playlist/playlist-456');
      const [url, options] = fetchStub.firstCall.args;
      expect(url).to.equal('https://api.spotify.com/v1/me/playlists');
      expect(options.method).to.equal('POST');
      expect(options.headers.Authorization).to.equal('Bearer user-token-xyz');
      expect(JSON.parse(options.body)).to.deep.equal({ name: 'User Playlist', public: false, description: 'My notes' });
      expect(logger.info.called).to.be.true;
    });

    it('should default to a private playlist', async () => {
      fetchStub.resolves({ ok: true, json: sinon.stub().resolves({ id: 'p1', uri: 'spotify:playlist:p1', name: 'N' }) });

      const result = await client.createPlaylist('user-token-xyz', 'N');

      expect(JSON.parse(fetchStub.firstCall.args[1].body).public).to.be.false;
      expect(result.externalUrl).to.equal('https://open.spotify.com/playlist/p1');
    });

    it('should throw error with invalid access token', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        json: sinon.stub().resolves({
          error: { message: 'Invalid access token' }
        })
      };

      fetchStub.resolves(mockResponse);

      try {
        await client.createPlaylist('invalid-token', 'Test Playlist');
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('HTTP 401');
        expect(logger.error.called).to.be.true;
      }
    });

    it('should throw error if access token is missing', async () => {
      try {
        await client.createPlaylist('', 'Test Playlist');
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('User access token and playlist name are required');
      }
    });

    it('should throw error if playlist name is missing', async () => {
      try {
        await client.createPlaylist('user-token-xyz', '');
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('User access token and playlist name are required');
      }
    });
  });

  describe('addTracksToPlaylist', () => {
    beforeEach(() => {
      client = new SpotifyClient(logger);
    });

    it('should add tracks to playlist successfully', async () => {
      const mockResponse = {
        ok: true,
        json: sinon.stub().resolves({
          snapshot_id: 'snapshot-123'
        })
      };

      fetchStub.resolves(mockResponse);

      const trackUris = [
        'spotify:track:track-1',
        'spotify:track:track-2',
        'spotify:track:track-3'
      ];

      const result = await client.addTracksToPlaylist('user-token', 'playlist-123', trackUris);

      expect(result).to.have.all.keys('tracksAdded', 'batches', 'snapshotId');
      expect(result.tracksAdded).to.equal(3);
      expect(result.batches).to.equal(1);
      expect(result.snapshotId).to.equal('snapshot-123');
      const [url, options] = fetchStub.firstCall.args;
      expect(url).to.equal('https://api.spotify.com/v1/playlists/playlist-123/items');
      expect(options.headers.Authorization).to.equal('Bearer user-token');
      expect(JSON.parse(options.body).uris).to.deep.equal(trackUris);
      expect(logger.info.called).to.be.true;
    });

    it('should batch tracks if more than 100 tracks', async () => {
      const mockResponse = {
        ok: true,
        json: sinon.stub().resolves({
          snapshot_id: 'snapshot-123'
        })
      };

      fetchStub.resolves(mockResponse);

      // Create 150 track URIs (requires 2 batches)
      const trackUris = Array.from({ length: 150 }, (_, i) => `spotify:track:track-${i + 1}`);

      const result = await client.addTracksToPlaylist('user-token', 'playlist-123', trackUris);

      expect(result.tracksAdded).to.equal(150);
      expect(result.batches).to.equal(2); // 100 in first batch, 50 in second
      expect(fetchStub.callCount).to.equal(2);
      // Order is preserved across batches
      expect(JSON.parse(fetchStub.firstCall.args[1].body).uris).to.deep.equal(trackUris.slice(0, 100));
      expect(JSON.parse(fetchStub.secondCall.args[1].body).uris).to.deep.equal(trackUris.slice(100));
    });

    it('should throw error if user access token is missing', async () => {
      try {
        await client.addTracksToPlaylist('', 'playlist-123', ['spotify:track:track-1']);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('User access token is required');
      }
    });

    it('should throw error if playlist ID is missing', async () => {
      try {
        await client.addTracksToPlaylist('user-token', '', ['spotify:track:track-1']);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('Playlist ID is required');
      }
    });

    it('should throw error if track URIs array is empty', async () => {
      try {
        await client.addTracksToPlaylist('user-token', 'playlist-123', []);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('At least one track URI is required');
      }
    });

    it('should throw error if track URIs is not an array', async () => {
      try {
        await client.addTracksToPlaylist('user-token', 'playlist-123', 'not-an-array');
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('At least one track URI is required');
      }
    });

    it('should handle API errors when adding tracks', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        json: sinon.stub().resolves({
          error: { message: 'Unauthorized' }
        })
      };

      fetchStub.resolves(mockResponse);

      try {
        await client.addTracksToPlaylist('user-token', 'playlist-123', ['spotify:track:track-1']);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('HTTP 401');
        expect(logger.error.called).to.be.true;
      }
    });
  });
});
