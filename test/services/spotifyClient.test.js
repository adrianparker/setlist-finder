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
      client.accessToken = 'cached-token';
      client.tokenExpiry = Date.now() + 100000;
    });

    it('should create a playlist and return playlist details', async () => {
      const mockResponse = {
        ok: true,
        json: sinon.stub().resolves({
          id: 'playlist-123',
          uri: 'spotify:playlist:playlist-123',
          name: 'Test Playlist',
          external_urls: {
            spotify: 'https://open.spotify.com/playlist/playlist-123'
          }
        })
      };

      fetchStub.resolves(mockResponse);

      const result = await client.createPlaylist('testuser', 'Test Playlist', true);

      expect(result).to.have.all.keys('id', 'uri', 'externalUrl', 'name');
      expect(result.id).to.equal('playlist-123');
      expect(result.uri).to.equal('spotify:playlist:playlist-123');
      expect(logger.info.called).to.be.true;
    });

    it('should throw error with invalid user ID', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        json: sinon.stub().resolves({
          error: { message: 'User not found' }
        })
      };

      fetchStub.resolves(mockResponse);

      try {
        await client.createPlaylist('invalid-user', 'Test Playlist', true);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('HTTP 404');
        expect(logger.error.called).to.be.true;
      }
    });

    it('should throw error if user ID is missing', async () => {
      try {
        await client.createPlaylist('', 'Test Playlist', true);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('User ID and playlist name are required');
      }
    });

    it('should throw error if playlist name is missing', async () => {
      try {
        await client.createPlaylist('testuser', '', true);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('User ID and playlist name are required');
      }
    });
  });

  describe('createPlaylistAsUser', () => {
    beforeEach(() => {
      client = new SpotifyClient(logger);
    });

    it('should create a playlist using user access token', async () => {
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

      const result = await client.createPlaylistAsUser('user-token-xyz', 'User Playlist', true);

      expect(result).to.have.all.keys('id', 'uri', 'externalUrl', 'name');
      expect(result.id).to.equal('playlist-456');
      expect(result.uri).to.equal('spotify:playlist:playlist-456');
      // Verify the call was made to /me/playlists endpoint
      expect(fetchStub.calledWith('https://api.spotify.com/v1/me/playlists')).to.be.true;
      expect(logger.info.called).to.be.true;
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
        await client.createPlaylistAsUser('invalid-token', 'Test Playlist', true);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('HTTP 401');
        expect(logger.error.called).to.be.true;
      }
    });

    it('should throw error if access token is missing', async () => {
      try {
        await client.createPlaylistAsUser('', 'Test Playlist', true);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('User access token and playlist name are required');
      }
    });

    it('should throw error if playlist name is missing', async () => {
      try {
        await client.createPlaylistAsUser('user-token-xyz', '', true);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('User access token and playlist name are required');
      }
    });
  });

  describe('addTracksToPlaylist', () => {
    beforeEach(() => {
      client = new SpotifyClient(logger);
      client.accessToken = 'cached-token';
      client.tokenExpiry = Date.now() + 100000;
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

      const result = await client.addTracksToPlaylist('playlist-123', trackUris);

      expect(result).to.have.all.keys('tracksAdded', 'batches');
      expect(result.tracksAdded).to.equal(3);
      expect(result.batches).to.equal(1);
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

      const result = await client.addTracksToPlaylist('playlist-123', trackUris);

      expect(result.tracksAdded).to.equal(150);
      expect(result.batches).to.equal(2); // 100 in first batch, 50 in second
      expect(fetchStub.callCount).to.be.at.least(2); // At least 2 requests (batches)
    });

    it('should throw error if playlist ID is missing', async () => {
      try {
        await client.addTracksToPlaylist('', ['spotify:track:track-1']);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('Playlist ID is required');
      }
    });

    it('should throw error if track URIs array is empty', async () => {
      try {
        await client.addTracksToPlaylist('playlist-123', []);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('At least one track URI is required');
      }
    });

    it('should throw error if track URIs is not an array', async () => {
      try {
        await client.addTracksToPlaylist('playlist-123', 'not-an-array');
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
        await client.addTracksToPlaylist('playlist-123', ['spotify:track:track-1']);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('HTTP 401');
        expect(logger.error.called).to.be.true;
      }
    });
  });
});
