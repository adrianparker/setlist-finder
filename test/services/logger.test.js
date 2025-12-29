import { describe, it } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { Logger, logger as winstonLogger } from '../../src/services/logger.js';

describe('Logger', () => {
  let logger;
  let infoStub;
  let errorStub;
  let debugStub;
  let warnStub;

  beforeEach(() => {
    logger = new Logger();
    infoStub = sinon.stub(winstonLogger, 'info');
    errorStub = sinon.stub(winstonLogger, 'error');
    debugStub = sinon.stub(winstonLogger, 'debug');
    warnStub = sinon.stub(winstonLogger, 'warn');
  });

  afterEach(() => {
    infoStub.restore();
    errorStub.restore();
    debugStub.restore();
    warnStub.restore();
  });

  it('should log info messages', () => {
    logger.info('Test message');
    expect(infoStub.calledWith('Test message')).to.be.true;
  });

  it('should log error messages', () => {
    logger.error('Error message');
    expect(errorStub.calledWith('Error message')).to.be.true;
  });

  it('should log debug messages', () => {
    logger.debug('Debug message');
    expect(debugStub.calledWith('Debug message')).to.be.true;
  });

  it('should log warn messages', () => {
    logger.warn('Warning message');
    expect(warnStub.calledWith('Warning message')).to.be.true;
  });
});