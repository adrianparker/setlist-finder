import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import {
  SpotifyAuth,
  generateCodeVerifier,
  generateCodeChallenge,
  DEFAULT_REDIRECT_URI
} from '../../src/services/spotifyAuth.js';

function tokenResponse(body, ok = true, status = 200) {
  return { ok, status, statusText: ok ? 'OK' : 'Bad Request', json: sinon.stub().resolves(body) };
}

function requestCallback(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

describe('SpotifyAuth', () => {
  let logger;
  let fetchStub;
  let tmpDir;
  let tokenPath;
  let auth;

  beforeEach(() => {
    logger = {
      info: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub(),
      warn: sinon.stub()
    };
    fetchStub = sinon.stub(global, 'fetch');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spotify-auth-test-'));
    tokenPath = path.join(tmpDir, 'token.json');
    auth = new SpotifyAuth(logger, {
      clientId: 'test-client-id',
      redirectUri: 'http://127.0.0.1:18888/callback',
      tokenPath,
      openBrowser: sinon.stub(),
      // Never resolves, so tests are not blocked on a terminal prompt
      readPastedUrl: () => new Promise(() => {}),
      timeoutMs: 2000
    });
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('PKCE helpers', () => {
    it('should generate a verifier of the requested length from the allowed characters', () => {
      const verifier = generateCodeVerifier(64);
      expect(verifier).to.have.length(64);
      expect(verifier).to.match(/^[A-Za-z0-9\-._~]+$/);
    });

    it('should generate a different verifier each time', () => {
      expect(generateCodeVerifier()).to.not.equal(generateCodeVerifier());
    });

    it('should reject verifier lengths outside 43-128', () => {
      expect(() => generateCodeVerifier(42)).to.throw('between 43 and 128');
      expect(() => generateCodeVerifier(129)).to.throw('between 43 and 128');
    });

    it('should derive an unpadded base64url SHA-256 challenge', () => {
      const challenge = generateCodeChallenge('dBjftJeZ4CVP-mJ0kFfwT8NEKq2zQGzBnJxmU2tSmO0');
      expect(challenge).to.equal('KHveSrBtN5-ovz2wT8Fr9rqACyrY76B52CcYdmZu1P4');
      expect(challenge).to.not.match(/[=+/]/);
    });
  });

  describe('constructor', () => {
    it('should throw if no client ID is available', () => {
      const saved = process.env.SPOTIFY_CLIENT_ID;
      delete process.env.SPOTIFY_CLIENT_ID;
      try {
        expect(() => new SpotifyAuth(logger, { tokenPath })).to.throw('SPOTIFY_CLIENT_ID');
      } finally {
        if (saved !== undefined) process.env.SPOTIFY_CLIENT_ID = saved;
      }
    });

    it('should default to a 127.0.0.1 loopback redirect URI', () => {
      expect(DEFAULT_REDIRECT_URI).to.equal('http://127.0.0.1:8888/callback');
    });
  });

  describe('buildAuthorizeUrl', () => {
    it('should include PKCE, state, redirect and playlist scopes', () => {
      const url = new URL(auth.buildAuthorizeUrl('challenge-abc', 'state-xyz'));
      expect(url.origin + url.pathname).to.equal('https://accounts.spotify.com/authorize');
      expect(url.searchParams.get('client_id')).to.equal('test-client-id');
      expect(url.searchParams.get('response_type')).to.equal('code');
      expect(url.searchParams.get('redirect_uri')).to.equal('http://127.0.0.1:18888/callback');
      expect(url.searchParams.get('code_challenge_method')).to.equal('S256');
      expect(url.searchParams.get('code_challenge')).to.equal('challenge-abc');
      expect(url.searchParams.get('state')).to.equal('state-xyz');
      expect(url.searchParams.get('scope')).to.equal('playlist-modify-private playlist-modify-public');
    });
  });

  describe('exchangeCode', () => {
    it('should post the code and verifier and return stored tokens', async () => {
      fetchStub.resolves(tokenResponse({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_in: 3600,
        scope: 'playlist-modify-private playlist-modify-public'
      }));

      const tokens = await auth.exchangeCode('code-123', 'verifier-456');

      const [url, options] = fetchStub.firstCall.args;
      expect(url).to.equal('https://accounts.spotify.com/api/token');
      expect(options.method).to.equal('POST');
      expect(options.headers['Content-Type']).to.equal('application/x-www-form-urlencoded');
      expect(options.headers.Authorization).to.be.undefined;
      const body = new URLSearchParams(options.body);
      expect(body.get('grant_type')).to.equal('authorization_code');
      expect(body.get('code')).to.equal('code-123');
      expect(body.get('code_verifier')).to.equal('verifier-456');
      expect(body.get('client_id')).to.equal('test-client-id');
      expect(body.get('redirect_uri')).to.equal('http://127.0.0.1:18888/callback');

      expect(tokens.accessToken).to.equal('access-1');
      expect(tokens.refreshToken).to.equal('refresh-1');
      expect(tokens.expiresAt).to.be.greaterThan(Date.now());
    });

    it('should throw with the OAuth error description on failure', async () => {
      fetchStub.resolves(tokenResponse({ error: 'invalid_grant', error_description: 'Invalid authorization code' }, false, 400));

      try {
        await auth.exchangeCode('bad-code', 'verifier');
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.equal('HTTP 400: Invalid authorization code');
        expect(err.oauthError).to.equal('invalid_grant');
      }
    });
  });

  describe('refreshAccessToken', () => {
    it('should send a refresh_token grant with the client ID', async () => {
      fetchStub.resolves(tokenResponse({ access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600, scope: 'x' }));

      const tokens = await auth.refreshAccessToken('refresh-1');

      const body = new URLSearchParams(fetchStub.firstCall.args[1].body);
      expect(body.get('grant_type')).to.equal('refresh_token');
      expect(body.get('refresh_token')).to.equal('refresh-1');
      expect(body.get('client_id')).to.equal('test-client-id');
      expect(tokens.refreshToken).to.equal('refresh-2');
    });

    it('should keep the previous refresh token when none is returned', async () => {
      fetchStub.resolves(tokenResponse({ access_token: 'access-2', expires_in: 3600, scope: 'x' }));

      const tokens = await auth.refreshAccessToken('refresh-1');

      expect(tokens.refreshToken).to.equal('refresh-1');
    });
  });

  describe('token storage', () => {
    it('should save and load tokens with owner-only permissions', () => {
      auth.saveTokens({ accessToken: 'a', refreshToken: 'r', scope: 's', expiresAt: 1 });

      expect(auth.loadTokens()).to.deep.equal({ accessToken: 'a', refreshToken: 'r', scope: 's', expiresAt: 1 });
      if (process.platform !== 'win32') {
        expect(fs.statSync(tokenPath).mode & 0o777).to.equal(0o600);
      }
    });

    it('should return null when no token file exists', () => {
      expect(auth.loadTokens()).to.be.null;
    });

    it('should remove stored tokens', () => {
      auth.saveTokens({ accessToken: 'a' });
      auth.clearTokens();
      expect(fs.existsSync(tokenPath)).to.be.false;
    });
  });

  describe('extractAuthorizationCode', () => {
    it('should return the code when the state matches', () => {
      const params = new URLSearchParams('code=abc&state=s1');
      expect(auth.extractAuthorizationCode(params, 's1')).to.equal('abc');
    });

    it('should reject an error response', () => {
      const params = new URLSearchParams('error=access_denied&state=s1');
      expect(() => auth.extractAuthorizationCode(params, 's1')).to.throw('access_denied');
    });

    it('should reject a state mismatch', () => {
      const params = new URLSearchParams('code=abc&state=other');
      expect(() => auth.extractAuthorizationCode(params, 's1')).to.throw('state mismatch');
    });

    it('should reject a missing code', () => {
      const params = new URLSearchParams('state=s1');
      expect(() => auth.extractAuthorizationCode(params, 's1')).to.throw('no code returned');
    });
  });

  describe('waitForCallback', () => {
    it('should stop the server and reject when aborted', async () => {
      const controller = new AbortController();
      const pending = auth.waitForCallback('state-1', () => controller.abort(), controller.signal);

      try {
        await pending;
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('cancelled');
      }
      // Port is released, so a second sign-in can listen again
      const second = auth.waitForCallback('state-2', () => {
        requestCallback('http://127.0.0.1:18888/callback?code=xyz&state=state-2').catch(() => {});
      });
      expect(await second).to.equal('xyz');
    });

    it('should resolve with the code when state matches', async () => {
      const pending = auth.waitForCallback('state-1', async () => {
        const res = await requestCallback('http://127.0.0.1:18888/callback?code=abc&state=state-1');
        expect(res.status).to.equal(200);
        expect(res.body).to.include('Signed in to Spotify');
      });

      expect(await pending).to.equal('abc');
    });

    it('should reject when state does not match', async () => {
      const pending = auth.waitForCallback('state-1', () => {
        requestCallback('http://127.0.0.1:18888/callback?code=abc&state=other').catch(() => {});
      });

      try {
        await pending;
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('state mismatch');
      }
    });

    it('should reject when the user denies access', async () => {
      const pending = auth.waitForCallback('state-1', () => {
        requestCallback('http://127.0.0.1:18888/callback?error=access_denied&state=state-1').catch(() => {});
      });

      try {
        await pending;
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('access_denied');
      }
    });

    it('should reject after the timeout', async () => {
      auth.timeoutMs = 50;
      try {
        await auth.waitForCallback('state-1');
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('Timed out');
      }
    });
  });

  describe('login', () => {
    it('should open the browser, exchange the returned code and store tokens', async () => {
      let authorizeUrl;
      sinon.stub(auth, 'waitForCallback').callsFake(async (state, onListening) => {
        onListening();
        return 'code-from-browser';
      });
      auth.openBrowser = sinon.stub().callsFake((url) => { authorizeUrl = url; });
      fetchStub.resolves(tokenResponse({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_in: 3600,
        scope: 'playlist-modify-private playlist-modify-public'
      }));

      const tokens = await auth.login();

      expect(auth.openBrowser.calledOnce).to.be.true;
      const state = auth.waitForCallback.firstCall.args[0];
      expect(new URL(authorizeUrl).searchParams.get('state')).to.equal(state);
      const body = new URLSearchParams(fetchStub.firstCall.args[1].body);
      expect(body.get('code')).to.equal('code-from-browser');
      expect(generateCodeChallenge(body.get('code_verifier')))
        .to.equal(new URL(authorizeUrl).searchParams.get('code_challenge'));
      expect(tokens.accessToken).to.equal('access-1');
      expect(auth.loadTokens().refreshToken).to.equal('refresh-1');
    });

    it('should accept the redirect address pasted into the terminal', async () => {
      let authorizeUrl;
      auth.openBrowser = (url) => { authorizeUrl = url; };
      auth.readPastedUrl = async () => {
        // Wait until the browser step has produced the authorize URL and its state
        while (!authorizeUrl) await new Promise(resolve => setTimeout(resolve, 5));
        const state = new URL(authorizeUrl).searchParams.get('state');
        return `  http://127.0.0.1:18888/callback?code=pasted-code&state=${state}\n`;
      };
      fetchStub.resolves(tokenResponse({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600, scope: 'x' }));

      const tokens = await auth.login();

      expect(new URLSearchParams(fetchStub.firstCall.args[1].body).get('code')).to.equal('pasted-code');
      expect(tokens.accessToken).to.equal('access-1');
      // The callback server was shut down, so the port is free again
      const again = auth.waitForCallback('s', () => {
        requestCallback('http://127.0.0.1:18888/callback?code=c&state=s').catch(() => {});
      });
      expect(await again).to.equal('c');
    });

    it('should reject a pasted address with the wrong state', async () => {
      auth.readPastedUrl = async () => 'http://127.0.0.1:18888/callback?code=abc&state=forged';

      try {
        await auth.login();
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('state mismatch');
        expect(fetchStub.called).to.be.false;
      }
    });

    it('should explain when the pasted text is not an address', async () => {
      auth.readPastedUrl = async () => 'not a url';

      try {
        await auth.login();
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('not the browser address');
      }
    });
  });

  describe('getUserAccessToken', () => {
    const scope = 'playlist-modify-private playlist-modify-public';

    it('should return a stored token that has not expired', async () => {
      auth.saveTokens({ accessToken: 'stored', refreshToken: 'r', scope, expiresAt: Date.now() + 3600000 });
      const loginStub = sinon.stub(auth, 'login');

      expect(await auth.getUserAccessToken()).to.equal('stored');
      expect(fetchStub.called).to.be.false;
      expect(loginStub.called).to.be.false;
    });

    it('should refresh an expired token and save the result', async () => {
      auth.saveTokens({ accessToken: 'old', refreshToken: 'refresh-1', scope, expiresAt: Date.now() - 1000 });
      fetchStub.resolves(tokenResponse({ access_token: 'new', expires_in: 3600, scope }));

      expect(await auth.getUserAccessToken()).to.equal('new');
      expect(auth.loadTokens().accessToken).to.equal('new');
      expect(auth.loadTokens().refreshToken).to.equal('refresh-1');
    });

    it('should sign in again when the refresh token is rejected', async () => {
      auth.saveTokens({ accessToken: 'old', refreshToken: 'revoked', scope, expiresAt: Date.now() - 1000 });
      fetchStub.resolves(tokenResponse({ error: 'invalid_grant', error_description: 'Refresh token revoked' }, false, 400));
      sinon.stub(auth, 'login').resolves({ accessToken: 'fresh' });

      expect(await auth.getUserAccessToken()).to.equal('fresh');
      expect(logger.warn.called).to.be.true;
    });

    it('should not discard tokens on a transient refresh failure', async () => {
      auth.saveTokens({ accessToken: 'old', refreshToken: 'refresh-1', scope, expiresAt: Date.now() - 1000 });
      fetchStub.resolves(tokenResponse({}, false, 503));
      const loginStub = sinon.stub(auth, 'login');

      try {
        await auth.getUserAccessToken();
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('HTTP 503');
        expect(loginStub.called).to.be.false;
        expect(auth.loadTokens().refreshToken).to.equal('refresh-1');
      }
    });

    it('should sign in when stored tokens lack the playlist scopes', async () => {
      auth.saveTokens({ accessToken: 'stored', refreshToken: 'r', scope: 'user-read-email', expiresAt: Date.now() + 3600000 });
      sinon.stub(auth, 'login').resolves({ accessToken: 'fresh' });

      expect(await auth.getUserAccessToken()).to.equal('fresh');
    });

    it('should sign in when nothing is stored', async () => {
      sinon.stub(auth, 'login').resolves({ accessToken: 'fresh' });

      expect(await auth.getUserAccessToken()).to.equal('fresh');
    });
  });
});
