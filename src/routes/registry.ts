import { Hono } from "hono";
import { eq, asc, and, SQL, or, gt, desc, isNull, sql } from "drizzle-orm";
import {
  servers,
  packageMetadata,
  type Server,
  type PackageMetadata,
} from "../db/schema";
import { getDatabaseConnection } from "../db/connection";
import z from "zod";
import { validator, resolver, describeRoute } from "hono-openapi";
import {
  OfficialRegistryServerResponseSchema,
  OfficialRegistryServersListResponseSchema,
} from "~/types/registry";

const registry = new Hono<{ Bindings: Env }>();

/**
 * GET /servers - List all servers (paginated)
 * MCP Registry Spec-Compliant Endpoint
 * Returns ALL versions of all servers
 * Cursor format: name:version (e.g., "com.example/my-server:1.0.0")
 */

registry.get(
  "/servers",
  describeRoute({
    tags: ["Registry"],
    summary: "List all servers",
    description:
      "List all server versions with pagination. Supports filtering by visibility and status.",
    responses: {
      200: {
        description: "Successfully retrieved all servers",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                ...OfficialRegistryServersListResponseSchema.shape,
                servers: z.array(OfficialRegistryServerResponseSchema),
              })
            ),
          },
        },
      },
      500: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: resolver(z.object({ error: z.string() })),
          },
        },
      },
    },
  }),
  validator(
    "query",
    z.object({
      limit: z.coerce.number().min(1).max(100).default(10),
      cursor: z.string().optional(),
      visibility: z.enum(["draft", "published"]).optional(),
      status: z.enum(["active", "deleted", "deprecated"]).optional(),
    })
  ),
  async (c) => {
    const db = getDatabaseConnection();
    const { limit, cursor, visibility, status } = c.req.valid("query");

    try {
      let limitNum = limit;

      // Build WHERE conditions
      const conditions: (SQL | undefined)[] = [];

      // Apply visibility filter if specified
      if (visibility === "draft" || visibility === "published") {
        // Filter by both package and version visibility
        // If packageMetadata doesn't exist (null), treat as "draft"
        conditions.push(
          and(
            or(
              eq(packageMetadata.visibility, visibility),
              visibility === "draft"
                ? isNull(packageMetadata.visibility)
                : undefined
            ),
            eq(servers.visibility, visibility)
          )
        );
      }

      // Apply status filter if specified
      if (
        status === "active" ||
        status === "deprecated" ||
        status === "deleted"
      ) {
        conditions.push(eq(servers.status, status));
      }

      // Apply cursor (pagination by name:version)
      if (cursor) {
        const decodedCursor = decodeURIComponent(cursor);
        const [cursorName, cursorVersion] = decodedCursor.split(":");

        // Pagination: (name > cursorName) OR (name = cursorName AND version > cursorVersion)
        conditions.push(
          or(
            gt(servers.name, cursorName),
            and(
              eq(servers.name, cursorName),
              gt(servers.version, cursorVersion)
            )
          )
        );
      }

      // Build query with JOIN to get package metadata
      const results = await db
        .select()
        .from(servers)
        .leftJoin(packageMetadata, eq(servers.name, packageMetadata.name))
        .where(and(...conditions))
        .orderBy(asc(servers.name), asc(servers.version))
        .limit(limitNum + 1); // Fetch one extra to determine if there's a next page

      // Check if there are more results
      const hasMore = results.length > limitNum;
      const rowsToReturn = hasMore ? results.slice(0, limitNum) : results;

      // Build cursor as name:version
      const nextCursor = hasMore
        ? `${rowsToReturn[rowsToReturn.length - 1].servers.name}:${
            rowsToReturn[rowsToReturn.length - 1].servers.version
          }`
        : null;

      return c.json({
        servers: rowsToReturn.map((row) =>
          toServerJson(row.servers, row.package_metadata)
        ),
        metadata: {
          count: rowsToReturn.length,
          nextCursor,
        },
      });
    } catch (error) {
      console.error("Error fetching servers:", error);
      return c.json({ error: "Failed to fetch servers" }, 500);
    }
  }
);

/**
 * GET /servers/:name - Get latest version of server by name
 * MCP Registry Spec-Compliant Endpoint
 */
registry.get(
  "/servers/:name",
  describeRoute({
    tags: ["Registry"],
    summary: "Get latest server version",
    description: "Get the latest version of a server by name",
    responses: {
      200: {
        description: "Successfully retrieved the latest version of a server",
        content: {
          "application/json": {
            schema: resolver(OfficialRegistryServerResponseSchema),
          },
        },
      },
      404: {
        description: "Server not found",
        content: {
          "application/json": {
            schema: resolver(z.object({ error: z.string() })),
          },
        },
      },
      500: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: resolver(z.object({ error: z.string() })),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDatabaseConnection();
    const { name } = c.req.param();

    try {
      const results = await db
        .select()
        .from(servers)
        .leftJoin(packageMetadata, eq(servers.name, packageMetadata.name))
        // .where(
        //   sql`${servers.name} = ${decodeURIComponent(name)} AND ${
        //     servers.isLatest
        //   } = 1`
        // )
        .where(
          and(
            eq(servers.name, decodeURIComponent(name)),
            eq(servers.isLatest, true)
          )
        )
        .limit(1);

      if (results.length === 0) {
        return c.json({ error: "Server not found" }, 404);
      }

      const row = results[0];

      return c.json(toServerJson(row.servers, row.package_metadata));
    } catch (error) {
      console.error("Error fetching server:", error);
      return c.json({ error: "Failed to fetch server" }, 500);
    }
  }
);

/**
 * GET /servers/:name/versions - List all versions of a server
 * MCP Registry Spec-Compliant Endpoint
 * Ordered by publication date (newest first)
 */

registry.get(
  "/servers/:name/versions",
  describeRoute({
    tags: ["Registry"],
    summary: "List server versions",
    description:
      "List all versions of a specific server. Supports filtering by visibility and status.",
    responses: {
      200: {
        description: "Successfully retrieved all server versions",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                ...OfficialRegistryServersListResponseSchema.shape,
                servers: z.array(OfficialRegistryServerResponseSchema),
              })
            ),
          },
        },
      },
      404: {
        description: "Server not found",
        content: {
          "application/json": {
            schema: resolver(z.object({ error: z.string() })),
          },
        },
      },
      500: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: resolver(z.object({ error: z.string() })),
          },
        },
      },
    },
  }),
  validator(
    "query",
    z.object({
      visibility: z.enum(["draft", "published"]).optional(),
      status: z.enum(["active", "deleted", "deprecated"]).optional(),
    })
  ),
  async (c) => {
    const db = getDatabaseConnection();
    const { name } = c.req.param();
    const { visibility, status } = c.req.valid("query");

    try {
      // Build WHERE conditions
      const conditions: (SQL | undefined)[] = [
        eq(servers.name, decodeURIComponent(name)),
      ];

      // Apply visibility filter if specified
      if (visibility === "draft" || visibility === "published") {
        // Filter by both package and version visibility
        // If packageMetadata doesn't exist (null), treat as "draft"
        conditions.push(
          and(
            or(
              eq(packageMetadata.visibility, visibility),
              visibility === "draft"
                ? isNull(packageMetadata.visibility)
                : undefined
            ),
            eq(servers.visibility, visibility)
          )
        );
      }

      // Apply status filter if specified
      if (
        status === "active" ||
        status === "deprecated" ||
        status === "deleted"
      ) {
        conditions.push(eq(servers.status, status));
      }

      const results = await db
        .select()
        .from(servers)
        .leftJoin(packageMetadata, eq(servers.name, packageMetadata.name))
        .where(and(...conditions))
        .orderBy(desc(servers.publishedAt));

      if (results.length === 0) {
        return c.json({ error: "Server not found" }, 404);
      }

      return c.json({
        servers: results.map((row) =>
          toServerJson(row.servers, row.package_metadata)
        ),
        metadata: {
          count: results.length,
          nextCursor: null,
        },
      });
    } catch (error) {
      console.error("Error fetching server versions:", error);
      return c.json({ error: "Failed to fetch server versions" }, 500);
    }
  }
);

/**
 * GET /servers/:name/versions/:version - Get specific version of server
 * MCP Registry Spec-Compliant Endpoint
 */
registry.get(
  "/servers/:name/versions/:version",
  describeRoute({
    tags: ["Registry"],
    summary: "Get specific server version",
    description: "Get a specific version of a server by name and version",
    responses: {
      200: {
        description: "Successfully retrieved a version of a server",
        content: {
          "application/json": {
            schema: resolver(OfficialRegistryServerResponseSchema),
          },
        },
      },
      404: {
        description: "Server not found",
        content: {
          "application/json": {
            schema: resolver(z.object({ error: z.string() })),
          },
        },
      },
      500: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: resolver(z.object({ error: z.string() })),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDatabaseConnection();
    const { name, version } = c.req.param();

    try {
      const results = await db
        .select()
        .from(servers)
        .leftJoin(packageMetadata, eq(servers.name, packageMetadata.name))
        // .where(
        //   sql`${servers.name} = ${decodeURIComponent(name)} AND ${
        //     servers.version
        //   } = ${decodeURIComponent(version)}`
        // )
        .where(
          and(
            eq(servers.name, decodeURIComponent(name)),
            eq(servers.version, decodeURIComponent(version))
          )
        )
        .limit(1);

      if (results.length === 0) {
        return c.json({ error: "Server not found" }, 404);
      }

      const row = results[0];
      return c.json(toServerJson(row.servers, row.package_metadata));
    } catch (error) {
      console.error("Error fetching server version:", error);
      return c.json({ error: "Failed to fetch server version" }, 500);
    }
  }
);

/**
 * Helper: Transform DB row to MCP Registry API response format
 * Spec-compliant wrapper format with DOUBLE _meta structure:
 * - server._meta: Publisher-provided metadata (from publisherMeta column)
 * - wrapper _meta: Registry-managed metadata (from parentRegistryMeta + packageMetadata + versionRegistryMeta)
 */
function toServerJson(server: Server, pkgMeta: PackageMetadata | null) {
  return {
    server: {
      name: server.name,
      description: server.description,
      version: server.version,
      repository: server.repository || undefined,
      websiteUrl: server.websiteUrl || undefined,
      packages: server.packages || undefined,
      remotes: server.remotes || undefined,

      // Publisher-provided metadata (inside server object per spec)
      _meta: server.publisherMeta,
    },

    // Registry-managed metadata (at wrapper level per spec)
    _meta: {
      // Parent registry metadata (official MCP)
      ...server.parentRegistryMeta,
      // Package-level enrichments (from packageMetadata table)
      ...pkgMeta?.registryMeta,
      // Version-specific enrichments (from servers table)
      ...server.versionRegistryMeta,
    },
  };
}

export default registry;
