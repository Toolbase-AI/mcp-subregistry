import { createMiddleware } from "hono/factory";
import { jwtVerify, createRemoteJWKSet, JWTPayload } from "jose";
import { Variables } from "~/types/app";

/**
 * Middleware to validate Cloudflare Access JWT
 * Protects routes by verifying the CF Access JWT assertion header
 */
export const cloudflareAccessMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  // Get the JWT from the request headers
  const token = c.req.header("cf-access-jwt-assertion");

  // Check if token exists
  if (!token) {
    return c.json(
      {
        error: "Missing required access token",
        message: "This endpoint requires Cloudflare Access authentication",
      },
      403
    );
  }

  try {
    // Create JWKS from your team domain
    const JWKS = createRemoteJWKSet(
      // @ts-expect-error
      new URL(`${c.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`)
    );

    // Verify the JWT
    const { payload } = await jwtVerify(token, JWKS, {
      // @ts-expect-error
      issuer: c.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
      // @ts-expect-error
      audience: c.env.CLOUDFLARE_ACCESS_POLICY_AUD,
    });

    // Store user info in context for downstream use
    c.set("user", payload);

    console.log(
      `Initiating admin request from ${
        payload?.email ? payload.email : "no user"
      }`
    );
  } catch (error) {
    // Token verification failed
    return c.json(
      {
        error: "Invalid token",
        message:
          error instanceof Error ? error.message : "Token verification failed",
      },
      403
    );
  }

  return next();
});
