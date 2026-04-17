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
});
