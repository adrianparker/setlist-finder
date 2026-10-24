import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { playlist } from '../../src/commands/playlist.js';
import { SpotifyMatcher } from '../../src/services/spotifyMatcher.js';

function track(id, name, albumName, releaseDate) {
  return {
    id,
    name,
    uri: `spotify:track:${id}`,
    artists: [{ name: 'Mudhoney', id: 'a1' }],
    album: { id: `album-${id}`, name: albumName, releaseDate, images: [] }
  };
}

describe('playlist command', () => {
  let deps;
  let tmpDir;
  let file;
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
      matcher: new SpotifyMatcher(logger),
      spotifyClient: {
        searchTracks: sinon.stub(),
        createPlaylist: sinon.stub().resolves({
          id: 'p1',
          name: 'Mudhoney - predicted setlist',
          uri: 'spotify:playlist:p1',
          externalUrl: 'https://open.spotify.com/playlist/p1'
        }),
        addTracksToPlaylist: sinon.stub().resolves({ tracksAdded: 2, batches: 1, snapshotId: 's' })
      },
      auth: { getUserAccessToken: sinon.stub().resolves('user-token') },
      output: sinon.stub()
    };
    deps.spotifyClient.searchTracks.withArgs('Mudhoney', 'If I Think')
      .resolves([track('t1', 'If I Think - Live', 'LiE (Live in Europe)', '2018-08-31')]);
    deps.spotifyClient.searchTracks.withArgs('Mudhoney', 'Mudride')
      .resolves([track('t2', 'Mudride', 'Superfuzz Bigmuff', '1988-10-01')]);
    deps.spotifyClient.searchTracks.withArgs('Mudhoney', 'Nope').resolves([]);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playlist-command-test-'));
    file = path.join(tmpDir, 'list.json');
    fs.writeFileSync(file, JSON.stringify({
      artist: 'Mudhoney',
      title: 'Mudhoney predicted setlist',
      songs: [
        { name: 'If I Think', note: 'every show (opener)' },
        { name: 'Nope', note: 'once' },
        { name: 'Mudride', note: 'encore' }
      ]
    }));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exitCode = savedExitCode;
  });

  it('should match, print the table, create the playlist and add tracks in order', async () => {
    const outcome = await playlist({ file, date: '20261029', performer: 'Mudhoney' }, deps);

    expect(deps.output.calledOnce).to.be.true;
    const table = deps.output.firstCall.args[0];
    expect(table).to.match(/ 1\s+If I Think\s+LIVE/);
    expect(table).to.match(/ 2\s+Nope\s+NO MATCH/);
    expect(table).to.match(/ 3\s+Mudride\s+STUDIO/);

    const [token, name, options] = deps.spotifyClient.createPlaylist.firstCall.args;
    expect(token).to.equal('user-token');
    expect(name).to.equal('20261029 Mudhoney - predicted setlist');
    expect(options.isPublic).to.be.true;
    expect(options.description).to.equal('The most likely setlist for Mudhoney for their upcoming show.');

    expect(deps.spotifyClient.addTracksToPlaylist.calledOnceWith('user-token', 'p1', ['spotify:track:t1', 'spotify:track:t2'])).to.be.true;
    expect(deps.logger.info.calledWith('URL: https://open.spotify.com/playlist/p1')).to.be.true;
    expect(outcome.playlist.id).to.equal('p1');
  });

  it('should take the performer for the title from the argument, not the file', async () => {
    await playlist({ file, date: '20261029', performer: 'Mudhoney with guests' }, deps);

    const [, name, options] = deps.spotifyClient.createPlaylist.firstCall.args;
    expect(name).to.equal('20261029 Mudhoney with guests - predicted setlist');
    expect(options.description).to.equal('The most likely setlist for Mudhoney with guests for their upcoming show.');
    // Songs are still searched under the file's artist
    expect(deps.spotifyClient.searchTracks.firstCall.args[0]).to.equal('Mudhoney');
  });

  it('should reject a bad date before signing in or searching', async () => {
    const outcome = await playlist({ file, date: '2026-10-29', performer: 'Mudhoney' }, deps);

    expect(outcome).to.be.null;
    expect(deps.logger.error.calledWithMatch('YYYYMMDD')).to.be.true;
    expect(deps.auth.getUserAccessToken.called).to.be.false;
    expect(deps.spotifyClient.searchTracks.called).to.be.false;
    expect(process.exitCode).to.equal(1);
  });

  it('should reject a missing performer', async () => {
    const outcome = await playlist({ file, date: '20261029' }, deps);

    expect(outcome).to.be.null;
    expect(deps.logger.error.calledWithMatch('Performer is required')).to.be.true;
  });

  it('should create a private playlist with --private', async () => {
    await playlist({ file, date: '20261029', performer: 'Mudhoney', private: true }, deps);
    expect(deps.spotifyClient.createPlaylist.firstCall.args[2].isPublic).to.be.false;
  });

  it('should only match and print with --dry-run', async () => {
    const outcome = await playlist({ file, date: '20261029', performer: 'Mudhoney', dryRun: true }, deps);

    expect(deps.output.calledOnce).to.be.true;
    expect(deps.auth.getUserAccessToken.called).to.be.false;
    expect(deps.spotifyClient.createPlaylist.called).to.be.false;
    expect(deps.spotifyClient.addTracksToPlaylist.called).to.be.false;
    expect(outcome.results).to.have.length(3);
    expect(outcome.playlist).to.be.null;
  });

  it('should sign in before matching', async () => {
    await playlist({ file, date: '20261029', performer: 'Mudhoney' }, deps);
    expect(deps.auth.getUserAccessToken.calledBefore(deps.spotifyClient.searchTracks)).to.be.true;
  });

  it('should stop without matching when sign-in fails', async () => {
    deps.auth.getUserAccessToken.rejects(new Error('Timed out waiting for Spotify sign-in'));

    const outcome = await playlist({ file, date: '20261029', performer: 'Mudhoney' }, deps);

    expect(outcome).to.be.null;
    expect(deps.spotifyClient.searchTracks.called).to.be.false;
    expect(deps.logger.error.calledWithMatch('Timed out waiting for Spotify sign-in')).to.be.true;
    expect(process.exitCode).to.equal(1);
  });

  it('should report a bad song-list file', async () => {
    const outcome = await playlist({ file: path.join(tmpDir, 'missing.json'), date: '20261029', performer: 'Mudhoney' }, deps);

    expect(outcome).to.be.null;
    expect(deps.logger.error.calledWithMatch('Cannot read song list')).to.be.true;
    expect(process.exitCode).to.equal(1);
  });
});
