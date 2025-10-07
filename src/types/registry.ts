import { unknown, z } from "zod";

// MCP Registry Server Schema (official spec-compliant)
// Spec reference: https://github.com/modelcontextprotocol/registry
// Schema version: 2025-09-29 (latest)
// Uses camelCase field names (not snake_case from older versions)

export const PackageArgumentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("positional"),
    value: z.string().optional(),
    valueHint: z.string().optional(),
    description: z.string().optional(),
    default: z.string().optional(),
    isRequired: z.boolean().optional(),
    isRepeated: z.boolean().optional(),
    format: z.enum(["string", "number", "boolean", "filepath"]).optional(),
    choices: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("named"),
    name: z.string(),
    value: z.string().optional(),
    description: z.string().optional(),
    default: z.string().optional(),
    isRequired: z.boolean().optional(),
    isRepeated: z.boolean().optional(),
    format: z.enum(["string", "number", "boolean", "filepath"]).optional(),
    choices: z.array(z.string()).optional(),
    variables: z
      .record(
        z.string(),
        z.object({
          description: z.string().optional(),
          isRequired: z.boolean().optional(),
          format: z
            .enum(["string", "number", "boolean", "filepath"])
            .optional(),
          choices: z.array(z.string()).optional(),
          default: z.string().optional(),
        })
      )
      .optional(),
  }),
]);

export const EnvironmentVariableSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  isRequired: z.boolean().optional(),
  isSecret: z.boolean().optional(),
  default: z.string().optional(),
  format: z.enum(["string", "number", "boolean", "filepath"]).optional(),
  choices: z.array(z.string()).optional(),
});

export const HeaderSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  isRequired: z.boolean().optional(),
  isSecret: z.boolean().optional(),
  default: z.string().optional(),
  choices: z.array(z.string()).optional(),
});

export const PackageSchema = z.object({
  registryType: z.enum(["npm", "pypi", "oci", "deno", "nuget", "mcpb"]),
  registryBaseUrl: z.url().optional(),
  identifier: z.string(),
  version: z.string(),
  runtimeHint: z.string().optional(),
  transport: z.object({
    type: z.enum(["stdio", "sse", "streamable-http"]),
  }),
  environmentVariables: z.array(EnvironmentVariableSchema).optional(),
  runtimeArguments: z.array(PackageArgumentSchema).optional(),
  packageArguments: z.array(PackageArgumentSchema).optional(),
  fileSha256: z.string().optional(), // For MCPB packages
});

// Official spec only supports 'sse' and 'streamable-http' for remotes (no 'app')
export const RemoteSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("sse"),
    url: z.url(),
    headers: z.array(HeaderSchema).optional(),
  }),
  z.object({
    type: z.literal("streamable-http"),
    url: z.url(),
    headers: z.array(HeaderSchema).optional(),
  }),
]);

export const RepositorySchema = z.object({
  url: z.string(),
  source: z.string(),
  id: z.string().optional(),
  subfolder: z.string().optional(),
});

// Main server schema (matches official spec exactly)
export const RegistryServerSchema = z.object({
  $schema: z.url().optional(),
  name: z
    .string()
    .min(3)
    .max(200)
    .regex(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/), // Official spec requires pattern
  description: z.string().min(1).max(100), // Official spec: maxLength 100
  version: z.string().max(255),
  status: z.enum(["active", "deprecated", "deleted"]).optional(), // Not in official schema, but needed for API
  repository: RepositorySchema.optional(),
  websiteUrl: z.url().optional(),
  packages: z.array(PackageSchema).optional(),
  remotes: z.array(RemoteSchema).optional(),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

export const OfficialRegistryServerResponseSchema = z.object({
  server: RegistryServerSchema,
  _meta: z.looseObject({
    "io.modelcontextprotocol.registry/official": z.object({
      status: z.enum(["active", "deprecated", "deleted"]),
      publishedAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
      isLatest: z.boolean(),
    }),
  }),
});

export const OfficialRegistryServersListResponseSchema = z.object({
  // servers: z.array(OfficialRegistryServerResponseSchema),
  servers: z.array(z.unknown()),
  metadata: z
    .object({
      nextCursor: z.string().nullish(),
      count: z.int().optional(),
    })
    .optional(),
});

export type RegistryServer = z.infer<typeof RegistryServerSchema>;
export type Package = z.infer<typeof PackageSchema>;
export type Remote = z.infer<typeof RemoteSchema>;
export type Repository = z.infer<typeof RepositorySchema>;
export type EnvironmentVariable = z.infer<typeof EnvironmentVariableSchema>;
export type PackageArgument = z.infer<typeof PackageArgumentSchema>;
export type Header = z.infer<typeof HeaderSchema>;

export type OfficialRegistryServerResponse = z.infer<
  typeof OfficialRegistryServerResponseSchema
>;

// Sync log entry
export interface SyncLogEntry {
  id: number;
  source: string;
  status: "success" | "failure";
  serversAdded: number;
  serversUpdated: number;
  serversRemoved: number;
  errorMessage: string | null;
  syncedAt: Date;
}
