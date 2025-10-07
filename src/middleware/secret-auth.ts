import { createMiddleware } from "hono/factory";
import { jwtVerify, createRemoteJWKSet, JWTPayload } from "jose";

/**
 * Secret auth that checks against the Authorization header with a secret
 */
export const secretAuthMiddleware = createMiddleware<{
  Bindings: Env;
}>(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  // Check if header exists and starts with "Bearer "
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Extract the token (everything after "Bearer ")
  const token = authHeader.substring(7); // "Bearer " is 7 characters

  // Compare with your secret
  if (token !== c.env.REGISTRY_ADMIN_SECRET) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
});
