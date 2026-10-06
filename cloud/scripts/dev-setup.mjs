// Runs before `npm run dev`: gives the local Worker an admin key if it has none.
// The local database tables are created by the migrations step in package.json.
import { existsSync, writeFileSync } from "node:fs";

const file = new URL("../.dev.vars", import.meta.url);
if (!existsSync(file)) {
  writeFileSync(file, "ADMIN_TOKEN=local-admin-key\n");
  console.log("Created cloud/.dev.vars. The local moderation key is local-admin-key.");
}
