import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { MusicBrainzClient } from '../../src/services/musicBrainzClient.js';

describe('MusicBrainzClient', () => {
  let mockLogger;
  let client;
  let fetchStub;

  beforeEach(() => {
    mockLogger = { info: sinon.stub(), error: sinon.stub(), warn: sinon.stub(), debug: sinon.stub() };
    client = new MusicBrainzClient(mockLogger);
    // Record waits instead of sleeping
    client.sleep = sinon.stub().resolves();
    fetchStub = sinon.stub(global, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  it('should search for an artist and return MBID', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        artists: [
          { id: '12345', name: 'The Beatles' }
        ]
      })
    };
    fetchStub.resolves(mockResponse);

    const result = await client.searchArtist('The Beatles');

    expect(result).to.deep.equal({ name: 'The Beatles', mbid: '12345' });
  });

  it('should return null when no artist is found', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ artists: [] })
    };
    fetchStub.resolves(mockResponse);

    const result = await client.searchArtist('Unknown Artist');

    expect(result).to.be.null;
  });

  it('should throw error on HTTP failure', async () => {
    fetchStub.resolves({ ok: false, status: 404, statusText: 'Not Found' });

    try {
      await client.searchArtist('Artist');
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('HTTP 404');
    }
  });

  it('should initialize with logger', () => {
    expect(client.logger).to.equal(mockLogger);
  });
  
  it('should set baseUrl to MusicBrainz API endpoint', () => {
    expect(client.baseUrl).to.equal('https://musicbrainz.org/ws/2');
  });
  
  it('should set userAgent to a string beginning with setlist-finder', () => {
    expect(client.userAgent).to.match(/^setlist-finder\/\d+\.\d+\.\d+/);
  });

  describe('retries', () => {
    const unavailable = (headers = {}) => ({
      ok: false,
      status: 503,
      statusText: 'Service Temporarily Unavailable',
      headers: { get: name => headers[name.toLowerCase()] ?? null }
    });
    const found = { ok: true, json: async () => ({ artists: [{ id: 'mbid-1', name: 'Mudhoney' }] }) };

    it('should retry a 503 with growing waits and then succeed', async () => {
      fetchStub.onCall(0).resolves(unavailable());
      fetchStub.onCall(1).resolves(unavailable());
      fetchStub.onCall(2).resolves(found);

      const result = await client.searchArtist('Mudhoney');

      expect(result).to.deep.equal({ name: 'Mudhoney', mbid: 'mbid-1' });
      expect(fetchStub.callCount).to.equal(3);
      expect(client.sleep.args.map(args => args[0])).to.deep.equal([1000, 2000]);
      expect(mockLogger.warn.calledTwice).to.be.true;
    });

    it('should retry a 429 too', async () => {
      fetchStub.onCall(0).resolves({ ...unavailable(), status: 429, statusText: 'Too Many Requests' });
      fetchStub.onCall(1).resolves(found);

      expect(await client.searchArtist('Mudhoney')).to.deep.equal({ name: 'Mudhoney', mbid: 'mbid-1' });
    });

    it('should wait as long as the Retry-After header asks', async () => {
      fetchStub.onCall(0).resolves(unavailable({ 'retry-after': '3' }));
      fetchStub.onCall(1).resolves(found);

      await client.searchArtist('Mudhoney');

      expect(client.sleep.firstCall.args[0]).to.equal(3000);
    });

    it('should give up after the last retry', async () => {
      fetchStub.resolves(unavailable());

      try {
        await client.searchArtist('Mudhoney');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('HTTP 503');
        expect(fetchStub.callCount).to.equal(4);
        expect(client.sleep.args.map(args => args[0])).to.deep.equal([1000, 2000, 4000]);
      }
    });

    it('should not retry other errors', async () => {
      fetchStub.resolves({ ok: false, status: 400, statusText: 'Bad Request' });

      try {
        await client.searchArtist('Mudhoney');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('HTTP 400');
        expect(fetchStub.callCount).to.equal(1);
        expect(client.sleep.called).to.be.false;
      }
    });
  });
});
