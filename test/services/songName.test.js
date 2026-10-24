import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  cleanSearchTerm,
  normaliseForCompare,
  splitVersion,
  namesMatch
} from '../../src/services/songName.js';

describe('songName', () => {
  describe('cleanSearchTerm', () => {
    it('should remove brackets but keep their words', () => {
      expect(cleanSearchTerm('Sweet Young Thing (Ain\'t Sweet No More)')).to.equal('Sweet Young Thing Ain\'t Sweet No More');
    });

    it('should remove question marks, exclamation marks and double quotes', () => {
      expect(cleanSearchTerm('Who You Drivin\' Now?')).to.equal('Who You Drivin\' Now');
      expect(cleanSearchTerm('"Hey!"')).to.equal('Hey');
    });

    it('should remove commas and collapse whitespace', () => {
      expect(cleanSearchTerm('  Judgement,  Rage, Retribution and Thyme ')).to.equal('Judgement Rage Retribution and Thyme');
    });

    it('should keep apostrophes inside words', () => {
      expect(cleanSearchTerm('In \'n\' Out of Grace')).to.equal('In \'n\' Out of Grace');
    });

    it('should turn curly apostrophes into straight ones', () => {
      expect(cleanSearchTerm('Touch Me I\u2019m Sick')).to.equal('Touch Me I\'m Sick');
    });
  });

  describe('normaliseForCompare', () => {
    it('should lower-case and drop punctuation and apostrophes', () => {
      expect(normaliseForCompare('Who You Drivin\' Now?')).to.equal('who you drivin now');
      expect(normaliseForCompare('In \'N\' Out Of Grace')).to.equal('in n out of grace');
      expect(normaliseForCompare('In \u2018n\u2019 Out of Grace')).to.equal('in n out of grace');
    });

    it('should treat brackets as spaces', () => {
      expect(normaliseForCompare('Sweet Young Thing (Ain\'t Sweet No More)'))
        .to.equal(normaliseForCompare('Sweet Young Thing Ain\'t Sweet No More'));
    });

    it('should treat & as "and" and remove accents', () => {
      expect(normaliseForCompare('Rock & Roll Caf\u00e9')).to.equal('rock and roll cafe');
    });

    it('should handle empty input', () => {
      expect(normaliseForCompare(null)).to.equal('');
    });
  });

  describe('splitVersion', () => {
    it('should split a " - " version suffix', () => {
      expect(splitVersion('Get Into Yours - Live in Europe')).to.deep.equal({ title: 'Get Into Yours', version: 'Live in Europe' });
      expect(splitVersion('If I Think - Live in Berlin 10/10/88')).to.deep.equal({ title: 'If I Think', version: 'Live in Berlin 10/10/88' });
      expect(splitVersion('Good Enough - Remastered')).to.deep.equal({ title: 'Good Enough', version: 'Remastered' });
    });

    it('should split a trailing bracketed version', () => {
      expect(splitVersion('Mudride (Live)')).to.deep.equal({ title: 'Mudride', version: 'Live' });
      expect(splitVersion('Hate the Police [Demo]')).to.deep.equal({ title: 'Hate the Police', version: 'Demo' });
      expect(splitVersion('Song (2005 Remaster)')).to.deep.equal({ title: 'Song', version: '2005 Remaster' });
    });

    it('should keep brackets that are part of the title', () => {
      expect(splitVersion('Sweet Young Thing (Ain\'t Sweet No More)'))
        .to.deep.equal({ title: 'Sweet Young Thing (Ain\'t Sweet No More)', version: '' });
    });

    it('should return the name unchanged when there is no version', () => {
      expect(splitVersion('Touch Me I\'m Sick')).to.deep.equal({ title: 'Touch Me I\'m Sick', version: '' });
    });
  });

  describe('namesMatch', () => {
    it('should match despite punctuation, case and apostrophes', () => {
      expect(namesMatch('Who You Drivin\' Now?', 'Who You Drivin\' Now?')).to.be.true;
      expect(namesMatch('Who You Drivin Now', 'Who You Drivin\' Now?')).to.be.true;
      expect(namesMatch('In \'n\' Out of Grace', 'In \'N\' Out Of Grace')).to.be.true;
    });

    it('should match bracketed setlist names to unbracketed Spotify names', () => {
      expect(namesMatch('Sweet Young Thing (Ain\'t Sweet No More)', 'Sweet Young Thing Ain\'t Sweet No More')).to.be.true;
    });

    it('should ignore the version suffix on the Spotify name', () => {
      expect(namesMatch('If I Think', 'If I Think - Live in Berlin 10/10/88')).to.be.true;
      expect(namesMatch('Mudride', 'Mudride (Live)')).to.be.true;
    });

    it('should match a setlist name shortened without its bracketed part', () => {
      expect(namesMatch('Sweet Young Thing', 'Sweet Young Thing (Ain\'t Sweet No More)')).to.be.true;
    });

    it('should not match a different song', () => {
      expect(namesMatch('Good Enough', 'Touch Me I\'m Sick')).to.be.false;
      expect(namesMatch('If I Think', 'If I Think About It Too Long')).to.be.false;
      expect(namesMatch('Mudride', 'Mudride Revisited')).to.be.false;
    });
  });
});
