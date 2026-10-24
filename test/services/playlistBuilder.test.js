import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { SpotifyMatcher } from '../../src/services/spotifyMatcher.js';
import {
  matchSongs,
  summariseMatches,
  formatMatchTable,
  buildPlaylistTitle,
  buildPlaylistDescription,
  setlistDateToPerformanceDate,
  createPlaylistFromMatches,
  MATCH_TYPE
} from '../../src/services/playlistBuilder.js';

function track(id, name, albumName, releaseDate, artist = 'Mudhoney') {
  return {
    id,
    name,
    uri: `spotify:track:${id}`,
    artists: [{ name: artist, id: 'a1' }],
    album: { id: `album-${id}`, name: albumName, releaseDate, images: [] }
  };
}

function result(position, type, extra = {}) {
  const matched = type !== MATCH_TYPE.NO_MATCH;
  return {
    position,
    song: `Song ${position}`,
    note: '',
    type,
    trackName: matched ? `Song ${position}` : null,
    album: matched ? 'Album' : null,
    releaseDate: matched ? '2018-01-01' : null,
    uri: matched ? `spotify:track:t${position}` : null,
    url: null,
    ...extra
  };
}

describe('playlistBuilder', () => {
  let logger;
  let spotifyClient;
  let matcher;

  beforeEach(() => {
    logger = {
      info: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub(),
      warn: sinon.stub()
    };
    spotifyClient = {
      searchTracks: sinon.stub(),
      createPlaylist: sinon.stub(),
      addTracksToPlaylist: sinon.stub()
    };
    matcher = new SpotifyMatcher(logger);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('matchSongs', () => {
    it('should match songs in order and label live, studio and unmatched', async () => {
      spotifyClient.searchTracks.withArgs('Mudhoney', 'If I Think')
        .resolves([track('t1', 'If I Think - Live', 'LiE (Live in Europe)', '2018-08-31')]);
      spotifyClient.searchTracks.withArgs('Mudhoney', 'Mudride')
        .resolves([track('t2', 'Mudride', 'Superfuzz Bigmuff', '1988-10-01')]);
      spotifyClient.searchTracks.withArgs('Mudhoney', 'Unknown Song').resolves([]);

      const results = await matchSongs({ spotifyClient, matcher, logger }, 'Mudhoney', [
        { name: 'If I Think', note: 'every show (opener)' },
        { name: 'Mudride', note: '' },
        { name: 'Unknown Song', note: 'once' }
      ]);

      expect(results.map(r => [r.position, r.song, r.type])).to.deep.equal([
        [1, 'If I Think', MATCH_TYPE.LIVE],
        [2, 'Mudride', MATCH_TYPE.STUDIO],
        [3, 'Unknown Song', MATCH_TYPE.NO_MATCH]
      ]);
      expect(results[0]).to.include({
        note: 'every show (opener)',
        trackName: 'If I Think - Live',
        album: 'LiE (Live in Europe)',
        releaseDate: '2018-08-31',
        uri: 'spotify:track:t1',
        url: 'https://open.spotify.com/track/t1'
      });
      expect(results[2].uri).to.be.null;
      expect(logger.warn.calledOnce).to.be.true;
    });

    it('should record a search error as no match and carry on', async () => {
      spotifyClient.searchTracks.onFirstCall().rejects(new Error('HTTP 500'));
      spotifyClient.searchTracks.onSecondCall().resolves([track('t2', 'Mudride', 'Superfuzz Bigmuff', '1988')]);

      const results = await matchSongs({ spotifyClient, matcher, logger }, 'Mudhoney', [
        { name: 'A' },
        { name: 'Mudride' }
      ]);

      expect(results.map(r => r.type)).to.deep.equal([MATCH_TYPE.NO_MATCH, MATCH_TYPE.STUDIO]);
      expect(logger.error.calledOnce).to.be.true;
    });
  });

  describe('summariseMatches', () => {
    it('should count live, studio and unmatched', () => {
      const results = [result(1, MATCH_TYPE.LIVE), result(2, MATCH_TYPE.STUDIO), result(3, MATCH_TYPE.LIVE), result(4, MATCH_TYPE.NO_MATCH)];
      expect(summariseMatches(results)).to.deep.equal({ total: 4, live: 2, studio: 1, unmatched: 1 });
    });
  });

  describe('formatMatchTable', () => {
    it('should show position, song, type, track, album and year for each song', () => {
      const table = formatMatchTable([
        result(1, MATCH_TYPE.LIVE, { song: 'If I Think', album: 'LiE (Live in Europe)', releaseDate: '2018-08-31' }),
        result(2, MATCH_TYPE.NO_MATCH, { song: 'Unknown Song' })
      ]);
      const lines = table.split('\n');

      expect(lines[0]).to.match(/^#\s+Song\s+Type\s+Spotify track\s+Album\s+Year$/);
      expect(lines[2]).to.match(/^ 1\s+If I Think\s+LIVE\s+Song 1\s+LiE \(Live in Europe\)\s+2018$/);
      expect(lines[3]).to.match(/^ 2\s+Unknown Song\s+NO MATCH$/);
      expect(table).to.include('2 songs: 1 live, 0 studio, 1 not matched');
    });

    it('should shorten long values to keep columns aligned', () => {
      const table = formatMatchTable([result(1, MATCH_TYPE.STUDIO, { song: 'X'.repeat(60) })]);
      expect(table).to.include(`${'X'.repeat(31)}...`);
      expect(table).to.not.include('X'.repeat(35));
    });

    it('should contain no emoji', () => {
      const table = formatMatchTable([result(1, MATCH_TYPE.LIVE), result(2, MATCH_TYPE.NO_MATCH)]);
      expect(table).to.not.match(/\p{Extended_Pictographic}/u);
    });
  });

  describe('buildPlaylistTitle', () => {
    it('should format the title as "YYYYMMDD performer - predicted setlist"', () => {
      expect(buildPlaylistTitle('20261029', 'Mudhoney')).to.equal('20261029 Mudhoney - predicted setlist');
    });

    it('should trim the performer name', () => {
      expect(buildPlaylistTitle('20261029', '  Mudhoney ')).to.equal('20261029 Mudhoney - predicted setlist');
    });

    it('should reject a date not written as YYYYMMDD', () => {
      ['2026-10-29', '29102026', '202610', '', undefined].forEach(date => {
        expect(() => buildPlaylistTitle(date, 'Mudhoney'), String(date)).to.throw('YYYYMMDD');
      });
    });

    it('should reject an impossible calendar date', () => {
      expect(() => buildPlaylistTitle('20260230', 'Mudhoney')).to.throw('YYYYMMDD');
      expect(() => buildPlaylistTitle('20261301', 'Mudhoney')).to.throw('YYYYMMDD');
    });

    it('should require a performer', () => {
      expect(() => buildPlaylistTitle('20261029', ' ')).to.throw('Performer is required');
    });
  });

  describe('buildPlaylistDescription', () => {
    it('should describe the performer\'s upcoming show', () => {
      expect(buildPlaylistDescription('Mudhoney')).to.equal('The most likely setlist for Mudhoney for their upcoming show.');
    });

    it('should require a performer', () => {
      expect(() => buildPlaylistDescription('')).to.throw('Performer is required');
    });
  });

  describe('setlistDateToPerformanceDate', () => {
    it('should convert a setlist.fm dd-MM-yyyy date to YYYYMMDD', () => {
      expect(setlistDateToPerformanceDate('29-10-2026')).to.equal('20261029');
    });

    it('should reject other formats', () => {
      expect(() => setlistDateToPerformanceDate('2026-10-29')).to.throw('Unrecognised');
    });
  });

  describe('createPlaylistFromMatches', () => {
    it('should create the playlist and add matched tracks in setlist order', async () => {
      spotifyClient.createPlaylist.resolves({ id: 'p1', name: 'My list', uri: 'spotify:playlist:p1', externalUrl: 'https://open.spotify.com/playlist/p1' });
      spotifyClient.addTracksToPlaylist.resolves({ tracksAdded: 2, batches: 1, snapshotId: 's' });

      const playlist = await createPlaylistFromMatches({ spotifyClient, logger }, 'user-token',
        { name: 'My list', description: 'desc', isPublic: false },
        [result(1, MATCH_TYPE.LIVE), result(2, MATCH_TYPE.NO_MATCH), result(3, MATCH_TYPE.STUDIO)]);

      expect(spotifyClient.createPlaylist.calledOnceWith('user-token', 'My list', { isPublic: false, description: 'desc' })).to.be.true;
      expect(spotifyClient.addTracksToPlaylist.calledOnceWith('user-token', 'p1', ['spotify:track:t1', 'spotify:track:t3'])).to.be.true;
      expect(playlist).to.include({ id: 'p1', externalUrl: 'https://open.spotify.com/playlist/p1', tracksAdded: 2 });
    });

    it('should not create an empty playlist', async () => {
      try {
        await createPlaylistFromMatches({ spotifyClient, logger }, 'user-token', { name: 'N' }, [result(1, MATCH_TYPE.NO_MATCH)]);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('No matched tracks');
        expect(spotifyClient.createPlaylist.called).to.be.false;
      }
    });
  });
});
