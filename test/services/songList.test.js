import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadSongList, parseSongList } from '../../src/services/songList.js';

describe('songList', () => {
  describe('parseSongList', () => {
    it('should return artist, title and songs with notes', () => {
      const result = parseSongList({
        artist: ' Mudhoney ',
        title: 'Predicted setlist',
        songs: [{ name: 'If I Think', note: 'every show (opener)' }, { name: 'Mudride' }]
      });

      expect(result).to.deep.equal({
        artist: 'Mudhoney',
        title: 'Predicted setlist',
        songs: [
          { name: 'If I Think', note: 'every show (opener)' },
          { name: 'Mudride', note: '' }
        ]
      });
    });

    it('should accept songs given as plain strings', () => {
      const result = parseSongList({ artist: 'Mudhoney', songs: ['Touch Me I\'m Sick'] });
      expect(result.songs).to.deep.equal([{ name: 'Touch Me I\'m Sick', note: '' }]);
    });

    it('should default the title from the artist', () => {
      expect(parseSongList({ artist: 'Mudhoney', songs: ['Mudride'] }).title).to.equal('Mudhoney setlist');
    });

    it('should require an artist', () => {
      expect(() => parseSongList({ songs: ['Mudride'] })).to.throw('"artist" is required');
    });

    it('should require a non-empty songs array', () => {
      expect(() => parseSongList({ artist: 'Mudhoney', songs: [] })).to.throw('non-empty array');
      expect(() => parseSongList({ artist: 'Mudhoney' })).to.throw('non-empty array');
    });

    it('should report the position of a song without a name', () => {
      expect(() => parseSongList({ artist: 'Mudhoney', songs: ['A', { note: 'x' }] })).to.throw('song 2 has no name');
    });
  });

  describe('loadSongList', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'song-list-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should load a song list from a JSON file', () => {
      const file = path.join(tmpDir, 'list.json');
      fs.writeFileSync(file, JSON.stringify({ artist: 'Mudhoney', songs: ['Mudride'] }));

      expect(loadSongList(file).songs[0].name).to.equal('Mudride');
    });

    it('should report a missing file', () => {
      expect(() => loadSongList(path.join(tmpDir, 'missing.json'))).to.throw('Cannot read song list');
    });

    it('should report invalid JSON', () => {
      const file = path.join(tmpDir, 'bad.json');
      fs.writeFileSync(file, '{ not json');

      expect(() => loadSongList(file)).to.throw('is not valid JSON');
    });
  });
});
