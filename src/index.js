import { program } from 'commander';
import { searchArtist } from './commands/searchArtist.js';

program
  .name('setlist-finder')
  .description('Find a setlist')
  .version('1.0.0');

program
  .command('search <artistName>')
  .description('Search for an artist and get their MusicBrainz ID')
  .action(searchArtist);

program.parse(process.argv);