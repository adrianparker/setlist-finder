import { program } from 'commander';
import { searchArtist } from './commands/searchArtist.js';
import { setlist } from './commands/setlist.js';
import { login, logout } from './commands/login.js';
import fs from 'fs';
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

program
  .name('setlist-finder')
  .description('Find a setlist.')
  .version(pkg.version);

program
  .command('search <artistName>')
  .description('Search for an artist and get their MusicBrainz ID')
  .action(searchArtist);

program
  .command('setlist')
  .description('Search with an artist, city, and date, then get a setlist')
  .action(setlist);

program
  .command('login')
  .description('Sign in to Spotify so playlists can be created in your account')
  .action(login);

program
  .command('logout')
  .description('Remove the stored Spotify sign-in tokens')
  .action(logout);

program.parse(process.argv);