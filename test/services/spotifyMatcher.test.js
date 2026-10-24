import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { SpotifyMatcher } from '../../src/services/spotifyMatcher.js';

describe('SpotifyMatcher', () => {
  let matcher;
  let logger;

  beforeEach(() => {
    logger = {
      info: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub(),
      warn: sinon.stub()
    };
    matcher = new SpotifyMatcher(logger);
  });

  describe('findBestMatch', () => {
    it('should return null for empty track array', () => {
      const result = matcher.findBestMatch([], 'Test Song', 'Test Artist');
      expect(result).to.be.null;
    });

    it('should return null if no artist name matches', () => {
      const tracks = [
        {
          name: 'Test Song',
          artists: [{ name: 'Other Artist' }],
          album: { name: 'Test Album', releaseDate: '2023-01-01' },
          popularity: 75
        }
      ];

      const result = matcher.findBestMatch(tracks, 'Test Song', 'Test Artist');
      expect(result).to.be.null;
    });

    it('should match artist name case-insensitively', () => {
      const tracks = [
        {
          id: 'track-1',
          name: 'Test Song',
          artists: [{ name: 'test artist' }],
          album: { name: 'Test Album', releaseDate: '2023-01-01' },
          popularity: 75
        }
      ];

      const result = matcher.findBestMatch(tracks, 'Test Song', 'Test Artist');
      expect(result).to.not.be.null;
      expect(result.id).to.equal('track-1');
    });

    it('should prefer live versions over studio versions', () => {
      const tracks = [
        {
          id: 'studio-1',
          name: 'Test Song',
          artists: [{ name: 'Test Artist' }],
          album: { name: 'Studio Album', releaseDate: '2023-01-01' },
          popularity: 85
        },
        {
          id: 'live-1',
          name: 'Test Song',
          artists: [{ name: 'Test Artist' }],
          album: { name: 'Live at Madison Square Garden', releaseDate: '2022-06-01' },
          popularity: 60
        }
      ];

      const result = matcher.findBestMatch(tracks, 'Test Song', 'Test Artist');
      expect(result.id).to.equal('live-1');
    });

    it('should identify live albums by various keywords', () => {
      const liveKeywords = ['Live', 'Concert', 'Live Album', 'Live From', 'live'];
      
      liveKeywords.forEach(keyword => {
        const tracks = [
          {
            id: 'live-track',
            name: 'Test Song',
            artists: [{ name: 'Test Artist' }],
            album: { name: `${keyword} Sessions`, releaseDate: '2023-01-01' },
            popularity: 70
          }
        ];

        const result = matcher.findBestMatch(tracks, 'Test Song', 'Test Artist');
        expect(result.id).to.equal('live-track', `Should identify "${keyword}" as live`);
      });
    });

    it('should select most recent release date when multiple matches exist', () => {
      const tracks = [
        {
          id: 'old-version',
          name: 'Test Song',
          artists: [{ name: 'Test Artist' }],
          album: { name: 'Live Album 1', releaseDate: '2020-01-01' },
          popularity: 60
        },
        {
          id: 'new-version',
          name: 'Test Song',
          artists: [{ name: 'Test Artist' }],
          album: { name: 'Live Album 2', releaseDate: '2023-06-15' },
          popularity: 65
        }
      ];

      const result = matcher.findBestMatch(tracks, 'Test Song', 'Test Artist');
      expect(result.id).to.equal('new-version');
    });

    it('should fallback to studio version if no live versions exist', () => {
      const tracks = [
        {
          id: 'studio-1',
          name: 'Test Song',
          artists: [{ name: 'Test Artist' }],
          album: { name: 'Original Album', releaseDate: '2020-01-01' },
          popularity: 85
        },
        {
          id: 'studio-2',
          name: 'Test Song',
          artists: [{ name: 'Test Artist' }],
          album: { name: 'Remaster', releaseDate: '2023-01-01' },
          popularity: 88
        }
      ];

      const result = matcher.findBestMatch(tracks, 'Test Song', 'Test Artist');
      // Studio versions prefer the original release over a later remaster
      expect(result.id).to.equal('studio-1');
    });

    it('should handle invalid release dates gracefully', () => {
      const tracks = [
        {
          id: 'track-1',
          name: 'Test Song',
          artists: [{ name: 'Test Artist' }],
          album: { name: 'Album 1', releaseDate: null },
          popularity: 70
        },
        {
          id: 'track-2',
          name: 'Test Song',
          artists: [{ name: 'Test Artist' }],
          album: { name: 'Album 2', releaseDate: '2023-01-01' },
          popularity: 65
        }
      ];

      const result = matcher.findBestMatch(tracks, 'Test Song', 'Test Artist');
      expect(result).to.not.be.null;
      // Should select the one with valid date
      expect(result.id).to.equal('track-2');
    });

    it('should handle multiple artists in a single track', () => {
      const tracks = [
        {
          id: 'collab-track',
          name: 'Test Song',
          artists: [
            { name: 'Other Artist' },
            { name: 'Test Artist' },
            { name: 'Another Artist' }
          ],
          album: { name: 'Album', releaseDate: '2023-01-01' },
          popularity: 75
        }
      ];

      const result = matcher.findBestMatch(tracks, 'Test Song', 'Test Artist');
      expect(result).to.not.be.null;
      expect(result.id).to.equal('collab-track');
    });

    it('should log matching decisions at debug level', () => {
      const tracks = [
        {
          id: 'track-1',
          name: 'Test Song',
          artists: [{ name: 'Test Artist' }],
          album: { name: 'Live Album', releaseDate: '2023-01-01' },
          popularity: 75
        }
      ];

      matcher.findBestMatch(tracks, 'Test Song', 'Test Artist');
      expect(logger.debug.called).to.be.true;
    });
  });

  describe('isLiveAlbum', () => {
    it('should detect live albums with various keywords', () => {
      const liveAlbumNames = [
        'Live at Madison Square Garden',
        'Concert Series',
        'Live Album',
        'Live from Tokyo',
        'LIVE Sessions'
      ];

      liveAlbumNames.forEach(name => {
        expect(matcher.isLiveAlbum(name)).to.be.true;
      });
    });

    it('should not detect studio albums as live', () => {
      const studioAlbumNames = [
        'Studio Album',
        'The Original Recording',
        'Deliver Live Support - just kidding'
      ];

      expect(matcher.isLiveAlbum(studioAlbumNames[0])).to.be.false;
      expect(matcher.isLiveAlbum(studioAlbumNames[1])).to.be.false;
    });

    it('should handle null or empty album names', () => {
      expect(matcher.isLiveAlbum(null)).to.be.false;
      expect(matcher.isLiveAlbum('')).to.be.false;
    });

    it('should only match "live" as a whole word', () => {
      expect(matcher.isLiveAlbum('Alive')).to.be.false;
      expect(matcher.isLiveAlbum('Deliverance')).to.be.false;
      expect(matcher.isLiveAlbum('Olives and Oysters')).to.be.false;
      expect(matcher.isLiveAlbum('LiE (Live in Europe)')).to.be.true;
      expect(matcher.isLiveAlbum('Live!')).to.be.true;
      expect(matcher.isLiveAlbum('MTV Unplugged')).to.be.true;
    });
  });

  describe('isLive', () => {
    const track = (name, albumName) => ({ name, album: { name: albumName } });

    it('should detect a live album', () => {
      expect(matcher.isLive(track('You Got It', 'Live At El Sol'))).to.be.true;
    });

    it('should detect a live version in the track name', () => {
      expect(matcher.isLive(track('Get Into Yours - Live in Europe', 'LiE'))).to.be.true;
      expect(matcher.isLive(track('If I Think - Live in Berlin 10/10/88', 'Superfuzz Bigmuff (Deluxe Edition)'))).to.be.true;
      expect(matcher.isLive(track('Here Comes Sickness - Live At KCSB 11/16/88', 'Superfuzz Bigmuff (Deluxe Edition)'))).to.be.true;
      expect(matcher.isLive(track('Mudride (Live)', 'Some Album'))).to.be.true;
      expect(matcher.isLive(track('Mudride [Live at the Crocodile]', 'Some Album'))).to.be.true;
    });

    it('should not treat "live" in the song title itself as a live version', () => {
      expect(matcher.isLive(track('Live Forever', 'Definitely Maybe'))).to.be.false;
      expect(matcher.isLive(track('Live and Let Die', 'Red Rose Speedway'))).to.be.false;
      expect(matcher.isLive(track('Alive', 'Ten'))).to.be.false;
    });

    it('should not treat other versions as live', () => {
      expect(matcher.isLive(track('Good Enough - Remastered', 'Every Good Boy Deserves Fudge (30th Anniversary Deluxe Edition)'))).to.be.false;
      expect(matcher.isLive(track('Hate the Police - Demo', 'Superfuzz Bigmuff (Deluxe Edition)'))).to.be.false;
    });

    it('should handle missing data', () => {
      expect(matcher.isLive(null)).to.be.false;
      expect(matcher.isLive({})).to.be.false;
    });
  });

  describe('isReissue', () => {
    const track = (name, albumName, albumType = 'album') => ({ name, album: { name: albumName, albumType } });

    it('should flag reissue and compilation album names', () => {
      [
        'Superfuzz Bigmuff (Deluxe Edition)',
        'Every Good Boy Deserves Fudge (30th Anniversary Deluxe Edition)',
        'My Brother The Cow [Expanded]',
        'Real Low Vibe: The Reprise Recordings 1992-1998',
        'Nevermind (Remastered)',
        'The Best of Mudhoney',
        'Greatest Hits',
        'The Singles Collection',
        'Anthology'
      ].forEach(albumName => {
        expect(matcher.isReissue(track('Song', albumName)), albumName).to.be.true;
      });
    });

    it('should flag compilation albums by type', () => {
      expect(matcher.isReissue(track('Song', 'March to Fuzz', 'compilation'))).to.be.true;
    });

    it('should flag remastered, demo and alternate tracks', () => {
      expect(matcher.isReissue(track('Good Enough - Remastered', 'Album'))).to.be.true;
      expect(matcher.isReissue(track('Real Low Vibe - Demo', 'Album'))).to.be.true;
      expect(matcher.isReissue(track('Song (2005 Remaster)', 'Album'))).to.be.true;
      expect(matcher.isReissue(track('Song - Alternate Take', 'Album'))).to.be.true;
    });

    it('should not flag original studio or live albums', () => {
      expect(matcher.isReissue(track('Try to Be Kind', 'Tomorrow Hit Today'))).to.be.false;
      expect(matcher.isReissue(track('Suck You Dry - Live in Europe', 'LiE (Live in Europe)'))).to.be.false;
      expect(matcher.isReissue(track('Mudride', 'Live At El Sol'))).to.be.false;
      expect(matcher.isReissue(track('Touch Me I\'m Sick - Live', 'Live Mud'))).to.be.false;
    });
  });

  describe('findBestMatch tie-breaker', () => {
    const track = (id, name, albumName, releaseDate, albumType = 'album') => ({
      id,
      name,
      artists: [{ name: 'Mudhoney' }],
      album: { name: albumName, releaseDate, albumType }
    });

    it('should pick the original studio album over a later compilation', () => {
      const result = matcher.findBestMatch([
        track('comp', 'Try to Be Kind', 'Real Low Vibe: The Reprise Recordings 1992-1998', '2021-11-05'),
        track('orig', 'Try to Be Kind', 'Tomorrow Hit Today', '1998-09-11')
      ], 'Try to Be Kind', 'Mudhoney');

      expect(result.id).to.equal('orig');
    });

    it('should pick the original even when a remastered deluxe edition is dated earlier', () => {
      const result = matcher.findBestMatch([
        track('deluxe', 'Good Enough - Remastered', 'Every Good Boy Deserves Fudge (30th Anniversary Deluxe Edition)', '1991-07-23'),
        track('orig', 'Good Enough', 'Every Good Boy Deserves Fudge', '1991-08-06')
      ], 'Good Enough', 'Mudhoney');

      expect(result.id).to.equal('orig');
    });

    it('should pick the earliest of several original studio releases', () => {
      const result = matcher.findBestMatch([
        track('later', 'Song', 'Second Album', '2005-01-01'),
        track('first', 'Song', 'First Album', '1995-01-01')
      ], 'Song', 'Mudhoney');

      expect(result.id).to.equal('first');
    });

    it('should not pick a demo over the released song', () => {
      const result = matcher.findBestMatch([
        track('demo', 'Real Low Vibe - Demo', 'Real Low Vibe: The Reprise Recordings 1992-1998', '2021-11-05'),
        track('comp', 'Real Low Vibe', 'Real Low Vibe: The Reprise Recordings 1992-1998', '2021-11-05'),
        track('orig', 'Real Low Vibe', 'Tomorrow Hit Today', '1998-09-11')
      ], 'Real Low Vibe', 'Mudhoney');

      expect(result.id).to.equal('orig');
    });

    it('should pick the most recent dedicated live album over a newer reissue bonus track', () => {
      const result = matcher.findBestMatch([
        track('reissue-live', 'Suck You Dry - Live', 'Real Low Vibe: The Reprise Recordings 1992-1998', '2021-11-05'),
        track('lie', 'Suck You Dry - Live in Europe', 'LiE (Live in Europe)', '2018-01-19'),
        track('elsol', 'Suck You Dry', 'Live At El Sol', '2009-10-05'),
        track('livemud', 'Suck You Dry - Live', 'Live Mud', '2007-11-06'),
        track('studio', 'Suck You Dry', 'Piece Of Cake', '1992-01-01')
      ], 'Suck You Dry', 'Mudhoney');

      expect(result.id).to.equal('lie');
    });

    it('should still prefer a live reissue track over any studio version', () => {
      const result = matcher.findBestMatch([
        track('studio', 'If I Think', 'Superfuzz Bigmuff', '1988-10-01'),
        track('berlin', 'If I Think - Live in Berlin 10/10/88', 'Superfuzz Bigmuff (Deluxe Edition)', '1988-10-01')
      ], 'If I Think', 'Mudhoney');

      expect(result.id).to.equal('berlin');
    });

    it('should fall back to a compilation when it is the only version', () => {
      const result = matcher.findBestMatch([
        track('comp', 'Beneath the Valley of the Underdog', 'Real Low Vibe: The Reprise Recordings 1992-1998', '2021-11-05')
      ], 'Beneath the Valley of the Underdog', 'Mudhoney');

      expect(result.id).to.equal('comp');
    });

    it('should not let an unknown release date win the earliest-studio choice', () => {
      const result = matcher.findBestMatch([
        track('nodate', 'Song', 'Album A', null),
        track('dated', 'Song', 'Album B', '2001-01-01')
      ], 'Song', 'Mudhoney');

      expect(result.id).to.equal('dated');
    });
  });

  describe('findBestMatch name and live handling', () => {
    const track = (id, name, albumName, releaseDate, artist = 'Mudhoney') => ({
      id,
      name,
      artists: [{ name: artist }],
      album: { name: albumName, releaseDate }
    });

    it('should prefer a live version identified by its track name', () => {
      const result = matcher.findBestMatch([
        track('studio', 'If I Think', 'Superfuzz Bigmuff (Deluxe Edition)', '1988-10-01'),
        track('live', 'If I Think - Live in Berlin 10/10/88', 'Superfuzz Bigmuff (Deluxe Edition)', '1988-10-01')
      ], 'If I Think', 'Mudhoney');

      expect(result.id).to.equal('live');
    });

    it('should ignore tracks that are a different song', () => {
      const result = matcher.findBestMatch([
        track('wrong', 'Touch Me I\'m Sick', 'Live At El Sol', '2009-10-05'),
        track('right', 'Good Enough', 'Every Good Boy Deserves Fudge', '1991-08-06')
      ], 'Good Enough', 'Mudhoney');

      expect(result.id).to.equal('right');
    });

    it('should return null when no track has the song name', () => {
      const result = matcher.findBestMatch([
        track('wrong', 'If I Think About It Too Long', 'Some Album', '2001-01-01')
      ], 'If I Think', 'Mudhoney');

      expect(result).to.be.null;
    });

    it('should match setlist names with different punctuation', () => {
      const result = matcher.findBestMatch([
        track('t1', 'Who You Drivin\' Now?', 'Every Good Boy Deserves Fudge', '1991-08-06'),
        track('t2', 'Sweet Young Thing Ain\'t Sweet No More', 'Live At El Sol', '2009-10-05')
      ], 'Sweet Young Thing (Ain\'t Sweet No More)', 'Mudhoney');

      expect(result.id).to.equal('t2');
    });

    it('should still reject a cover by another artist', () => {
      const result = matcher.findBestMatch([
        track('cover', 'Touch Me I\'m Sick - Live', 'Live Covers', '2020-01-01', 'Sonic Youth')
      ], 'Touch Me I\'m Sick', 'Mudhoney');

      expect(result).to.be.null;
    });
  });
});
