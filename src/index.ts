import app from './app';
import { env } from './config/env';
import { connectDB, prisma } from './config/database';
import { logger } from './utils/logger';
import { initWebSocket } from './services/websocket.service';


// Standard Uncaught Exception handler
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  logger.error(err.message);
  if (err.stack) {
    logger.error(err.stack);
  }
  process.exit(1);
});

let server: ReturnType<typeof app.listen>;

const boot = async () => {
  // 1. Verify DB connection
  await connectDB();

  // 2. Bind port and start serving traffic
  server = app.listen(env.PORT, () => {
    logger.info(`🚀 Server listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
  });
  initWebSocket(server);

};

boot();

// Standard Unhandled Promise Rejection handler
process.on('unhandledRejection', (err: Error) => {
  logger.error('UNHANDLED REJECTION! 💥 Shutting down gracefully...');
  logger.error(err.message);
  if (err.stack) {
    logger.error(err.stack);
  }
  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed.');
      await prisma.$disconnect();
      logger.info('Database client disconnected.');
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

// SIGINT / SIGTERM Graceful Shutdown sequence
const shutdown = (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed.');
      await prisma.$disconnect();
      logger.info('Database connection closed.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
