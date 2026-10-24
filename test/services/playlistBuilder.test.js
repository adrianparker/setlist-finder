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
  findShowPlaylist,
  saveShowPlaylist,
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

  describe('formatMatchTable notes column', () => {
    it('should add a Played column when songs have notes', () => {
      const table = formatMatchTable([result(1, MATCH_TYPE.LIVE, { note: 'every show' })]);
      const lines = table.split('\n');

      expect(lines[0]).to.match(/Year\s+Played$/);
      expect(lines[2]).to.match(/every show$/);
    });
  });

  describe('show playlists', () => {
    const show = { date: '20261029', performer: 'Mudhoney' };
    const owned = (id, name, extra = {}) => ({
      id, name, description: '', isPublic: true, ownerId: 'adrian', externalUrl: `https://open.spotify.com/playlist/${id}`, ...extra
    });

    beforeEach(() => {
      spotifyClient.getCurrentUser = sinon.stub().resolves({ id: 'adrian' });
      spotifyClient.listMyPlaylists = sinon.stub().resolves([]);
      spotifyClient.updatePlaylistDetails = sinon.stub().resolves();
      spotifyClient.getPlaylistTrackUris = sinon.stub().resolves([]);
      spotifyClient.replacePlaylistTracks = sinon.stub().resolves();
    });

    describe('findShowPlaylist', () => {
      it('should find the user\'s playlist whose title starts with "YYYYMMDD Performer -", predicted or actual', async () => {
        spotifyClient.listMyPlaylists.resolves([
          owned('other', 'Road trip'),
          owned('other-date', '20261030 Mudhoney - predicted setlist'),
          owned('mine', '20261029 mudhoney - actual setlist')
        ]);

        const found = await findShowPlaylist({ spotifyClient, logger }, 'user-token', show);

        expect(found.id).to.equal('mine');
      });

      it('should ignore playlists owned by someone else', async () => {
        spotifyClient.listMyPlaylists.resolves([owned('theirs', '20261029 Mudhoney - predicted setlist', { ownerId: 'someone' })]);

        expect(await findShowPlaylist({ spotifyClient, logger }, 'user-token', show)).to.be.null;
      });

      it('should not match a different performer whose name starts the same', async () => {
        spotifyClient.listMyPlaylists.resolves([owned('x', '20261029 Mudhoney Tribute - predicted setlist')]);

        expect(await findShowPlaylist({ spotifyClient, logger }, 'user-token', show)).to.be.null;
      });

      it('should use the first match and warn when there are several', async () => {
        spotifyClient.listMyPlaylists.resolves([
          owned('first', '20261029 Mudhoney - predicted setlist'),
          owned('second', '20261029 Mudhoney - predicted setlist')
        ]);

        const found = await findShowPlaylist({ spotifyClient, logger }, 'user-token', show);

        expect(found.id).to.equal('first');
        expect(logger.warn.calledWithMatch('2 playlists')).to.be.true;
      });
    });

    describe('saveShowPlaylist', () => {
      const details = { ...show, name: '20261029 Mudhoney - predicted setlist', description: 'The most likely setlist for Mudhoney for their upcoming show.' };
      const matches = [result(1, MATCH_TYPE.LIVE), result(2, MATCH_TYPE.NO_MATCH), result(3, MATCH_TYPE.STUDIO)];

      it('should create the playlist when none exists', async () => {
        spotifyClient.createPlaylist.resolves({ id: 'new', name: details.name, uri: 'spotify:playlist:new', externalUrl: 'https://open.spotify.com/playlist/new' });
        spotifyClient.addTracksToPlaylist.resolves({ tracksAdded: 2, batches: 1, snapshotId: 's' });

        const saved = await saveShowPlaylist({ spotifyClient, logger }, 'user-token', { ...details, isPublic: true }, matches);

        expect(saved.action).to.equal('created');
        expect(spotifyClient.createPlaylist.calledOnceWith('user-token', details.name, { isPublic: true, description: details.description })).to.be.true;
        expect(spotifyClient.addTracksToPlaylist.calledOnceWith('user-token', 'new', ['spotify:track:t1', 'spotify:track:t3'])).to.be.true;
        expect(saved.playlist.externalUrl).to.equal('https://open.spotify.com/playlist/new');
      });

      it('should do nothing when the existing playlist already matches', async () => {
        spotifyClient.listMyPlaylists.resolves([owned('p1', details.name, { description: details.description })]);
        spotifyClient.getPlaylistTrackUris.resolves(['spotify:track:t1', 'spotify:track:t3']);

        const saved = await saveShowPlaylist({ spotifyClient, logger }, 'user-token', details, matches);

        expect(saved.action).to.equal('unchanged');
        expect(saved.playlist.id).to.equal('p1');
        expect(spotifyClient.updatePlaylistDetails.called).to.be.false;
        expect(spotifyClient.replacePlaylistTracks.called).to.be.false;
        expect(spotifyClient.createPlaylist.called).to.be.false;
      });

      it('should replace the tracks in place when they or their order changed', async () => {
        spotifyClient.listMyPlaylists.resolves([owned('p1', details.name, { description: details.description })]);
        spotifyClient.getPlaylistTrackUris.resolves(['spotify:track:t3', 'spotify:track:t1']);

        const saved = await saveShowPlaylist({ spotifyClient, logger }, 'user-token', details, matches);

        expect(saved.action).to.equal('updated');
        expect(saved.changes).to.deep.equal(['tracks']);
        expect(spotifyClient.replacePlaylistTracks.calledOnceWith('user-token', 'p1', ['spotify:track:t1', 'spotify:track:t3'])).to.be.true;
        expect(spotifyClient.updatePlaylistDetails.called).to.be.false;
      });

      it('should rename the playlist in place, e.g. from predicted to actual', async () => {
        spotifyClient.listMyPlaylists.resolves([owned('p1', '20261029 Mudhoney - predicted setlist', { description: 'old' })]);
        spotifyClient.getPlaylistTrackUris.resolves(['spotify:track:t1', 'spotify:track:t3']);
        const actual = { ...show, name: '20261029 Mudhoney - actual setlist', description: 'The setlist Mudhoney played.' };

        const saved = await saveShowPlaylist({ spotifyClient, logger }, 'user-token', actual, matches);

        expect(saved.changes).to.deep.equal(['details']);
        expect(spotifyClient.updatePlaylistDetails.calledOnceWith('user-token', 'p1', {
          name: actual.name, description: actual.description, isPublic: undefined
        })).to.be.true;
        expect(saved.playlist).to.include({ id: 'p1', name: actual.name });
      });

      it('should compare descriptions after decoding the HTML entities Spotify returns', async () => {
        const withApostrophe = { ...show, performer: 'Guns N\' Roses', name: '20261029 Guns N\' Roses - predicted setlist', description: 'The most likely setlist for Guns N\' Roses for their upcoming show.' };
        spotifyClient.listMyPlaylists.resolves([owned('p1', withApostrophe.name, { description: 'The most likely setlist for Guns N&#x27;  Roses for their upcoming show.'.replace('  ', ' ') })]);
        spotifyClient.getPlaylistTrackUris.resolves(['spotify:track:t1', 'spotify:track:t3']);

        const saved = await saveShowPlaylist({ spotifyClient, logger }, 'user-token', withApostrophe, matches);

        expect(saved.action).to.equal('unchanged');
      });

      it('should change visibility only when asked', async () => {
        spotifyClient.listMyPlaylists.resolves([owned('p1', details.name, { description: details.description, isPublic: true })]);
        spotifyClient.getPlaylistTrackUris.resolves(['spotify:track:t1', 'spotify:track:t3']);

        const saved = await saveShowPlaylist({ spotifyClient, logger }, 'user-token', { ...details, isPublic: false }, matches);

        expect(saved.changes).to.deep.equal(['details']);
        expect(spotifyClient.updatePlaylistDetails.firstCall.args[2].isPublic).to.be.false;
      });
    });
  });
});
