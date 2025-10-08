import { Hono } from "hono";
import { cors } from "hono/cors";
import registry from "./routes/registry";
import { syncFromOfficialRegistry } from "./services/sync";
import sync from "./routes/sync";
import { secretAuthMiddleware } from "./middleware/secret-auth";
import admin from "./routes/admin";
import { openAPIRouteHandler } from "hono-openapi";
import { Scalar } from "@scalar/hono-api-reference";

const app = new Hono<{ Bindings: Env }>();

app.use("/*", cors());

app.route("/v0", registry); // MCP Registry API (spec-compliant)

// Protected admin routes
app.use("/admin/*", secretAuthMiddleware);
app.route("/admin", admin);

// Protected internal sync endpoint
app.use("/internal/*", secretAuthMiddleware);
app.route("/internal", sync); // Internal sync endpoint

app.get(
  "/openapi.json",
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: "mcp-subregistry",
        description:
          "A hosted MCP registry / subregistry synced with the Official MCP Registry or any parent registry.",
        version: "0.0.1",
        license: {
          name: "MIT",
        },
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "string",
            description: "A token is required for admin specific operations.",
          },
        },
      },
    },
  })
);

app.get(
  "/docs",
  Scalar({
    url: "/openapi.json",
  })
);

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error(`Error: ${err}`);
  return c.json(
    {
      error: err.message || "Internal Server Error",
    },
    500
  );
});

// Export for Cloudflare Workers
export default {
  fetch: app.fetch,

  /**
   * Scheduled event handler (Cron trigger)
   * Runs daily at 2 AM UTC to sync from official registry
   */
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log("Starting scheduled sync...");

    // Execute sync
    ctx.waitUntil(
      syncFromOfficialRegistry(env).then((result) => {
        if (result.success) {
          console.log(`Sync completed: ${result.processed} processed`);
        } else {
          console.error(`Sync failed: ${result.error}`);
        }
      })
    );
  },
};
