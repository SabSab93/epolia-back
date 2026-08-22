import { createApp } from './app';
import { getAppConfig } from './config/env';

const config = getAppConfig();
const app = createApp({ config });

const server = app.listen(config.port, () => {
  console.log(`Epolia Express API listening on port ${config.port}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`${signal} received, shutting down Express API`);
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
