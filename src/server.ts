import { createApp } from './app';
import { config } from './config/env';
import { disconnectPrisma } from './prisma/client';

const app = createApp({ config });

const server = app.listen(config.port, () => {
  console.log(`Epolia Express API listening on port ${config.port}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`${signal} received, shutting down Express API`);
  server.close(() => {
    void disconnectPrisma().finally(() => {
      process.exit(0);
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
