import { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string | null;
        role: Role;
        name: string | null;
      };
    }
  }
}
