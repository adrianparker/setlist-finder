import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import {
  predictSetlist,
  findSourceSetlists,
  setlistDateToSortable
} from '../../src/services/setlistPredictor.js';

function setlist(id, eventDate, mainSongs, encoreSongs = [], venue = 'Venue') {
  const set = [];
  if (mainSongs.length) set.push({ song: mainSongs.map(name => (typeof name === 'string' ? { name } : name)) });
  if (encoreSongs.length) set.push({ encore: 1, song: encoreSongs.map(name => ({ name })) });
  return {
    id,
    eventDate,
    artist: { name: 'Mudhoney' },
    venue: { name: venue, city: { name: 'City', country: { name: 'Australia' } } },
    sets: { set }
  };
}

describe('setlistPredictor', () => {
  describe('setlistDateToSortable', () => {
    it('should convert dd-MM-yyyy to YYYYMMDD', () => {
      expect(setlistDateToSortable('22-10-2026')).to.equal('20261022');
    });

    it('should return null for an unrecognised date', () => {
      expect(setlistDateToSortable('2026-10-22')).to.be.null;
      expect(setlistDateToSortable(undefined)).to.be.null;
    });
  });

  describe('predictSetlist', () => {
    it('should include every song played, in average set position, with encores last', () => {
      const prediction = predictSetlist([
        setlist('a', '22-10-2026', ['Opener', 'Second', 'Rotation A', 'Closer'], ['Encore 1', 'Encore 2']),
        setlist('b', '21-10-2026', ['Opener', 'Second', 'Rotation B', 'Closer'], ['Encore 1', 'Encore 2']),
        setlist('c', '20-10-2026', ['Opener', 'Rotation C', 'Second', 'Closer'], ['Encore 1', 'Encore 2'])
      ]);

      // Average relative positions: Opener 0, Rotation C 0.33, Second 0.44, Rotation A/B 0.67, Closer 1.
      // Rotation A and B tie on position and plays, so the more recently played one comes first.
      expect(prediction.songs.map(s => s.name)).to.deep.equal([
        'Opener', 'Rotation C', 'Second', 'Rotation A', 'Rotation B', 'Closer', 'Encore 1', 'Encore 2'
      ]);
    });

    it('should note how often each song was played', () => {
      const prediction = predictSetlist([
        setlist('a', '22-10-2026', ['Opener', 'Sometimes'], ['Encore']),
        setlist('b', '21-10-2026', ['Opener', 'Sometimes'], ['Encore']),
        setlist('c', '20-10-2026', ['Opener', 'Once'], ['Encore'])
      ]);
      const notes = Object.fromEntries(prediction.songs.map(s => [s.name, s.note]));

      expect(notes).to.deep.equal({
        Opener: 'every show',
        Sometimes: '2 of 3',
        Once: '1 of 3',
        Encore: 'encore - every show'
      });
      expect(prediction.songs.find(s => s.name === 'Opener')).to.include({ timesPlayed: 3, encore: false });
    });

    it('should use relative positions so a short (incomplete) setlist does not distort the order', () => {
      const prediction = predictSetlist([
        setlist('a', '22-10-2026', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']),
        setlist('b', '21-10-2026', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']),
        // Incomplete setlist: only the first and last songs were recorded
        setlist('c', '16-10-2026', ['A', 'H'])
      ]);

      expect(prediction.songs.map(s => s.name)).to.deep.equal(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    });

    it('should treat differently punctuated names as the same song, keeping the newest spelling', () => {
      const prediction = predictSetlist([
        setlist('a', '22-10-2026', ['Who You Drivin\' Now?']),
        setlist('b', '21-10-2026', ['Who You Drivin Now'])
      ]);

      expect(prediction.songs).to.have.lengthOf(1);
      expect(prediction.songs[0]).to.include({ name: 'Who You Drivin\' Now?', note: 'every show' });
    });

    it('should skip tapes', () => {
      const prediction = predictSetlist([
        setlist('a', '22-10-2026', [{ name: 'Intro', tape: true }, 'Song'])
      ]);

      expect(prediction.songs.map(s => s.name)).to.deep.equal(['Song']);
    });

    it('should place a song in the encore when it was mostly played in the encore', () => {
      const prediction = predictSetlist([
        setlist('a', '22-10-2026', ['Main'], ['Floater']),
        setlist('b', '21-10-2026', ['Main'], ['Floater']),
        setlist('c', '20-10-2026', ['Main', 'Floater'])
      ]);

      expect(prediction.songs.map(s => s.name)).to.deep.equal(['Main', 'Floater']);
      expect(prediction.songs[1]).to.include({ encore: true, note: 'encore - every show' });
    });

    it('should break position ties by how often the song was played', () => {
      const prediction = predictSetlist([
        setlist('a', '22-10-2026', ['Rare', 'X']),
        setlist('b', '21-10-2026', ['Common', 'X']),
        setlist('c', '20-10-2026', ['Common', 'X'])
      ]);

      expect(prediction.songs.map(s => s.name)).to.deep.equal(['Common', 'Rare', 'X']);
    });

    it('should report the shows it was based on', () => {
      const prediction = predictSetlist([setlist('a', '22-10-2026', ['Song'], [], 'The Factory Theatre')]);

      expect(prediction.showCount).to.equal(1);
      expect(prediction.sources).to.deep.equal([
        { id: 'a', eventDate: '22-10-2026', venue: 'The Factory Theatre', city: 'City', songCount: 1 }
      ]);
    });

    it('should return no songs for no setlists', () => {
      expect(predictSetlist([])).to.deep.equal({ songs: [], showCount: 0, sources: [] });
    });
  });

  describe('findSourceSetlists', () => {
    let setlistClient;
    let logger;

    beforeEach(() => {
      logger = { info: sinon.stub(), debug: sinon.stub(), warn: sinon.stub(), error: sinon.stub() };
      setlistClient = { searchSetlistsByArtist: sinon.stub() };
    });

    afterEach(() => {
      sinon.restore();
    });

    const page = setlists => ({ setlist: setlists, total: 100, page: 1, itemsPerPage: 20 });

    it('should take the most recent setlists with songs dated before the show, skipping empty ones', async () => {
      setlistClient.searchSetlistsByArtist.resolves(page([
        setlist('future', '25-10-2026', []),
        setlist('sameday', '24-10-2026', ['Song']),
        setlist('empty', '23-10-2026', []),
        setlist('s1', '22-10-2026', ['Song']),
        setlist('s2', '21-10-2026', ['Song']),
        setlist('s3', '20-10-2026', ['Song'])
      ]));

      const result = await findSourceSetlists({ setlistClient, logger }, 'mbid-1', '20261024', 2);

      expect(result.map(s => s.id)).to.deep.equal(['s1', 's2']);
      expect(setlistClient.searchSetlistsByArtist.calledOnceWith('mbid-1', null, 1)).to.be.true;
    });

    it('should fetch further pages until enough setlists are found', async () => {
      setlistClient.searchSetlistsByArtist.withArgs('mbid-1', null, 1).resolves(page([setlist('s1', '22-10-2026', ['Song'])]));
      setlistClient.searchSetlistsByArtist.withArgs('mbid-1', null, 2).resolves(page([setlist('s2', '01-09-2025', ['Song'])]));

      const result = await findSourceSetlists({ setlistClient, logger }, 'mbid-1', '20261029', 2);

      expect(result.map(s => s.id)).to.deep.equal(['s1', 's2']);
      expect(setlistClient.searchSetlistsByArtist.callCount).to.equal(2);
    });

    it('should stop at the page limit', async () => {
      setlistClient.searchSetlistsByArtist.resolves(page([setlist('late', '30-10-2026', ['Song'])]));

      const result = await findSourceSetlists({ setlistClient, logger }, 'mbid-1', '20261029', 5, 3);

      expect(result).to.deep.equal([]);
      expect(setlistClient.searchSetlistsByArtist.callCount).to.equal(3);
    });

    it('should stop when setlist.fm has no more pages', async () => {
      setlistClient.searchSetlistsByArtist.withArgs('mbid-1', null, 1).resolves(page([setlist('s1', '22-10-2026', ['Song'])]));
      setlistClient.searchSetlistsByArtist.withArgs('mbid-1', null, 2).rejects(new Error('Setlist.fm API error: 404 Not Found'));

      const result = await findSourceSetlists({ setlistClient, logger }, 'mbid-1', '20261029', 5);

      expect(result.map(s => s.id)).to.deep.equal(['s1']);
    });

    it('should pass on other errors', async () => {
      setlistClient.searchSetlistsByArtist.rejects(new Error('Setlist.fm API error: 500 Server Error'));

      try {
        await findSourceSetlists({ setlistClient, logger }, 'mbid-1', '20261029', 5);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('500');
      }
    });
  });
});
