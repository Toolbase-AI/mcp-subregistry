import { Hono } from "hono";
import { cors } from "hono/cors";
import registry from "./routes/registry";
import { syncFromOfficialRegistry } from "./services/sync";
import sync from "./routes/sync";

const app = new Hono<{ Bindings: Env }>();

app.use("/*", cors());

app.route("/v0", registry); // MCP Registry API (spec-compliant)

// @todo Prevent access
app.route("/internal", sync); // Internal sync endpoint

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
