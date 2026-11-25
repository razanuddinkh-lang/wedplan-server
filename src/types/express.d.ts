import type { UserRole } from "./roles";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        email: string;
        image?: string | null;
        role: UserRole;
        isBlocked: boolean;
        businessName?: string;
        subscriptionPlan?: "free" | "premium";
        subscriptionExpiresAt?: Date | null;
      };
    }
  }
}
export {};
