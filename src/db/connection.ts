import { drizzle } from "drizzle-orm/d1";
import { env } from "cloudflare:workers";

export const getDatabaseConnection = () => drizzle(env.REGISTRY_DB);
