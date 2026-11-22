declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    CHAT_DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
