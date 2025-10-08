import { Hono } from "hono";
import { syncFromOfficialRegistry } from "../services/sync";
import { describeRoute, resolver } from "hono-openapi";
import z from "zod";

const sync = new Hono<{ Bindings: Env }>()
  /**
   * GET /sync - Trigger manual sync
   * Also called by cron trigger
   */ .get(
    "/sync",
    describeRoute({
      tags: ["Admin"],
      summary: "Trigger manual sync",
      description: "Manually trigger sync from official MCP registry",
      responses: {
        200: {
          description: "Sync completed successfully",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  success: z.boolean(),
                  message: z.string(),
                  processed: z.number(),
                })
              ),
            },
          },
        },
        500: {
          description: "Sync failed",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  success: z.boolean(),
                  message: z.string(),
                  error: z.string().optional(),
                })
              ),
            },
          },
        },
      },
    }),
    async (c) => {
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
    }
  );

export default sync;
