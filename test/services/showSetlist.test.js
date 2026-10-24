import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { findShowSetlist } from '../../src/services/showSetlist.js';

function setlist(id, songs, venue = 'Venue', city = 'Sydney') {
  return {
    id,
    eventDate: '22-10-2026',
    artist: { name: 'Mudhoney' },
    venue: { name: venue, city: { name: city } },
    sets: { set: songs.length ? [{ song: songs.map(name => ({ name })) }] : [] }
  };
}

describe('showSetlist', () => {
  let setlistClient;
  let logger;

  beforeEach(() => {
    logger = { info: sinon.stub(), debug: sinon.stub(), warn: sinon.stub(), error: sinon.stub() };
    setlistClient = { searchSetlistsByArtistOnDate: sinon.stub() };
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should search setlist.fm for the date and city', async () => {
    setlistClient.searchSetlistsByArtistOnDate.resolves({ setlist: [setlist('s1', ['A'])] });

    const found = await findShowSetlist({ setlistClient, logger }, 'mbid-1', '20261022', 'Sydney');

    expect(setlistClient.searchSetlistsByArtistOnDate.calledOnceWith('mbid-1', '22-10-2026', 'Sydney')).to.be.true;
    expect(found.id).to.equal('s1');
  });

  it('should pass no city when none is given', async () => {
    setlistClient.searchSetlistsByArtistOnDate.resolves({ setlist: [setlist('s1', ['A'])] });

    await findShowSetlist({ setlistClient, logger }, 'mbid-1', '20261022');

    expect(setlistClient.searchSetlistsByArtistOnDate.firstCall.args[2]).to.be.null;
  });

  it('should ignore setlists with no songs yet', async () => {
    setlistClient.searchSetlistsByArtistOnDate.resolves({ setlist: [setlist('empty', [])] });

    expect(await findShowSetlist({ setlistClient, logger }, 'mbid-1', '20261022')).to.be.null;
  });

  it('should use the first of several shows that day and suggest --city', async () => {
    setlistClient.searchSetlistsByArtistOnDate.resolves({
      setlist: [setlist('a', ['A'], 'Club', 'Sydney'), setlist('b', ['B'], 'Festival', 'Melbourne')]
    });

    const found = await findShowSetlist({ setlistClient, logger }, 'mbid-1', '20261022');

    expect(found.id).to.equal('a');
    expect(logger.warn.calledWithMatch('--city')).to.be.true;
    expect(logger.warn.calledWithMatch('Festival, Melbourne')).to.be.true;
  });
});
