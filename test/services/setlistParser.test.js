import { describe, it } from 'mocha';
import { expect } from 'chai';
import { parseSetlistSongs } from '../../src/services/setlistParser.js';

describe('parseSetlistSongs', () => {
  describe('basic parsing', () => {
    it('should extract songs from a standard setlist response', () => {
      const setlist = {
        artist: { name: 'The Cure' },
        sets: {
          set: [
            {
              song: [
                { name: 'Open' },
                { name: 'High' },
                { name: 'Pictures of You' }
              ]
            }
          ]
        }
      };

      const songs = parseSetlistSongs(setlist);

      expect(songs).to.be.an('array');
      expect(songs).to.have.lengthOf(3);
      expect(songs[0]).to.deep.include({
        songName: 'Open',
        artistName: 'The Cure',
        setNumber: 1,
        isTape: false
      });
    });

    it('should preserve song order from setlist', () => {
      const setlist = {
        artist: { name: 'Test Artist' },
        sets: {
          set: [
            {
              song: [
                { name: 'Song 1' },
                { name: 'Song 2' },
                { name: 'Song 3' }
              ]
            }
          ]
        }
      };

      const songs = parseSetlistSongs(setlist);

      expect(songs.map(s => s.songName)).to.deep.equal(['Song 1', 'Song 2', 'Song 3']);
    });

    it('should handle single song in a set (non-array format)', () => {
      const setlist = {
        artist: { name: 'Test Artist' },
        sets: {
          set: [
            {
              song: { name: 'Single Song' }
            }
          ]
        }
      };

      const songs = parseSetlistSongs(setlist);

      expect(songs).to.have.lengthOf(1);
      expect(songs[0].songName).to.equal('Single Song');
    });

    it('should handle multiple sets', () => {
      const setlist = {
        artist: { name: 'Test Artist' },
        sets: {
          set: [
            { song: [{ name: 'Song 1' }, { name: 'Song 2' }] },
            { song: [{ name: 'Song 3' }] }
          ]
        }
      };

      const songs = parseSetlistSongs(setlist);

      expect(songs).to.have.lengthOf(3);
      expect(songs[0].setNumber).to.equal(1);
      expect(songs[1].setNumber).to.equal(1);
      expect(songs[2].setNumber).to.equal(2);
    });
  });

  describe('encore handling', () => {
    it('should mark encore sets correctly', () => {
      const setlist = {
        artist: { name: 'Test Artist' },
        sets: {
          set: [
            { song: [{ name: 'Song 1' }] },
            { encore: 1, song: [{ name: 'Encore 1' }] },
            { encore: 2, song: [{ name: 'Encore 2' }] }
          ]
        }
      };

      const songs = parseSetlistSongs(setlist);

      expect(songs[0].isEncoreSet).to.be.false;
      expect(songs[1].isEncoreSet).to.be.true;
      expect(songs[1].encoreNumber).to.equal(1);
      expect(songs[2].isEncoreSet).to.be.true;
      expect(songs[2].encoreNumber).to.equal(2);
    });
  });

  describe('tape handling', () => {
    it('should mark tape songs as isTape=true', () => {
      const setlist = {
        artist: { name: 'Test Artist' },
        sets: {
          set: [
            { song: [{ name: 'Tape', tape: true }, { name: 'Regular Song' }] }
          ]
        }
      };

      const songs = parseSetlistSongs(setlist);

      expect(songs[0].isTape).to.be.true;
      expect(songs[1].isTape).to.be.false;
    });

    it('should include tape songs in output (not filter them)', () => {
      const setlist = {
        artist: { name: 'Test Artist' },
        sets: {
          set: [
            { song: [{ name: 'Tape', tape: true }, { name: 'Song' }] }
          ]
        }
      };

      const songs = parseSetlistSongs(setlist);

      expect(songs).to.have.lengthOf(2);
      expect(songs[0].songName).to.equal('Tape');
    });
  });

  describe('edge cases', () => {
    it('should return empty array for null response', () => {
      const songs = parseSetlistSongs(null);
      expect(songs).to.be.an('array');
      expect(songs).to.have.lengthOf(0);
    });

    it('should return empty array for response without sets', () => {
      const setlist = { artist: { name: 'Test Artist' } };
      const songs = parseSetlistSongs(setlist);
      expect(songs).to.be.an('array');
      expect(songs).to.have.lengthOf(0);
    });

    it('should return empty array for empty setlist', () => {
      const setlist = {
        artist: { name: 'Test Artist' },
        sets: { set: [] }
      };

      const songs = parseSetlistSongs(setlist);
      expect(songs).to.be.an('array');
      expect(songs).to.have.lengthOf(0);
    });

    it('should use "Unknown Artist" when artist is missing', () => {
      const setlist = {
        sets: {
          set: [{ song: [{ name: 'Song' }] }]
        }
      };

      const songs = parseSetlistSongs(setlist);

      expect(songs[0].artistName).to.equal('Unknown Artist');
    });

    it('should skip songs without names', () => {
      const setlist = {
        artist: { name: 'Test Artist' },
        sets: {
          set: [
            { song: [{ name: 'Valid Song' }, {}, { name: 'Another Valid Song' }] }
          ]
        }
      };

      const songs = parseSetlistSongs(setlist);

      expect(songs).to.have.lengthOf(2);
      expect(songs.map(s => s.songName)).to.deep.equal(['Valid Song', 'Another Valid Song']);
    });
  });

  describe('sample setlist data (The Cure example)', () => {
    it('should parse the sample setlist correctly', () => {
      const sampleSetlist = {
        id: '6bd7ee5e',
        eventDate: '13-08-1992',
        artist: {
          mbid: '69ee3720-a7cb-4402-b48d-a02c366f2bcf',
          name: 'The Cure',
          sortName: 'Cure, The'
        },
        venue: {
          id: '23d4d0c3',
          name: 'Wellington Town Hall',
          city: {
            id: '2179537',
            name: 'Wellington',
            country: {
              code: 'NZ',
              name: 'New Zealand'
            }
          }
        },
        sets: {
          set: [
            {
              song: [
                { name: 'Tape', tape: true },
                { name: 'Open' },
                { name: 'High' },
                { name: 'Pictures of You' },
                { name: 'Lullaby' }
              ]
            },
            {
              encore: 1,
              song: [
                { name: 'Lovesong' },
                { name: 'Close to Me' }
              ]
            }
          ]
        }
      };

      const songs = parseSetlistSongs(sampleSetlist);

      expect(songs).to.have.lengthOf(7);
      
      // Check first song (tape)
      expect(songs[0]).to.include({
        songName: 'Tape',
        isTape: true,
        setNumber: 1,
        isEncoreSet: false
      });

      // Check regular song
      expect(songs[1]).to.include({
        songName: 'Open',
        artistName: 'The Cure',
        isTape: false,
        setNumber: 1
      });

      // Check encore song
      expect(songs[5]).to.include({
        songName: 'Lovesong',
        isEncoreSet: true,
        encoreNumber: 1,
        setNumber: 2
      });
    });
  });
});
