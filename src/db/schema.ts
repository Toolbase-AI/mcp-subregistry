import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import type { Package, Remote, Repository } from "../types/registry";

export const servers = sqliteTable(
  "servers",
  {
    // Core MCP registry fields (composite key for versioning)
    name: text("name").notNull(),
    version: text("version").notNull(),
    description: text("description").notNull(),
    status: text("status")
      .$type<"active" | "deprecated" | "deleted">()
      .notNull()
      .default("active"), // active | deprecated | deleted
    isLatest: integer("is_latest", { mode: "boolean" })
      .notNull()
      .default(false),

    // Repository info (JSON) - spec-compliant types
    repository: text("repository", { mode: "json" }).$type<Repository | null>(),

    // Website URL
    websiteUrl: text("website_url"),

    // Packages array (JSON) - spec-compliant types
    packages: text("packages", { mode: "json" }).$type<Package[] | null>(),

    // Remotes array (JSON) - spec-compliant types
    remotes: text("remotes", { mode: "json" }).$type<Remote[] | null>(),

    // Publisher-provided metadata (JSON) - Lives inside server._meta per MCP spec
    // Synced from parent registry, overwritten on sync
    // Contains: 'io.modelcontextprotocol.registry/publisher-provided'
    publisherMeta: text("publisher_meta", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    // Parent registry metadata (JSON) - Lives in wrapper _meta per MCP spec
    // Synced from upstream registry (io.modelcontextprotocol.registry/official)
    // Overwritten on each sync from parent
    // Contains: 'io.modelcontextprotocol.registry/official'
    parentRegistryMeta: text("parent_registry_meta", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    // Version-specific metadata (JSON) - Lives in wrapper _meta per MCP spec
    // Version-level enrichments (deprecation, migration guides, version tags, etc.)
    // Never touched by sync - preserves custom additions
    versionRegistryMeta: text("version_registry_meta", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    // Visibility control for this specific version
    // "draft" - Synced but not yet reviewed/approved
    // "published" - Reviewed and approved by admin
    visibility: text("visibility")
      .$type<"draft" | "published">()
      .notNull()
      .default("draft"),

    // Timestamps
    // When this version was published in the official registry
    publishedAt: integer("published_at", { mode: "timestamp" }).notNull(),

    // Registry metadata
    source: text("source").notNull().default("official-registry"), // 'official-registry'

    // Internal tracking
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.name, table.version] }),
    index("status_idx").on(table.status),
    index("source_idx").on(table.source),
    index("latest_idx").on(table.name, table.isLatest),
    index("name_idx").on(table.name),
    index("published_idx").on(table.name, table.publishedAt),
    index("visibility_idx").on(table.visibility),
  ]
);

export const packageMetadata = sqliteTable(
  "package_metadata",
  {
    // Package name (reverse-DNS format, e.g., 'com.example/server')
    name: text("name").primaryKey(),

    // Package-level metadata (JSON) - Lives in wrapper _meta per MCP spec
    // Package-level enrichments (icons, categories, display_name, homepage, etc.)
    // Shared across all versions of this package
    // Never touched by sync - preserves custom additions
    registryMeta: text("registry_meta", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    // Visibility control for package (affects all versions)
    // "draft" - Synced but not yet reviewed/approved
    // "published" - Reviewed and approved by admin
    visibility: text("visibility")
      .$type<"draft" | "published">()
      .notNull()
      .default("draft"),

    // Internal tracking
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("pkg_meta_name_idx").on(table.name),
    index("pkg_meta_visibility_idx").on(table.visibility),
  ]
);

export const syncLog = sqliteTable("sync_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").$type<"official-registry">().notNull(), // 'official-registry'
  status: text("status").$type<"success" | "failure">().notNull(), // 'success' | 'failure'
  serversProcessed: integer("servers_added").notNull().default(0),
  errorMessage: text("error_message"),
  syncedAt: integer("synced_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Server = typeof servers.$inferSelect;
export type NewServer = typeof servers.$inferInsert;
export type PackageMetadata = typeof packageMetadata.$inferSelect;
export type NewPackageMetadata = typeof packageMetadata.$inferInsert;
export type SyncLog = typeof syncLog.$inferSelect;
export type NewSyncLog = typeof syncLog.$inferInsert;
