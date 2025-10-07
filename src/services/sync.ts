import { and, desc, eq, sql } from "drizzle-orm";
import { NewServer, servers, syncLog } from "../db/schema";
import {
  OfficialRegistryServerResponse,
  OfficialRegistryServerResponseSchema,
  OfficialRegistryServersListResponseSchema,
} from "../types/registry";
import { getDatabaseConnection } from "~/db/connection";
import z from "zod";

/**
 * Sync servers from the official MCP registry
 * Uses incremental sync with updated_since filter for efficiency
 */
export async function syncFromOfficialRegistry(env: Env): Promise<{
  success: boolean;
  processed: number;
  error?: string;
}> {
  const db = getDatabaseConnection();

  try {
    // Get last successful sync time for incremental updates
    const [lastSync] = await db
      .select()
      .from(syncLog)
      .where(
        and(
          eq(syncLog.source, "official-registry"),
          eq(syncLog.status, "success")
        )
      )
      .orderBy(desc(syncLog.syncedAt))
      .limit(1);

    const updatedSince = lastSync?.syncedAt;

    // Fetch servers from official MCP registry (incremental if possible)
    const officialServers = await fetchOfficialMCPRegistry(updatedSince);

    const transformedServers = officialServers.map((server) =>
      transformToSubregistryFormat(server)
    );

    const serverUpserts = transformedServers.map((transformed) => {
      return db
        .insert(servers)
        .values(transformed)
        .onConflictDoUpdate({
          target: [servers.name, servers.version],
          set: {
            ...transformed,
            // On update, DON'T touch versionRegistryMeta (preserves manual enrichments)
            versionRegistryMeta: sql`${servers.versionRegistryMeta}`,
            // On update, DON'T touch visibility (preserves manual visibility control)
            visibility: sql`${servers.visibility}`,
            updatedAt: new Date(),
          },
        });
    });

    const syncLogInsert = db.insert(syncLog).values({
      source: "official-registry",
      status: "success",
      serversProcessed: serverUpserts.length,
    });

    // Batch with sync log entry
    await db.batch([syncLogInsert, ...serverUpserts]);

    return { success: true, processed: serverUpserts.length };
  } catch (error) {
    console.error("Sync error:", error);

    // Log failed sync
    await db.insert(syncLog).values({
      source: "official-registry",
      status: "failure",
      serversProcessed: 0,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      success: false,
      processed: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Fetch servers from the official MCP registry
 * Uses the official registry API at registry.modelcontextprotocol.io
 * Supports incremental sync with updated_since parameter
 * Returns ALL versions of all servers (cursor format: name:version)
 *
 * @param updatedSince - RFC3339 timestamp to fetch only servers updated after this time
 */
async function fetchOfficialMCPRegistry(updatedSince?: Date) {
  const allServers = [];
  let cursor: string | null = null;

  try {
    // Add incremental sync filter if available
    if (updatedSince) {
      console.log(`Incremental sync from ${updatedSince.toISOString()}`);
    } else {
      console.log("Full sync - no previous sync timestamp found");
    }

    // Fetch all pages using cursor-based pagination
    do {
      const params = new URLSearchParams();

      // Add updated_since filter for incremental sync
      if (updatedSince) {
        params.set("updated_since", updatedSince.toISOString());
      }

      // Add cursor for pagination (format: name:version)
      if (cursor) {
        params.set("cursor", cursor);
      }

      const url = `https://registry.modelcontextprotocol.io/v0/servers?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "MCP-Subregistry-API",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch from official registry: ${response.statusText}`
        );
      }

      const data = await response.json();

      const { servers: rawServers, metadata } =
        OfficialRegistryServersListResponseSchema.parse(data);

      const validServers = [];
      const failedServers = [];

      for (const rawServer of rawServers) {
        const result =
          OfficialRegistryServerResponseSchema.safeParse(rawServer);

        if (result.success) {
          validServers.push(result.data);
        } else {
          // Log the failure for debugging
          const forLoggingSchema = z.object({
            server: z
              .object({
                name: z.string().optional().default("unknown"),
                version: z.string().optional().default("unknown"),
              })
              .optional(),
          });

          const { data } = forLoggingSchema.safeParse(rawServer);

          console.warn(`Failed to parse server:`, {
            name: data?.server?.name || "unknown",
            version: data?.server?.version || "unknown",
            errors: result.error.issues.map((issue) => ({
              msg: issue.message,
              pathVal: issue.path.join(" "),
            })),
          });
          failedServers.push({
            raw: rawServer,
            error: result.error,
          });
        }
      }

      allServers.push(...validServers);

      if (failedServers.length > 0) {
        console.warn(
          `Skipped ${failedServers.length} invalid servers in this page`
        );
      }

      // Get next cursor from metadata (format: name:version)
      cursor = metadata?.nextCursor || null;
    } while (cursor);

    console.log(
      `Fetched ${allServers.length} server versions from official MCP registry`
    );
    return allServers;
  } catch (error) {
    console.error("Error fetching official MCP registry:", error);
    return [];
  }
}

/**
 * Transform official MCP registry format to subregistry format
 * Separates metadata into version-specific and package-level:
 * - publisherMeta: Lives inside server._meta (publisher-provided, version-specific)
 * - parentRegistryMeta: Lives in wrapper _meta (official registry, version-specific)
 * - versionRegistryMeta: Lives in wrapper _meta (version-level enrichments)
 * - packageRegistryMeta: Lives in wrapper _meta (package-level enrichments, stored in separate table)
 */
function transformToSubregistryFormat(
  officialServerResponse: OfficialRegistryServerResponse
): NewServer {
  const officialServer = officialServerResponse.server;
  const officialServerRegistryMeta = officialServerResponse._meta;

  // Extract publishedAt from official registry metadata
  const publishedAt = new Date(
    officialServerRegistryMeta["io.modelcontextprotocol.registry/official"]
      ?.publishedAt || new Date()
  );

  const isLatest =
    officialServerRegistryMeta["io.modelcontextprotocol.registry/official"]
      .isLatest;

  return {
    publishedAt,
    isLatest,
    source: "official-registry",

    name: officialServer.name,
    description: officialServer.description,
    status: officialServer.status || "active",
    version: officialServer.version || "1.0.0", // Spec uses direct 'version' field
    repository: officialServer.repository || null,
    websiteUrl: officialServer.websiteUrl || null,
    packages: officialServer.packages || null,
    remotes: officialServer.remotes || null,

    // Publisher-provided metadata (lives inside server._meta, synced from parent)
    publisherMeta: {
      ...officialServer._meta,
    },

    // Parent registry metadata (wrapper _meta, synced from parent)
    parentRegistryMeta: {
      ...officialServerRegistryMeta,
    },

    // Version-specific enrichments (empty initially, can be enriched via admin API)
    versionRegistryMeta: {},
  };
}
