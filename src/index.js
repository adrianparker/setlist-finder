import { program } from 'commander';
import { searchArtist } from './commands/searchArtist.js';
import { setlist } from './commands/setlist.js';
import { login, logout } from './commands/login.js';
import { playlist } from './commands/playlist.js';
import { gig } from './commands/gig.js';
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
  .command('gig')
  .description('Create or update the Spotify playlist for a show: predicted for today or a future date, the actual setlist for a past date')
  .requiredOption('-p, --performer <name>', 'band or artist name')
  .requiredOption('-d, --date <YYYYMMDD>', 'date of the show, e.g. 20261029')
  .option('-c, --city <name>', 'city of the show, to pick the right setlist when the date has passed')
  .option('-s, --shows <count>', 'number of recent setlists to predict from', '5')
  .option('--private', 'make the playlist private (default: public; an existing playlist keeps its visibility)')
  .option('--dry-run', 'predict and match songs without signing in or changing any playlist')
  .action((options) => gig(options));

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