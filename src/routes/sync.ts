import { Hono } from "hono";
import { syncFromOfficialRegistry } from "../services/sync";

const sync = new Hono<{ Bindings: Env }>();

/**
 * GET /sync - Trigger manual sync
 * Also called by cron trigger
 */
sync.get("/sync", async (c) => {
  try {
    const result = await syncFromOfficialRegistry(c.env);

    if (result.success) {
      return c.json({
        success: true,
        message: "Sync completed successfully",
        processed: result.processed,
      });
    } else {
      return c.json(
        {
          success: false,
          message: "Sync failed",
          error: result.error,
        },
        500
      );
    }
  } catch (error) {
    console.error("Sync endpoint error:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

export default sync;
