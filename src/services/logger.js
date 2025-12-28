import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '../../logs');

const getLogFilePath = () => {
  const today = new Date().toISOString().split('T')[0];
  return path.join(logsDir, `${today}.log`);
};

export const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      level: 'debug',
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message }) => `[${level}]: ${message}`)
      )
    }),
    new winston.transports.File({
      level: 'info',
      filename: getLogFilePath(),
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} [${level}]: ${message}`
        })
      )
    })
  ]
});

export class Logger {
  info(message) {
    logger.info(message);
  }

  error(message) {
    logger.error(message);
  }

  debug(message) {
    logger.debug(message);
  }

  warn(message) {
    logger.warn(message);
  }
}