import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import readline from 'readline/promises';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
// playlist-read-private lets the app find the user's existing private playlists to update them
export const SPOTIFY_SCOPES = ['playlist-modify-private', 'playlist-modify-public', 'playlist-read-private'];
// Spotify no longer accepts "localhost"; loopback redirects must use an IP literal.
export const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:8888/callback';
export const DEFAULT_TOKEN_PATH = path.join(__dirname, '../../.spotify-token.json');
const DEFAULT_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
// Refresh slightly before the real expiry so a token never expires mid-request
const EXPIRY_MARGIN_MS = 60 * 1000;

/**
 * Generate a PKCE code verifier: 43-128 characters from the unreserved set [A-Za-z0-9-._~]
 */
export function generateCodeVerifier(length = 64) {
  if (length < 43 || length > 128) {
    throw new Error('Code verifier length must be between 43 and 128');
  }
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.randomBytes(length);
  let verifier = '';
  for (const byte of bytes) {
    verifier += possible[byte % possible.length];
  }
  return verifier;
}

/**
 * Derive the S256 PKCE code challenge: base64url(sha256(verifier)) without padding
 */
export function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Open a URL in the default browser, independent of operating system
 */
export function openInBrowser(url) {
  const commands = {
    darwin: ['open', [url]],
    win32: ['cmd', ['/c', 'start', '""', url]]
  };
  const [command, args] = commands[process.platform] || ['xdg-open', [url]];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => {});
  child.unref();
}

/**
 * Spotify user sign-in using the Authorization Code with PKCE flow.
 * Tokens are stored in a local, gitignored JSON file and refreshed as needed.
 */
export class SpotifyAuth {
  constructor(logger, options = {}) {
    this.logger = logger;
    this.clientId = options.clientId || process.env.SPOTIFY_CLIENT_ID;
    this.redirectUri = options.redirectUri || process.env.SPOTIFY_REDIRECT_URI || DEFAULT_REDIRECT_URI;
    this.tokenPath = options.tokenPath || process.env.SPOTIFY_TOKEN_PATH || DEFAULT_TOKEN_PATH;
    this.scopes = options.scopes || SPOTIFY_SCOPES;
    this.openBrowser = options.openBrowser || openInBrowser;
    if (options.readPastedUrl) this.readPastedUrl = options.readPastedUrl;
    this.timeoutMs = options.timeoutMs || DEFAULT_LOGIN_TIMEOUT_MS;

    if (!this.clientId) {
      throw new Error('SPOTIFY_CLIENT_ID environment variable is required');
    }
  }

  buildAuthorizeUrl(codeChallenge, state) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      state,
      scope: this.scopes.join(' ')
    });
    return `${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`;
  }

  async requestToken(params, description) {
    this.logger.debug(`Spotify token request: ${description}`);
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString()
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const detail = errorData.error_description || errorData.error || response.statusText;
      const err = new Error(`HTTP ${response.status}: ${detail}`);
      err.oauthError = errorData.error;
      throw err;
    }

    const data = await response.json();
    this.logger.debug(`Spotify token request succeeded: ${description}`);
    return data;
  }

  toStoredTokens(data, previousRefreshToken) {
    return {
      accessToken: data.access_token,
      // Spotify may omit refresh_token on refresh; keep the previous one in that case
      refreshToken: data.refresh_token || previousRefreshToken,
      scope: data.scope || '',
      expiresAt: Date.now() + data.expires_in * 1000
    };
  }

  async exchangeCode(code, codeVerifier) {
    const data = await this.requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      code_verifier: codeVerifier
    }, 'authorization code exchange');
    return this.toStoredTokens(data);
  }

  async refreshAccessToken(refreshToken) {
    const data = await this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId
    }, 'refresh access token');
    return this.toStoredTokens(data, refreshToken);
  }

  loadTokens() {
    try {
      return JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));
    } catch {
      return null;
    }
  }

  saveTokens(tokens) {
    fs.mkdirSync(path.dirname(this.tokenPath), { recursive: true });
    fs.writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  }

  clearTokens() {
    fs.rmSync(this.tokenPath, { force: true });
  }

  hasRequiredScopes(tokens) {
    const granted = (tokens?.scope || '').split(' ');
    return this.scopes.every(scope => granted.includes(scope));
  }

  /**
   * Validate the query parameters Spotify appends to the redirect URI and return the code
   * @param {URLSearchParams} searchParams - query parameters from the redirect
   * @param {string} expectedState - state value sent in the authorize request
   */
  extractAuthorizationCode(searchParams, expectedState) {
    const error = searchParams.get('error');
    if (error) {
      throw new Error(`Spotify authorization failed: ${error}`);
    }
    if (searchParams.get('state') !== expectedState) {
      throw new Error('Spotify authorization failed: state mismatch');
    }
    const code = searchParams.get('code');
    if (!code) {
      throw new Error('Spotify authorization failed: no code returned');
    }
    return code;
  }

  /**
   * Start a temporary loopback server and resolve with the authorization code
   * once Spotify redirects the browser back to it.
   * @param {string} expectedState - state value sent in the authorize request
   * @param {Function} onListening - called once the server is ready to receive the redirect
   * @param {AbortSignal} signal - stops the server early, e.g. when the code was pasted instead
   */
  waitForCallback(expectedState, onListening = () => {}, signal) {
    const redirect = new URL(this.redirectUri);

    return new Promise((resolve, reject) => {
      let timer;
      const stop = () => {
        clearTimeout(timer);
        server.close();
        server.closeAllConnections();
      };

      const server = http.createServer((req, res) => {
        const url = new URL(req.url, this.redirectUri);
        if (url.pathname !== redirect.pathname) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }

        let code;
        let failure;
        try {
          code = this.extractAuthorizationCode(url.searchParams, expectedState);
        } catch (err) {
          failure = err;
        }
        const message = failure
          ? 'Spotify sign-in was not completed. You can close this window and try again.'
          : 'Signed in to Spotify. You can close this window and return to the terminal.';

        clearTimeout(timer);
        res.writeHead(failure ? 400 : 200, { 'Content-Type': 'text/html; charset=utf-8', 'Connection': 'close' });
        res.end(`<!doctype html><title>setlist-finder</title><p>${message}</p>`, stop);
        if (failure) reject(failure); else resolve(code);
      });

      server.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`Could not start sign-in callback server on ${redirect.host}: ${err.message}`));
      });

      signal?.addEventListener('abort', () => {
        stop();
        reject(new Error('Sign-in callback cancelled'));
      }, { once: true });

      timer = setTimeout(() => {
        stop();
        reject(new Error('Timed out waiting for Spotify sign-in'));
      }, this.timeoutMs);

      server.listen(Number(redirect.port) || 80, redirect.hostname, () => onListening(server));
    });
  }

  /**
   * Fallback for browsers that refuse to open the http loopback address (e.g. Safari
   * with HTTPS-Only enabled): read the address the browser was sent to from the terminal.
   * Resolves with the pasted text, or never resolves when stdin is not interactive.
   * @param {AbortSignal} signal - closes the prompt once sign-in finishes another way
   */
  async readPastedUrl(signal) {
    if (!process.stdin.isTTY) {
      return new Promise(() => {});
    }
    this.logger.info('If the browser shows an error page instead, copy the full address from its address bar and paste it below.');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    signal.addEventListener('abort', () => rl.close(), { once: true });
    try {
      // A one-line prompt: readline redraws only the last line, so a multi-line prompt was printed twice
      return await rl.question('Address: ', { signal });
    } finally {
      rl.close();
    }
  }

  /**
   * Run the full interactive sign-in: open the browser, wait for the redirect
   * (or the pasted redirect address), exchange the code for tokens and store them.
   */
  async login() {
    const codeVerifier = generateCodeVerifier();
    const state = crypto.randomBytes(16).toString('hex');
    const authorizeUrl = this.buildAuthorizeUrl(generateCodeChallenge(codeVerifier), state);
    const controller = new AbortController();

    let browserOpened;
    const opened = new Promise(resolve => { browserOpened = resolve; });

    const fromBrowser = this.waitForCallback(state, () => {
      this.logger.info('Opening your browser to sign in to Spotify.');
      this.logger.info(`If it does not open, visit this URL: ${authorizeUrl}`);
      this.openBrowser(authorizeUrl);
      browserOpened();
    }, controller.signal);

    // Prompt for a pasted address only once the browser messages have been printed
    const fromPaste = opened.then(() => this.readPastedUrl(controller.signal)).then((pasted) => {
      let url;
      try {
        url = new URL(pasted.trim());
      } catch {
        throw new Error('The pasted text is not the browser address; run login again and paste the full address');
      }
      this.logger.debug('Using pasted Spotify redirect address');
      return this.extractAuthorizationCode(url.searchParams, state);
    });

    let code;
    try {
      code = await Promise.race([fromBrowser, fromPaste]);
    } finally {
      controller.abort();
      // The losing side rejects on abort; nothing is waiting for it
      fromBrowser.catch(() => {});
      fromPaste.catch(() => {});
    }

    const tokens = await this.exchangeCode(code, codeVerifier);
    this.saveTokens(tokens);
    this.logger.info('Spotify sign-in complete.');
    return tokens;
  }

  /**
   * Return a valid user access token, refreshing or signing in as required
   */
  async getUserAccessToken() {
    const stored = this.loadTokens();

    if (stored && this.hasRequiredScopes(stored)) {
      if (stored.accessToken && Date.now() < stored.expiresAt - EXPIRY_MARGIN_MS) {
        return stored.accessToken;
      }
      if (stored.refreshToken) {
        try {
          const tokens = await this.refreshAccessToken(stored.refreshToken);
          this.saveTokens(tokens);
          return tokens.accessToken;
        } catch (err) {
          // Only a rejected refresh token means signing in again; other failures are reported
          if (err.oauthError !== 'invalid_grant') throw err;
          this.logger.warn(`Spotify refresh token no longer valid, signing in again: ${err.message}`);
          this.clearTokens();
        }
      }
    }

    const tokens = await this.login();
    return tokens.accessToken;
  }
}
