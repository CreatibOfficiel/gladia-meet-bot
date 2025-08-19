let fileLoggingEnabled = false;
let logFilePath: string | null = null;

export function initFileLogger(connectionId?: string): void {
  try {
    const logDir = process.env.BOT_LOG_DIR;
    if (!logDir) {
      return; // No-op if not configured
    }
    const fs = require('fs');
    const path = require('path');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const baseName = connectionId ? `bot_${connectionId}` : `bot_${Date.now()}`;
    logFilePath = path.join(logDir, `${baseName}.log`);
    fileLoggingEnabled = true;
  } catch (_) {
    fileLoggingEnabled = false;
    logFilePath = null;
  }
}

export function log(message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [BotCore] ${message}`;
  console.log(line);
  if (fileLoggingEnabled && logFilePath) {
    try {
      const fs = require('fs');
      fs.appendFileSync(logFilePath, line + '\n');
    } catch (_) {
      // ignore file write errors
    }
  }
}

export function randomDelay(amount: number) {
  return (2 * Math.random() - 1) * (amount / 10) + amount;
}

