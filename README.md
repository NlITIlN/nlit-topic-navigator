# Nlit Topic Navigator
Source-only snapshot of Topic Navigator 1.8.1. Includes a web UI, MCP server, database schema and migrations, and test scripts. No production binding, credentials, or user data are supplied. The local development build requires Node.js 22.13+ and a local Cloudflare D1 binding named DB. Install the locked dependencies, then use npm run dev. Build and runtime compatibility of this snapshot have not been verified. This repository alone does not install the app into ChatGPT.

## Deployment boundary

This snapshot is for source review and local development only. Do not expose its development server to the internet or deploy it as a standalone authenticated service. The original application depends on a trusted identity gateway; local mock identity is not a public authentication mechanism. Configure and review a production authentication boundary before any standalone deployment. Do not connect this development copy to production data.
