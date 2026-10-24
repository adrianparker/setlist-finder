import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { SetlistFmClient } from '../../src/services/setlistFmClient.js';

// 300 ms slower than the client to account for test execution overhead
const timeout = 2800;

describe('SetlistFmClient', () => {
  let client;
  let mockLogger;
  let fetchStub;
  let savedApiKey;

  beforeEach(() => {
    // Use a test key so the suite never depends on a real key in .env
    savedApiKey = process.env.SETLISTFM_API_KEY;
    process.env.SETLISTFM_API_KEY = 'test-setlistfm-key';
    mockLogger = {
      debug: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub()
    };
    client = new SetlistFmClient(mockLogger);
    fetchStub = sinon.stub(global, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
    if (savedApiKey === undefined) delete process.env.SETLISTFM_API_KEY;
    else process.env.SETLISTFM_API_KEY = savedApiKey;
  });

  describe('constructor', () => {
    it('should initialize with logger and base URL', () => {
      expect(client.logger).to.equal(mockLogger);
      expect(client.baseUrl).to.equal('https://api.setlist.fm/rest/1.0');
    });

    it('should read API key from environment', () => {
      expect(client.apiKey).to.equal('test-setlistfm-key');
    });
  });

  describe('searchSetlistsByArtist', () => {
    it('should throw error if API key is not set', async function() {
      this.timeout(timeout);
      client.apiKey = null;
      const mbid = '8f6bd1e4-fbe1-4f50-aa9b-94c450ec0f11';

      try {
        await client.searchSetlistsByArtist(mbid);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('SETLISTFM_API_KEY environment variable is not set');
      }
    });

    it('should search setlists by artist MBID', async function() {
      this.timeout(timeout);
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
      expect(mockLogger.info.calledWith(`Setlist.fm API Request: GET https://api.setlist.fm/rest/1.0/search/setlists?artistMbid=${mbid}`)).to.be.true;
    });

    it('should include city in search when provided', async function() {
      this.timeout(timeout);
      const mbid = '8f6bd1e4-fbe1-4f50-aa9b-94c450ec0f11';
      const city = 'Wellington';
      const mockResponse = { setlist: [] };

      fetchStub.resolves({
        ok: true,
        json: sinon.stub().resolves(mockResponse)
      });

      await client.searchSetlistsByArtist(mbid, city);

      const callUrl = fetchStub.firstCall.args[0];
      expect(callUrl).to.include('cityName=Wellington');
      expect(mockLogger.info.calledWith(`Setlist.fm API Request: GET https://api.setlist.fm/rest/1.0/search/setlists?artistMbid=${mbid}&cityName=${city}`)).to.be.true;
    });

    it('should request a later page of results when asked', async function() {
      this.timeout(timeout);
      const mbid = '8f6bd1e4-fbe1-4f50-aa9b-94c450ec0f11';

      fetchStub.resolves({
        ok: true,
        json: sinon.stub().resolves({ setlist: [] })
      });

      await client.searchSetlistsByArtist(mbid, null, 3);

      const url = new URL(fetchStub.firstCall.args[0]);
      expect(url.searchParams.get('p')).to.equal('3');
      expect(url.searchParams.has('cityName')).to.be.false;
    });

    it('should search an artist\'s setlists on a date, optionally in a city', async function() {
      this.timeout(timeout);
      fetchStub.resolves({ ok: true, json: sinon.stub().resolves({ setlist: [] }) });

      await client.searchSetlistsByArtistOnDate('mbid-1', '22-10-2026', 'Sydney');

      const url = new URL(fetchStub.firstCall.args[0]);
      expect(url.pathname).to.equal('/rest/1.0/search/setlists');
      expect(url.searchParams.get('artistMbid')).to.equal('mbid-1');
      expect(url.searchParams.get('date')).to.equal('22-10-2026');
      expect(url.searchParams.get('cityName')).to.equal('Sydney');
    });

    it('should return no setlists when setlist.fm has none for the date', async function() {
      this.timeout(timeout);
      fetchStub.resolves({ ok: false, status: 404, statusText: 'Not Found' });

      const result = await client.searchSetlistsByArtistOnDate('mbid-1', '22-10-2026');

      expect(result).to.deep.equal({ setlist: [] });
    });

    it('should throw error on failed API response', async function() {
      this.timeout(timeout);
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

    it('should send correct headers in API request', async function() {
      this.timeout(timeout);
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