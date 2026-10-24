import { program } from 'commander';
import { searchArtist } from './commands/searchArtist.js';
import { setlist } from './commands/setlist.js';
import { login, logout } from './commands/login.js';
import { playlist } from './commands/playlist.js';
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
  .command('playlist')
  .description('Create a Spotify playlist from a song-list JSON file, in the file\'s order')
  .requiredOption('-f, --file <path>', 'song-list JSON file ({ artist, title, songs: [{ name, note }] })')
  .requiredOption('-d, --date <YYYYMMDD>', 'date of the performance, e.g. 20261029')
  .requiredOption('-p, --performer <name>', 'band or artist name for the playlist title and description')
  .option('--private', 'make the playlist private (default: public)')
  .option('--dry-run', 'match songs and print the table without creating a playlist')
  .action((options) => playlist(options));

program
  .command('login')
  .description('Sign in to Spotify so playlists can be created in your account')
  .action(login);

program
  .command('logout')
  .description('Remove the stored Spotify sign-in tokens')
  .action(logout);

program.parse(process.argv);