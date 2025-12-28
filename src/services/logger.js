import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '../../logs');

export class Logger {
  constructor() {
    this.ensureLogsDirectory();
    this.logFile = this.getLogFilePath();
  }

  ensureLogsDirectory() {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  }

  getLogFilePath() {
    const today = new Date().toISOString().split('T')[0];
    return path.join(logsDir, `${today}.log`);
  }

  getTimestamp() {
    return new Date().toISOString();
  }

  log(level, message) {
    const logEntry = `[${this.getTimestamp()}] [${level}] ${message}`;
    //console.log(logEntry);
    fs.appendFileSync(this.logFile, logEntry + '\n');
  }

  info(message) {
    this.log('INFO', message);
  }

  error(message) {
    this.log('ERROR', message);
  }
}