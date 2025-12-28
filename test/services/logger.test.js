import { describe, it } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import fs from 'fs';
import path from 'path';
import { Logger } from '../../src/services/logger.js';

describe('Logger', () => {
  let logger;
  let appendFileSyncStub;

  beforeEach(() => {
    logger = new Logger();
    appendFileSyncStub = sinon.stub(fs, 'appendFileSync');
  });

  afterEach(() => {
    appendFileSyncStub.restore();
  });

  it('should log info messages', () => {
    logger.info('Test message');
    expect(appendFileSyncStub.called).to.be.true;
    expect(appendFileSyncStub.args[0][1]).to.include('Test message');
  });

  it('should log error messages', () => {
    logger.error('Error message');
    expect(appendFileSyncStub.called).to.be.true;
    expect(appendFileSyncStub.args[0][1]).to.include('Error message');
  });
});