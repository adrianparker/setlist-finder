import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { gig } from '../../src/commands/gig.js';
import { SpotifyMatcher } from '../../src/services/spotifyMatcher.js';

function setlist(id, eventDate, mainSongs, encoreSongs = []) {
  const set = [{ song: mainSongs.map(name => ({ name })) }];
  if (encoreSongs.length) set.push({ encore: 1, song: encoreSongs.map(name => ({ name })) });
  return {
    id,
    eventDate,
    artist: { name: 'Mudhoney' },
    venue: { name: `Venue ${id}`, city: { name: 'Sydney', country: { name: 'Australia' } } },
    sets: { set }
  };
}

function track(id, name, albumName) {
  return {
    id,
    name,
    uri: `spotify:track:${id}`,
    artists: [{ name: 'Mudhoney', id: 'a1' }],
    album: { id: `album-${id}`, name: albumName, releaseDate: '2009-10-05', albumType: 'album', images: [] }
  };
}

describe('gig command (predicted setlist)', () => {
  let deps;
  let savedExitCode;

  beforeEach(() => {
    savedExitCode = process.exitCode;
    const logger = {
      info: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub(),
      warn: sinon.stub()
    };
    deps = {
      logger,
      today: '20261025',
      matcher: new SpotifyMatcher(logger),
      mbClient: { searchArtist: sinon.stub().resolves({ name: 'Mudhoney', mbid: 'mbid-1' }) },
      setlistClient: {
        searchSetlistsByArtist: sinon.stub().resolves({
          total: 3,
          itemsPerPage: 20,
          setlist: [
            setlist('empty', '24-10-2026', []),
            setlist('s1', '22-10-2026', ['If I Think', 'Good Enough'], ['Mudride']),
            setlist('s2', '21-10-2026', ['If I Think', 'Good Enough'], ['Mudride'])
          ]
        })
      },
      spotifyClient: {
        searchTracks: sinon.stub().resolves([]),
        getCurrentUser: sinon.stub().resolves({ id: 'adrian' }),
        listMyPlaylists: sinon.stub().resolves([]),
        createPlaylist: sinon.stub().resolves({
          id: 'p1',
          name: '20261029 Mudhoney - predicted setlist',
          uri: 'spotify:playlist:p1',
          externalUrl: 'https://open.spotify.com/playlist/p1'
        }),
        addTracksToPlaylist: sinon.stub().resolves({ tracksAdded: 3, batches: 1, snapshotId: 's' }),
        updatePlaylistDetails: sinon.stub().resolves(),
        getPlaylistTrackUris: sinon.stub().resolves([]),
        replacePlaylistTracks: sinon.stub().resolves()
      },
      auth: { getUserAccessToken: sinon.stub().resolves('user-token') },
      output: sinon.stub()
    };
    deps.spotifyClient.searchTracks.withArgs('Mudhoney', 'If I Think').resolves([track('t1', 'If I Think', 'Live At El Sol')]);
    deps.spotifyClient.searchTracks.withArgs('Mudhoney', 'Good Enough').resolves([track('t2', 'Good Enough', 'Every Good Boy Deserves Fudge')]);
    deps.spotifyClient.searchTracks.withArgs('Mudhoney', 'Mudride').resolves([track('t3', 'Mudride', 'Live At El Sol')]);
  });

  afterEach(() => {
    sinon.restore();
    process.exitCode = savedExitCode;
  });

  it('should predict from earlier setlists and create the playlist when none exists', async () => {
    const outcome = await gig({ performer: 'Mudhoney', date: '20261029' }, deps);

    expect(deps.mbClient.searchArtist.calledOnceWith('Mudhoney')).to.be.true;
    expect(deps.setlistClient.searchSetlistsByArtist.firstCall.args).to.deep.equal(['mbid-1', null, 1]);
    expect(outcome.prediction.songs.map(s => s.name)).to.deep.equal(['If I Think', 'Good Enough', 'Mudride']);

    const table = deps.output.firstCall.args[0];
    expect(table).to.match(/ 1\s+If I Think\s+LIVE.*every show$/m);
    expect(table).to.match(/ 3\s+Mudride\s+LIVE.*encore - every show$/m);

    const [token, name, options] = deps.spotifyClient.createPlaylist.firstCall.args;
    expect(token).to.equal('user-token');
    expect(name).to.equal('20261029 Mudhoney - predicted setlist');
    expect(options).to.deep.equal({ isPublic: true, description: 'The most likely setlist for Mudhoney for their upcoming show.' });
    expect(deps.spotifyClient.addTracksToPlaylist.calledOnceWith('user-token', 'p1', ['spotify:track:t1', 'spotify:track:t2', 'spotify:track:t3'])).to.be.true;
    expect(outcome.saved.action).to.equal('created');
    expect(deps.logger.info.calledWith('URL: https://open.spotify.com/playlist/p1')).to.be.true;
  });

  it('should treat today as a future show', async () => {
    const outcome = await gig({ performer: 'Mudhoney', date: '20261025' }, deps);

    expect(outcome.saved.action).to.equal('created');
    expect(deps.spotifyClient.createPlaylist.firstCall.args[1]).to.equal('20261025 Mudhoney - predicted setlist');
  });

  it('should only use setlists dated before the show', async () => {
    deps.today = '20261020';
    const outcome = await gig({ performer: 'Mudhoney', date: '20261022' }, deps);

    expect(outcome.prediction.sources.map(s => s.id)).to.deep.equal(['s2']);
  });

  it('should update the existing playlist in place when the prediction changed', async () => {
    deps.spotifyClient.listMyPlaylists.resolves([{
      id: 'existing',
      name: '20261029 Mudhoney - predicted setlist',
      description: 'The most likely setlist for Mudhoney for their upcoming show.',
      isPublic: true,
      ownerId: 'adrian',
      externalUrl: 'https://open.spotify.com/playlist/existing'
    }]);
    deps.spotifyClient.getPlaylistTrackUris.resolves(['spotify:track:t1']);

    const outcome = await gig({ performer: 'Mudhoney', date: '20261029' }, deps);

    expect(outcome.saved.action).to.equal('updated');
    expect(deps.spotifyClient.createPlaylist.called).to.be.false;
    expect(deps.spotifyClient.replacePlaylistTracks.calledOnceWith('user-token', 'existing', ['spotify:track:t1', 'spotify:track:t2', 'spotify:track:t3'])).to.be.true;
    expect(deps.logger.info.calledWith('URL: https://open.spotify.com/playlist/existing')).to.be.true;
  });

  it('should make the playlist private with --private', async () => {
    await gig({ performer: 'Mudhoney', date: '20261029', private: true }, deps);
    expect(deps.spotifyClient.createPlaylist.firstCall.args[2].isPublic).to.be.false;
  });

  it('should use the requested number of earlier shows', async () => {
    const outcome = await gig({ performer: 'Mudhoney', date: '20261029', shows: '1' }, deps);
    expect(outcome.prediction.sources.map(s => s.id)).to.deep.equal(['s1']);
  });

  it('should match and print without signing in or saving on --dry-run', async () => {
    const outcome = await gig({ performer: 'Mudhoney', date: '20261029', dryRun: true }, deps);

    expect(deps.output.calledOnce).to.be.true;
    expect(deps.auth.getUserAccessToken.called).to.be.false;
    expect(deps.spotifyClient.listMyPlaylists.called).to.be.false;
    expect(deps.spotifyClient.createPlaylist.called).to.be.false;
    expect(outcome.saved).to.be.null;
  });

  it('should sign in before calling setlist.fm', async () => {
    await gig({ performer: 'Mudhoney', date: '20261029' }, deps);
    expect(deps.auth.getUserAccessToken.calledBefore(deps.setlistClient.searchSetlistsByArtist)).to.be.true;
  });

  it('should reject an invalid date before any API call', async () => {
    const outcome = await gig({ performer: 'Mudhoney', date: '29-10-2026' }, deps);

    expect(outcome).to.be.null;
    expect(deps.logger.error.calledWithMatch('YYYYMMDD')).to.be.true;
    expect(deps.mbClient.searchArtist.called).to.be.false;
    expect(process.exitCode).to.equal(1);
  });

  it('should not yet handle past dates', async () => {
    deps.today = '20261030';
    const outcome = await gig({ performer: 'Mudhoney', date: '20261022' }, deps);

    expect(outcome).to.be.null;
    expect(deps.logger.error.calledWithMatch('not supported yet')).to.be.true;
    expect(deps.setlistClient.searchSetlistsByArtist.called).to.be.false;
  });

  it('should report an unknown performer', async () => {
    deps.mbClient.searchArtist.resolves(null);

    const outcome = await gig({ performer: 'Nobody At All', date: '20261029' }, deps);

    expect(outcome).to.be.null;
    expect(deps.logger.error.calledWithMatch('No artist found for "Nobody At All"')).to.be.true;
  });

  it('should report when there are no earlier setlists with songs', async () => {
    deps.setlistClient.searchSetlistsByArtist.resolves({ total: 1, itemsPerPage: 20, setlist: [setlist('empty', '24-10-2026', [])] });

    const outcome = await gig({ performer: 'Mudhoney', date: '20261029' }, deps);

    expect(outcome).to.be.null;
    expect(deps.logger.error.calledWithMatch('No setlists with songs found')).to.be.true;
    expect(deps.spotifyClient.createPlaylist.called).to.be.false;
  });
});
