# 🚀 MCP Subregistry

Self-hostable MCP registry / subregistry synced with the official [MCP Registry](https://github.com/modelcontextprotocol/registry) or any registry.

Built on Cloudflare Workers for edge performance, with Drizzle ORM and D1 for SQLite persistence.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)](https://workers.cloudflare.com/)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Toolbase-AI/mcp-subregistry)

## ✨ Features

- 🌍 **Spec-Compliant**: 100% implements the official MCP Registry API (OpenAPI 2025-09-29)
- ⚡ **Edge Performance**: Deployed on Cloudflare Workers for <50ms response times globally
- 🔄 **Auto-Sync**: Automatically syncs from the official MCP registry daily
- 🎨 **Extensible Metadata**: Add custom fields using reverse-DNS namespacing
- 🔒 **Self-Hostable**: Deploy your own private registry in minutes
- 🗄️ **SQLite Database**: Powered by Cloudflare D1 with Drizzle ORM
- 📦 **Version Support**: Track and serve multiple versions of each MCP server

## 🚀 Quick Start

### Prerequisites

- Node.js 22+ and pnpm
- Cloudflare account ([sign up free](https://dash.cloudflare.com/sign-up))
- Wrangler CLI (`npm install -g wrangler`)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-subregistry
cd mcp-subregistry

# Install dependencies
pnpm install

# Environment Setup
cp .env.example .env

# Create D1 database
wrangler d1 create mcp-registry

# Update wrangler.jsonc with the database ID from the previous command
# database_id = "your-database-id-here"

# Generate database migrations
pnpm db:generate

# Run migrations for local SQLite development
pnpm db:migrate:dev

# Run migrations for production
pnpm db:migrate:prod

# Start development server
pnpm dev
```

### Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Toolbase-AI/mcp-subregistry)

or

```bash
# Run migrations in production
pnpm db:migrate:prod

# Deploy to production
pnpm deploy
```

Your API will be available at: `https://mcp-subregistry.{your-subdomain}.workers.dev`

## 🔧 Configuration

### Environment Variables

Optional environment variables can be configured in `.env`:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare Account ID. Only used for connecting to your D1 with drizzle-kit studio. | No | - |
| `CLOUDFLARE_DATABASE_ID` | Your remote Cloudflare D1 database ID. Only used for connecting to your D1 with drizzle-kit studio. | No | - |
| `CLOUDFLARE_D1_TOKEN` | Your Cloudflare access token with D1 edit permissions. Only used for connecting to your D1 with drizzle-kit studio. | No | - |

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│  Official MCP Registry (GitHub)     │
└────────────────┬────────────────────┘
                 │ Daily Sync (Cron)
                 ↓
┌─────────────────────────────────────┐
│  MCP Subregistry API                │
│  (Cloudflare Workers + D1)          │
│                                     │
│  - Hono Framework                   │
│  - Drizzle ORM                      │
│  - SQLite (D1)                      │
└────────────────┬────────────────────┘
                 │ REST API
                 ↓
        ┌────────────────┐
        │  MCP Clients   │
        │  (ChatGPT,     │
        │   Claude, etc) │
        └────────────────┘
```

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Generate Drizzle migrations
pnpm db:generate

# Run migrations locally
pnpm db:migrate:dev

# Run migrations in production
pnpm db:migrate:prod

# Open Drizzle Studio (database GUI)
pnpm db:studio

# Type checking
pnpm typecheck
```


## 🏢 Production Usage

This registry powers [Toolbase](https://gettoolbase.ai), serving 500+ MCP servers to thousands of developers.

### Managed Hosting

Don't want to self-host? Use our managed registry at [Toolbase](https://gettoolbase.ai):
- ✅ Zero setup
- ✅ Automatic scaling
- ✅ Built-in CDN
- ✅ Advanced analytics

[Sign Up Free →](https://gettoolbase.ai)

## 📄 License

MIT © [Toolbase](https://gettoolbase.ai)

## 🔗 Links

- [Official MCP Registry](https://github.com/modelcontextprotocol/registry)
- [MCP Specification](https://modelcontextprotocol.io)
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Hono Framework](https://hono.dev/)

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=yourusername/mcp-registry-api&type=Date)](https://star-history.com/#yourusername/mcp-registry-api&Date)

---

**Built with ❤️ by the [Toolbase](https://gettoolbase.ai) team**
