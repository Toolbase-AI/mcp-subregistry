import { Hono } from "hono";
import { eq, desc, and } from "drizzle-orm";
import { servers, syncLog, packageMetadata } from "../db/schema";
import { getDatabaseConnection } from "~/db/connection";
import { describeRoute, resolver, validator } from "hono-openapi";
import z from "zod";

const admin = new Hono<{ Bindings: Env }>()
  /**
   * GET /sync/status - Get sync logs
   * Returns recent sync operations and their results
   */
  .get(
    "/sync/status",
    describeRoute({
      tags: ["Admin"],
      summary: "Get sync logs",
      description: "Returns recent sync operations and their results (last 10)",
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        200: {
          description: "Successfully retrieved sync logs",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  logs: z.array(
                    z.object({
                      id: z.number(),
                      source: z.string(),
                      status: z.enum(["success", "failure"]),
                      serversProcessed: z.number(),
                      errorMessage: z.string().nullable(),
                      syncedAt: z.iso.datetime(),
                    })
                  ),
                })
              ),
            },
          },
        },
        500: {
          description: "Failed to fetch sync logs",
        },
      },
    }),
    async (c) => {
      const db = getDatabaseConnection();

      try {
        const logs = await db
          .select()
          .from(syncLog)
          .orderBy(desc(syncLog.syncedAt))
          .limit(10);

        return c.json({ logs });
      } catch (error) {
        console.error("Error fetching sync logs:", error);
        return c.json({ error: "Failed to fetch sync logs" }, 500);
      }
    }
  )
  /**
   * GET /servers/:name/metadata - Get server metadata
   * Returns server-level metadata shared across all versions
   */
  .get(
    "/servers/:name/metadata",
    describeRoute({
      tags: ["Admin"],
      summary: "Get package metadata",
      description: "Get package-level metadata (shared across all versions)",
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        200: {
          description: "Successfully retrieved metadata",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  name: z.string(),
                  registryMeta: z.record(z.string(), z.unknown()),
                  createdAt: z.string(),
                  updatedAt: z.string(),
                })
              ),
            },
          },
        },
        404: {
          description: "Server not found",
        },
      },
    }),
    async (c) => {
      const db = getDatabaseConnection();
      const { name } = c.req.param();

      try {
        const [pkg] = await db
          .select()
          .from(packageMetadata)
          .where(eq(packageMetadata.name, decodeURIComponent(name)))
          .limit(1);

        if (!pkg) {
          return c.json({ error: "Server not found" }, 404);
        }

        return c.json({
          name: pkg.name,
          registryMeta: pkg.registryMeta,
          createdAt: pkg.createdAt,
          updatedAt: pkg.updatedAt,
        });
      } catch (error) {
        console.error("Error fetching server metadata:", error);
        return c.json({ error: "Failed to fetch server metadata" }, 500);
      }
    }
  )
  /**
   * PUT /servers/:name/metadata - Add or update server metadata
   * Accepts generic JSON metadata for server-level enrichments (replaces entire metadata)
   */
  .put(
    "/servers/:name/metadata",
    describeRoute({
      tags: ["Admin"],
      summary: "Create or replace package metadata",
      description:
        "Upsert package-level metadata (replaces entire metadata object)",
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        200: {
          description: "Successfully updated metadata",
          content: {
            "application/json": {
              schema: resolver(z.object({ success: z.boolean() })),
            },
          },
        },
      },
    }),
    validator("json", z.record(z.string(), z.unknown())),
    async (c) => {
      const db = getDatabaseConnection();
      const { name } = c.req.param();

      try {
        const metadata = c.req.valid("json");
        const decodedName = decodeURIComponent(name);

        await db
          .insert(packageMetadata)
          .values({
            name: decodedName,
            registryMeta: metadata,
          })
          .onConflictDoUpdate({
            target: packageMetadata.name,
            set: {
              registryMeta: metadata,
              updatedAt: new Date(),
            },
          });

        return c.json({ success: true });
      } catch (error) {
        console.error("Error updating server metadata:", error);
        return c.json({ error: "Failed to update server metadata" }, 500);
      }
    }
  )
  /**
   * PATCH /servers/:name/metadata - Partially update server metadata
   * Merges provided JSON with existing metadata
   */
  .patch(
    "/servers/:name/metadata",
    describeRoute({
      tags: ["Admin"],
      summary: "Partially update package metadata",
      description: "Merge JSON with existing package metadata",
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        200: {
          description: "Successfully updated metadata",
          content: {
            "application/json": {
              schema: resolver(z.object({ success: z.boolean() })),
            },
          },
        },
        404: {
          description: "Server not found",
        },
      },
    }),
    validator("json", z.record(z.string(), z.unknown())),
    async (c) => {
      const db = getDatabaseConnection();
      const { name } = c.req.param();

      try {
        const partialMetadata = c.req.valid("json");
        const decodedName = decodeURIComponent(name);

        // Check if server exists
        const [existing] = await db
          .select({
            registryMeta: packageMetadata.registryMeta,
          })
          .from(packageMetadata)
          .where(eq(packageMetadata.name, decodedName))
          .limit(1);

        if (!existing) {
          return c.json({ error: "Server not found" }, 404);
        }

        // Merge with existing metadata
        const updatedMetadata = {
          ...existing.registryMeta,
          ...partialMetadata,
        };

        await db
          .update(packageMetadata)
          .set({
            registryMeta: updatedMetadata,
            updatedAt: new Date(),
          })
          .where(eq(packageMetadata.name, decodedName));

        return c.json({ success: true });
      } catch (error) {
        console.error("Error patching server metadata:", error);
        return c.json({ error: "Failed to patch server metadata" }, 500);
      }
    }
  )
  /**
   * DELETE /servers/:name/metadata - Delete server metadata
   * Removes the entire server metadata entry
   */
  .delete(
    "/servers/:name/metadata",
    describeRoute({
      tags: ["Admin"],
      summary: "Delete package metadata",
      description: "Remove the entire package metadata entry",
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        200: {
          description: "Successfully deleted metadata",
          content: {
            "application/json": {
              schema: resolver(z.object({ success: z.boolean() })),
            },
          },
        },
      },
    }),
    async (c) => {
      const db = getDatabaseConnection();
      const { name } = c.req.param();

      try {
        const decodedName = decodeURIComponent(name);

        await db
          .delete(packageMetadata)
          .where(eq(packageMetadata.name, decodedName));

        return c.json({ success: true });
      } catch (error) {
        console.error("Error deleting server metadata:", error);
        return c.json({ error: "Failed to delete server metadata" }, 500);
      }
    }
  )
  /**
   * PATCH /servers/:name/visibility - Set visibility for package (all versions)
   * Controls whether a package and its versions are published
   */
  .patch(
    "/servers/:name/visibility",
    describeRoute({
      tags: ["Admin"],
      summary: "Set package visibility",
      description:
        "Set visibility for all versions of a package (draft or published)",
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        200: {
          description: "Successfully updated visibility",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  success: z.boolean(),
                  visibility: z.enum(["draft", "published"]),
                })
              ),
            },
          },
        },
        400: {
          description: "Invalid visibility value",
        },
      },
    }),
    validator("json", z.object({ visibility: z.enum(["draft", "published"]) })),
    async (c) => {
      const db = getDatabaseConnection();
      const { name } = c.req.param();

      try {
        const { visibility } = c.req.valid("json");
        const decodedName = decodeURIComponent(name);

        // Upsert packageMetadata with visibility
        await db
          .insert(packageMetadata)
          .values({
            name: decodedName,
            visibility,
          })
          .onConflictDoUpdate({
            target: packageMetadata.name,
            set: {
              visibility,
              updatedAt: new Date(),
            },
          });

        return c.json({ success: true, visibility });
      } catch (error) {
        console.error("Error updating package visibility:", error);
        return c.json({ error: "Failed to update package visibility" }, 500);
      }
    }
  )
  /**
   * GET /servers/:name/versions/:version/metadata - Get version-specific metadata
   * Returns metadata for a specific server version
   */
  .get(
    "/servers/:name/versions/:version/metadata",
    describeRoute({
      tags: ["Admin"],
      summary: "Get version metadata",
      description: "Get version-specific metadata for a server version",
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        200: {
          description: "Successfully retrieved metadata",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  name: z.string(),
                  version: z.string(),
                  versionRegistryMeta: z.record(z.string(), z.unknown()),
                  updatedAt: z.string(),
                })
              ),
            },
          },
        },
        404: {
          description: "Server version not found",
        },
      },
    }),
    async (c) => {
      const db = getDatabaseConnection();
      const { name, version } = c.req.param();

      try {
        const [server] = await db
          .select({
            name: servers.name,
            version: servers.version,
            versionRegistryMeta: servers.versionRegistryMeta,
            updatedAt: servers.updatedAt,
          })
          .from(servers)
          .where(
            and(
              eq(servers.name, decodeURIComponent(name)),
              eq(servers.version, decodeURIComponent(version))
            )
          )
          .limit(1);

        if (!server) {
          return c.json({ error: "Server version not found" }, 404);
        }

        return c.json({
          name: server.name,
          version: server.version,
          versionRegistryMeta: server.versionRegistryMeta,
          updatedAt: server.updatedAt,
        });
      } catch (error) {
        console.error("Error fetching version metadata:", error);
        return c.json({ error: "Failed to fetch version metadata" }, 500);
      }
    }
  )
  /**
   * PUT /servers/:name/versions/:version/metadata - Add or update version-specific metadata
   * Accepts generic JSON metadata for version-level enrichments (replaces entire metadata)
   * Note: Server version must exist in the servers table first
   */
  .put(
    "/servers/:name/versions/:version/metadata",
    describeRoute({
      tags: ["Admin"],
      summary: "Replace version metadata",
      description:
        "Replace version-specific metadata (server version must exist)",
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        200: {
          description: "Successfully updated metadata",
          content: {
            "application/json": {
              schema: resolver(z.object({ success: z.boolean() })),
            },
          },
        },
        404: {
          description: "Server version not found",
        },
      },
    }),
    validator("json", z.record(z.string(), z.unknown())),
    async (c) => {
      const db = getDatabaseConnection();
      const { name, version } = c.req.param();

      try {
        const metadata = c.req.valid("json");
        const decodedName = decodeURIComponent(name);
        const decodedVersion = decodeURIComponent(version);

        // Check if server version exists
        const [existing] = await db
          .select({
            name: servers.name,
          })
          .from(servers)
          .where(
            and(
              eq(servers.name, decodedName),
              eq(servers.version, decodedVersion)
            )
          )
          .limit(1);

        if (!existing) {
          return c.json(
            {
              error: "Server version not found",
              message: "Server version must exist before adding metadata",
            },
            404
          );
        }

        // Update version-specific metadata
        await db
          .update(servers)
          .set({
            versionRegistryMeta: metadata,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(servers.name, decodedName),
              eq(servers.version, decodedVersion)
            )
          );

        return c.json({ success: true });
      } catch (error) {
        console.error("Error updating version metadata:", error);
        return c.json({ error: "Failed to update version metadata" }, 500);
      }
    }
  )
  /**
   * PATCH /servers/:name/versions/:version/metadata - Partially update version-specific metadata
   * Merges provided JSON with existing metadata
   * Note: Server version must exist in the servers table first
   */
  .patch(
    "/servers/:name/versions/:version/metadata",
    describeRoute({
      tags: ["Admin"],
      summary: "Partially update version metadata",
      description:
        "Merge JSON with existing version metadata (server version must exist)",
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        200: {
          description: "Successfully updated metadata",
          content: {
            "application/json": {
              schema: resolver(z.object({ success: z.boolean() })),
            },
          },
        },
        404: {
          description: "Server version not found",
        },
      },
    }),
    validator("json", z.record(z.string(), z.unknown())),
    async (c) => {
      const db = getDatabaseConnection();
      const { name, version } = c.req.param();

      try {
        const partialMetadata = c.req.valid("json");
        const decodedName = decodeURIComponent(name);
        const decodedVersion = decodeURIComponent(version);

        // Check if server version exists
        const [existing] = await db
          .select({
            versionRegistryMeta: servers.versionRegistryMeta,
          })
          .from(servers)
          .where(
            and(
              eq(servers.name, decodedName),
              eq(servers.version, decodedVersion)
            )
          )
          .limit(1);

        if (!existing) {
          return c.json(
            {
              error: "Server version not found",
              message: "Server version must exist before adding metadata",
            },
            404
          );
        }

        // Merge with existing metadata
        const updatedMetadata = {
          ...existing.versionRegistryMeta,
          ...partialMetadata,
        };

        await db
          .update(servers)
          .set({
            versionRegistryMeta: updatedMetadata,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(servers.name, decodedName),
              eq(servers.version, decodedVersion)
            )
          );

        return c.json({ success: true });
      } catch (error) {
        console.error("Error patching version metadata:", error);
        return c.json({ error: "Failed to patch version metadata" }, 500);
      }
    }
  )
  /**
   * DELETE /servers/:name/versions/:version/metadata - Delete version-specific metadata
   * Resets metadata to empty object
   */
  .delete(
    "/servers/:name/versions/:version/metadata",
    describeRoute({
      tags: ["Admin"],
      summary: "Delete version metadata",
      description: "Reset version metadata to empty object",
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        200: {
          description: "Successfully deleted metadata",
          content: {
            "application/json": {
              schema: resolver(z.object({ success: z.boolean() })),
            },
          },
        },
        404: {
          description: "Server version not found",
        },
      },
    }),
    async (c) => {
      const db = getDatabaseConnection();
      const { name, version } = c.req.param();

      try {
        const decodedName = decodeURIComponent(name);
        const decodedVersion = decodeURIComponent(version);

        // Check if server version exists
        const [existing] = await db
          .select({
            name: servers.name,
          })
          .from(servers)
          .where(
            and(
              eq(servers.name, decodedName),
              eq(servers.version, decodedVersion)
            )
          )
          .limit(1);

        if (!existing) {
          return c.json({ error: "Server version not found" }, 404);
        }

        // Reset version metadata to empty object
        await db
          .update(servers)
          .set({
            versionRegistryMeta: {},
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(servers.name, decodedName),
              eq(servers.version, decodedVersion)
            )
          );

        return c.json({ success: true });
      } catch (error) {
        console.error("Error deleting version metadata:", error);
        return c.json({ error: "Failed to delete version metadata" }, 500);
      }
    }
  )
  /**
   * PATCH /servers/:name/versions/:version/visibility - Set visibility for specific version
   * Controls whether a specific server version is published
   */
  .patch(
    "/servers/:name/versions/:version/visibility",
    describeRoute({
      tags: ["Admin"],
      summary: "Set version visibility",
      description:
        "Set visibility for a specific server version (draft or published)",
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        200: {
          description: "Successfully updated visibility",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  success: z.boolean(),
                  visibility: z.enum(["draft", "published"]),
                })
              ),
            },
          },
        },
        400: {
          description: "Invalid visibility value",
        },
        404: {
          description: "Server version not found",
        },
      },
    }),
    validator("json", z.object({ visibility: z.enum(["draft", "published"]) })),
    async (c) => {
      const db = getDatabaseConnection();
      const { name, version } = c.req.param();

      try {
        const { visibility } = c.req.valid("json");
        const decodedName = decodeURIComponent(name);
        const decodedVersion = decodeURIComponent(version);

        // Check if server version exists
        const [existing] = await db
          .select({ name: servers.name })
          .from(servers)
          .where(
            and(
              eq(servers.name, decodedName),
              eq(servers.version, decodedVersion)
            )
          )
          .limit(1);

        if (!existing) {
          return c.json(
            {
              error: "Server version not found",
              message: "Server version must exist before setting visibility",
            },
            404
          );
        }

        // Update version visibility
        await db
          .update(servers)
          .set({
            visibility,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(servers.name, decodedName),
              eq(servers.version, decodedVersion)
            )
          );

        return c.json({ success: true, visibility });
      } catch (error) {
        console.error("Error updating version visibility:", error);
        return c.json({ error: "Failed to update version visibility" }, 500);
      }
    }
  );

export default admin;
