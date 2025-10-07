import { Hono } from "hono";
import { eq, desc, and } from "drizzle-orm";
import { servers, syncLog, packageMetadata } from "../db/schema";
import { getDatabaseConnection } from "~/db/connection";

const admin = new Hono<{ Bindings: Env }>();

/**
 * GET /sync/status - Get sync logs
 * Returns recent sync operations and their results
 */
admin.get("/sync/status", async (c) => {
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
});

/**
 * GET /servers/:name/metadata - Get server metadata
 * Returns server-level metadata shared across all versions
 */
admin.get("/servers/:name/metadata", async (c) => {
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
});

/**
 * PUT /servers/:name/metadata - Add or update server metadata
 * Accepts generic JSON metadata for server-level enrichments (replaces entire metadata)
 */
admin.put("/servers/:name/metadata", async (c) => {
  const db = getDatabaseConnection();
  const { name } = c.req.param();

  try {
    const metadata = await c.req.json();
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
});

/**
 * PATCH /servers/:name/metadata - Partially update server metadata
 * Merges provided JSON with existing metadata
 */
admin.patch("/servers/:name/metadata", async (c) => {
  const db = getDatabaseConnection();
  const { name } = c.req.param();

  try {
    const partialMetadata = await c.req.json();
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
});

/**
 * DELETE /servers/:name/metadata - Delete server metadata
 * Removes the entire server metadata entry
 */
admin.delete("/servers/:name/metadata", async (c) => {
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
});

/**
 * PATCH /servers/:name/visibility - Set visibility for package (all versions)
 * Controls whether a package and its versions are published
 */
admin.patch("/servers/:name/visibility", async (c) => {
  const db = getDatabaseConnection();
  const { name } = c.req.param();

  try {
    const { visibility } = await c.req.json<{ visibility: string }>();
    const decodedName = decodeURIComponent(name);

    // Validate visibility value
    if (visibility !== "draft" && visibility !== "published") {
      return c.json(
        { error: "Invalid visibility value. Must be 'draft' or 'published'" },
        400
      );
    }

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
});

/**
 * GET /servers/:name/versions/:version/metadata - Get version-specific metadata
 * Returns metadata for a specific server version
 */
admin.get("/servers/:name/versions/:version/metadata", async (c) => {
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
});

/**
 * PUT /servers/:name/versions/:version/metadata - Add or update version-specific metadata
 * Accepts generic JSON metadata for version-level enrichments (replaces entire metadata)
 * Note: Server version must exist in the servers table first
 */
admin.put("/servers/:name/versions/:version/metadata", async (c) => {
  const db = getDatabaseConnection();
  const { name, version } = c.req.param();

  try {
    const metadata = await c.req.json();
    const decodedName = decodeURIComponent(name);
    const decodedVersion = decodeURIComponent(version);

    // Check if server version exists
    const [existing] = await db
      .select({
        name: servers.name,
      })
      .from(servers)
      .where(
        and(eq(servers.name, decodedName), eq(servers.version, decodedVersion))
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
        and(eq(servers.name, decodedName), eq(servers.version, decodedVersion))
      );

    return c.json({ success: true });
  } catch (error) {
    console.error("Error updating version metadata:", error);
    return c.json({ error: "Failed to update version metadata" }, 500);
  }
});

/**
 * PATCH /servers/:name/versions/:version/metadata - Partially update version-specific metadata
 * Merges provided JSON with existing metadata
 * Note: Server version must exist in the servers table first
 */
admin.patch("/servers/:name/versions/:version/metadata", async (c) => {
  const db = getDatabaseConnection();
  const { name, version } = c.req.param();

  try {
    const partialMetadata = await c.req.json();
    const decodedName = decodeURIComponent(name);
    const decodedVersion = decodeURIComponent(version);

    // Check if server version exists
    const [existing] = await db
      .select({
        versionRegistryMeta: servers.versionRegistryMeta,
      })
      .from(servers)
      .where(
        and(eq(servers.name, decodedName), eq(servers.version, decodedVersion))
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
        and(eq(servers.name, decodedName), eq(servers.version, decodedVersion))
      );

    return c.json({ success: true });
  } catch (error) {
    console.error("Error patching version metadata:", error);
    return c.json({ error: "Failed to patch version metadata" }, 500);
  }
});

/**
 * DELETE /servers/:name/versions/:version/metadata - Delete version-specific metadata
 * Resets metadata to empty object
 */
admin.delete("/servers/:name/versions/:version/metadata", async (c) => {
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
        and(eq(servers.name, decodedName), eq(servers.version, decodedVersion))
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
        and(eq(servers.name, decodedName), eq(servers.version, decodedVersion))
      );

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting version metadata:", error);
    return c.json({ error: "Failed to delete version metadata" }, 500);
  }
});

/**
 * PATCH /servers/:name/versions/:version/visibility - Set visibility for specific version
 * Controls whether a specific server version is published
 */
admin.patch("/servers/:name/versions/:version/visibility", async (c) => {
  const db = getDatabaseConnection();
  const { name, version } = c.req.param();

  try {
    const { visibility } = await c.req.json<{ visibility: string }>();
    const decodedName = decodeURIComponent(name);
    const decodedVersion = decodeURIComponent(version);

    // Validate visibility value
    if (visibility !== "draft" && visibility !== "published") {
      return c.json(
        { error: "Invalid visibility value. Must be 'draft' or 'published'" },
        400
      );
    }

    // Check if server version exists
    const [existing] = await db
      .select({ name: servers.name })
      .from(servers)
      .where(
        and(eq(servers.name, decodedName), eq(servers.version, decodedVersion))
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
        and(eq(servers.name, decodedName), eq(servers.version, decodedVersion))
      );

    return c.json({ success: true, visibility });
  } catch (error) {
    console.error("Error updating version visibility:", error);
    return c.json({ error: "Failed to update version visibility" }, 500);
  }
});

export default admin;
