import { describe, it } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { MusicBrainzClient } from '../../src/services/musicBrainzClient.js';

describe('MusicBrainzClient', () => {
  let mockLogger;
  let client;
  let fetchStub;

  beforeEach(() => {
    mockLogger = { info: sinon.stub(), error: sinon.stub() };
    client = new MusicBrainzClient(mockLogger);
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
});