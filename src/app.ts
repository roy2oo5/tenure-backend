import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import { swaggerSpec } from './config/swagger';
import routes from './routes';
import { errorHandler } from './middlewares/error.middleware';
import { AppError } from './utils/app-error';
import { logger } from './utils/logger';

const app = express();

// Secure HTTP Headers
app.use(helmet());

// Cross-Origin Resource Sharing
app.use(cors());

// Body Parsers with size limiting to prevent payload-based DoS
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Bind Express request logs to Winston logger
app.use(
  morgan(':method :url :status :res[content-length] - :response-time ms', {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

// API Documentation (Swagger UI)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Bind API root path
app.use('/api', routes);

// Serve uploads statically (for local fallback storage)
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Catch-all for unhandled route requests
app.all('*', (req, _res, next) => {
  next(new AppError(`Resource ${req.originalUrl} not found on this server`, 404));
});

// Centralized error handling middleware
app.use(errorHandler);

export default app;
