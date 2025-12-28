import { program } from 'commander';
import { searchArtist } from './commands/searchArtist.js';
import { setlist } from './commands/setlist.js';
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
  .description('Search with an artist, location, and date, then get a setlist')
  .action(setlist);

program.parse(process.argv);