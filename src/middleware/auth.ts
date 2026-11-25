import type { RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env";
import { getDb } from "../config/db";
import { HttpError } from "../utils/http-error";
import type { UserRole } from "../types/roles";

const jwks = createRemoteJWKSet(new URL(`${env.betterAuthUrl}/api/auth/jwks`));

export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Authentication token is required.");
    const token = header.slice("Bearer ".length).trim();
    if (!token) throw new HttpError(401, "Authentication token is required.");
    const { payload } = await jwtVerify(token, jwks, {
      issuer: env.betterAuthUrl,
      audience: env.betterAuthUrl,
    });
    if (!payload.sub) throw new HttpError(401, "Token does not contain a user subject.");

    // Look up the current database record. A role supplied in a request body or stale JWT is never trusted.
    const user = await getDb().collection("users").findOne({
      $or: [{ _id: payload.sub }, { id: payload.sub }],
    });
    if (!user) throw new HttpError(401, "Account no longer exists.");
    if (user.isBlocked) throw new HttpError(403, "This account has been blocked.");
    const role = user.role as UserRole;
    if (!["customer", "vendor", "admin"].includes(role)) throw new HttpError(403, "Account role is not valid.");

    req.user = {
      id: String(user._id ?? user.id),
      name: String(user.name || "WedPlan member"),
      email: String(user.email || ""),
      image: user.image || null,
      role,
      isBlocked: Boolean(user.isBlocked),
      businessName: user.businessName,
      subscriptionPlan: user.subscriptionPlan || "free",
      subscriptionExpiresAt: user.subscriptionExpiresAt || null,
    };
    next();
  } catch (error) {
    if (error instanceof HttpError) return next(error);
    const message = error instanceof Error ? error.message : "Invalid authentication token.";
    if (message.toLowerCase().includes("jws") || message.toLowerCase().includes("jwt") || message.toLowerCase().includes("signature") || message.toLowerCase().includes("claim")) {
      return next(new HttpError(401, "Invalid or expired authentication token."));
    }
    next(error);
  }
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, "Authentication is required."));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, "You do not have permission to perform this action."));
    next();
  };
}
