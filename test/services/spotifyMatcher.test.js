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
      expect(result.id).to.equal('studio-2'); // Most recent studio version
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
  });
});
