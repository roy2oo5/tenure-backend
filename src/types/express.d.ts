import { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string | null;
        role: Role;
        name: string | null;
      };
    }
  }
}
