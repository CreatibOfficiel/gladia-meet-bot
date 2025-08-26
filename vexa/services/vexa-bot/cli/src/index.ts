#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig } from "./config/config";
import { runBot } from "bot-core";

(function main() {
  const program = new Command();
  program
    .option('-c, --config <path>', 'Path to the bot config file')
    .action(async () => {
      const options = program.opts();
      if (!options.config) {
        console.error('Error: --config or -c option is required');
        process.exit(1);
      }
      const config = loadConfig(options.config);
      if (!config.success) {
        console.error("invalid configuration:", config.error.message)
        process.exit(1);
      }
      try {
        // Convert CLI config to full BotConfig format
        const fullConfig = {
          ...config.data,
          nativeMeetingId: config.data.meetingUrl.split('/').pop() || 'unknown',
          redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
          language: null,
          task: null
        };
        await runBot(fullConfig)
      } catch (error) {
        console.error('Failed to run bot:', error);
        process.exit(1);
      }
    });

  program.parse(process.argv);
})()
