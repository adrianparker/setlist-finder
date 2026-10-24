import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { buildSetlistPlaylist } from '../../src/commands/setlist.js';
import { SpotifyMatcher } from '../../src/services/spotifyMatcher.js';

function track(id, name, albumName, releaseDate) {
  return {
    id,
    name,
    uri: `spotify:track:${id}`,
    artists: [{ name: 'Mudhoney', id: 'a1' }],
    album: { id: `album-${id}`, name: albumName, releaseDate, albumType: 'album', images: [] }
  };
}

describe('setlist command playlist creation', () => {
  let deps;
  let setlistResponse;

  beforeEach(() => {
    const logger = {
      info: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub(),
      warn: sinon.stub()
    };
    deps = {
      logger,
      matcher: new SpotifyMatcher(logger),
      spotifyClient: {
        searchTracks: sinon.stub().resolves([]),
        createPlaylist: sinon.stub().resolves({
          id: 'p1',
          name: '20261029 Mudhoney - predicted setlist',
          uri: 'spotify:playlist:p1',
          externalUrl: 'https://open.spotify.com/playlist/p1'
        }),
        addTracksToPlaylist: sinon.stub().resolves({ tracksAdded: 2, batches: 1, snapshotId: 's' })
      },
      auth: { getUserAccessToken: sinon.stub().resolves('user-token') },
      output: sinon.stub(),
      confirm: sinon.stub().resolves('y')
    };
    deps.spotifyClient.searchTracks.withArgs('Mudhoney', 'If I Think')
      .resolves([track('t1', 'If I Think - Live in Berlin 10/10/88', 'Superfuzz Bigmuff (Deluxe Edition)', '1988-10-01')]);
    deps.spotifyClient.searchTracks.withArgs('Mudhoney', 'Mudride')
      .resolves([track('t2', 'Mudride', 'Superfuzz Bigmuff', '1988-10-01')]);

    setlistResponse = {
      eventDate: '29-10-2026',
      artist: { name: 'Mudhoney' },
      sets: {
        set: [
          { song: [{ name: 'Intro', tape: true }, { name: 'If I Think' }, { name: 'Unknown Song' }] },
          { encore: 1, song: { name: 'Mudride' } }
        ]
      }
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should match songs in order, skipping tapes, and print the table', async () => {
    const outcome = await buildSetlistPlaylist(setlistResponse, deps);

    expect(deps.spotifyClient.searchTracks.args.map(args => args[1])).to.deep.equal(['If I Think', 'Unknown Song', 'Mudride']);
    expect(outcome.results.map(r => r.type)).to.deep.equal(['LIVE', 'NO MATCH', 'STUDIO']);
    expect(outcome.results[2].note).to.equal('encore');
    const table = deps.output.firstCall.args[0];
    expect(table).to.match(/ 1\s+If I Think\s+LIVE/);
    expect(table).to.include('3 songs: 1 live, 1 studio, 1 not matched');
  });

  it('should create the playlist with the setlist date and artist once confirmed', async () => {
    const outcome = await buildSetlistPlaylist(setlistResponse, deps);

    expect(deps.confirm.firstCall.args[0]).to.include('"20261029 Mudhoney - predicted setlist"');
    expect(deps.auth.getUserAccessToken.calledOnce).to.be.true;
    const [token, name, options] = deps.spotifyClient.createPlaylist.firstCall.args;
    expect(token).to.equal('user-token');
    expect(name).to.equal('20261029 Mudhoney - predicted setlist');
    expect(options).to.deep.equal({
      isPublic: true,
      description: 'The most likely setlist for Mudhoney for their upcoming show.'
    });
    expect(deps.spotifyClient.addTracksToPlaylist.calledOnceWith('user-token', 'p1', ['spotify:track:t1', 'spotify:track:t2'])).to.be.true;
    expect(deps.logger.info.calledWith('URL: https://open.spotify.com/playlist/p1')).to.be.true;
    expect(outcome.playlist.id).to.equal('p1');
  });

  it('should not sign in or create anything when the user declines', async () => {
    deps.confirm.resolves('');

    const outcome = await buildSetlistPlaylist(setlistResponse, deps);

    expect(outcome.playlist).to.be.null;
    expect(deps.auth.getUserAccessToken.called).to.be.false;
    expect(deps.spotifyClient.createPlaylist.called).to.be.false;
  });

  it('should not ask when nothing matched', async () => {
    deps.spotifyClient.searchTracks = sinon.stub().resolves([]);

    const outcome = await buildSetlistPlaylist(setlistResponse, deps);

    expect(outcome.playlist).to.be.null;
    expect(deps.confirm.called).to.be.false;
    expect(deps.logger.warn.calledWithMatch('No songs matched')).to.be.true;
  });

  it('should return null for a setlist with only tapes', async () => {
    setlistResponse.sets.set = [{ song: { name: 'Intro', tape: true } }];

    expect(await buildSetlistPlaylist(setlistResponse, deps)).to.be.null;
    expect(deps.spotifyClient.searchTracks.called).to.be.false;
  });

  it('should never ask for a pasted access token', async () => {
    await buildSetlistPlaylist(setlistResponse, deps);

    expect(deps.confirm.callCount).to.equal(1);
    expect(deps.confirm.firstCall.args[0]).to.not.match(/token/i);
  });
});

describe('source files', () => {
  it('should contain no emoji in the commands', async () => {
    const fs = await import('fs');
    for (const file of ['src/commands/setlist.js', 'src/commands/playlist.js', 'src/commands/login.js', 'src/commands/searchArtist.js']) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source, file).to.not.match(/\p{Extended_Pictographic}|\\u27(13|17)/u);
    }
  });
});
