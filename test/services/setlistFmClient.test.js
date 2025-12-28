import { describe, it } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { SetlistFmClient } from '../../src/services/setlistFmClient.js';

describe('SetlistFmClient', () => {
  let client;
  let mockLogger;
  let fetchStub;

  beforeEach(() => {
    mockLogger = {
      info: sinon.stub(),
      error: sinon.stub()
    };
    client = new SetlistFmClient(mockLogger);
    fetchStub = sinon.stub(global, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  describe('constructor', () => {
    it('should initialize with logger and base URL', () => {
      expect(client.logger).to.equal(mockLogger);
      expect(client.baseUrl).to.equal('https://api.setlist.fm/rest/1.0');
    });

    it('should read API key from environment', () => {
      expect(client.apiKey).to.equal(process.env.SETLISTFM_API_KEY);
    });
  });

  describe('searchSetlistsByArtist', () => {
    it('should throw error if API key is not set', async () => {
      client.apiKey = null;
      const mbid = '8f6bd1e4-fbe1-4f50-aa9b-94c450ec0f11';

      try {
        await client.searchSetlistsByArtist(mbid);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('SETLISTFM_API_KEY environment variable is not set');
      }
    });

    it('should search setlists by artist MBID', async () => {
      const mbid = '8f6bd1e4-fbe1-4f50-aa9b-94c450ec0f11';
      const mockResponse = {
        setlist: [
          {
            id: '1',
            eventDate: '2023-01-15',
            venue: { name: 'Venue 1', city: { name: 'City 1', country: { name: 'Country 1' } } }
          }
        ]
      };

      fetchStub.resolves({
        ok: true,
        json: sinon.stub().resolves(mockResponse)
      });

      const result = await client.searchSetlistsByArtist(mbid);

      expect(result).to.deep.equal(mockResponse);
      expect(mockLogger.info.calledWith(`Searching Setlist.fm for artist ${mbid}`)).to.be.true;
    });

    it('should include location in search when provided', async () => {
      const mbid = '8f6bd1e4-fbe1-4f50-aa9b-94c450ec0f11';
      const location = 'Wellington';
      const mockResponse = { setlist: [] };

      fetchStub.resolves({
        ok: true,
        json: sinon.stub().resolves(mockResponse)
      });

      await client.searchSetlistsByArtist(mbid, location);

      const callUrl = fetchStub.firstCall.args[0];
      expect(callUrl).to.include('cityName=Wellington');
      expect(mockLogger.info.calledWith(`Searching Setlist.fm for artist ${mbid} in ${location}`)).to.be.true;
    });

    it('should throw error on failed API response', async () => {
      const mbid = '8f6bd1e4-fbe1-4f50-aa9b-94c450ec0f11';

      fetchStub.resolves({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      try {
        await client.searchSetlistsByArtist(mbid);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Setlist.fm API error: 401 Unauthorized');
      }
    });

    it('should send correct headers in API request', async () => {
      const mbid = '8f6bd1e4-fbe1-4f50-aa9b-94c450ec0f11';
      const mockResponse = { setlist: [] };

      fetchStub.resolves({
        ok: true,
        json: sinon.stub().resolves(mockResponse)
      });

      await client.searchSetlistsByArtist(mbid);

      const headers = fetchStub.firstCall.args[1].headers;
      expect(headers['x-api-key']).to.equal(client.apiKey);
      expect(headers['Accept']).to.equal('application/json');
    });
  });
});