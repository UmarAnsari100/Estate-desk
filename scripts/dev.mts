import { config } from "dotenv";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";
import { createServer } from "vite";

config({ path: resolve(".env"), quiet: true });
if (process.env.NODE_ENV === "production")
  throw new Error(
    "npm run dev is for local development. Use the production setup in README.",
  );
async function freePort(start: number) {
  for (let port = start; port < start + 100; port++) {
    if (
      await new Promise<boolean>((done) => {
        const server = net.createServer();
        server.once("error", () => done(false));
        server.listen(port, "127.0.0.1", () => server.close(() => done(true)));
      })
    )
      return port;
  }
  throw new Error("No free local port found");
}
async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
const localDir = resolve(process.env.ESTATE_DEV_DATA_DIR || ".local-data");
await mkdir(localDir, { recursive: true });
const credentialsFile = resolve(localDir, "development.json");
let credentials: { databasePassword: string; jwtSecret: string };
if (await exists(credentialsFile))
  credentials = JSON.parse(await readFile(credentialsFile, "utf8"));
else {
  credentials = {
    databasePassword: randomBytes(32).toString("hex"),
    jwtSecret: randomBytes(48).toString("hex"),
  };
  await writeFile(credentialsFile, JSON.stringify(credentials), {
    mode: 0o600,
    flag: "wx",
  });
}
process.env.NODE_ENV = "development";
process.env.JWT_SECRET =
  process.env.JWT_SECRET && !process.env.JWT_SECRET.startsWith("replace-")
    ? process.env.JWT_SECRET
    : credentials.jwtSecret;
process.env.MOCK_MODE = process.env.MOCK_MODE || "true";
const webPort = await freePort(5173);
const apiPort = await freePort(Number(process.env.PORT) || 3001);
process.env.PORT = String(apiPort);
process.env.CLIENT_URL = `http://localhost:${webPort}`;
process.env.DEV_API_URL = `http://127.0.0.1:${apiPort}`;
let postgres: EmbeddedPostgres | undefined;
if (!process.env.DATABASE_URL?.trim()) {
  const port = await freePort(55432);
  const databaseDir = resolve(localDir, "postgres");
  postgres = new EmbeddedPostgres({
    databaseDir,
    user: "estate_local",
    password: credentials.databasePassword,
    port,
    persistent: true,
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  const firstRun = !(await exists(resolve(databaseDir, "PG_VERSION")));
  if (firstRun) {
    console.log("Preparing your local PostgreSQL database…");
    await postgres.initialise();
  }
  try {
    await postgres.start();
  } catch {
    throw new Error(
      "Could not start the local database. Stop any other npm run dev process for this workspace, then try again. Your saved data has not been reset.",
    );
  }
  if (firstRun) await postgres.createDatabase("estate");
  process.env.DATABASE_URL = `postgresql://estate_local:${credentials.databasePassword}@127.0.0.1:${port}/estate`;
  console.log("Using persistent development data in .local-data/postgres");
} else
  console.log("Using the PostgreSQL database configured in your environment.");
async function prisma(...args: string[]) {
  await new Promise<void>((done, reject) => {
    const child = spawn(
      process.execPath,
      [resolve("node_modules/prisma/build/index.js"), ...args],
      { stdio: "inherit", env: process.env, windowsHide: true },
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? done()
        : reject(
            new Error(
              `Prisma ${args[0]} failed. Check the database settings shown above.`,
            ),
          ),
    );
  });
}
await writeFile(
  resolve(localDir, "connection.json"),
  JSON.stringify({ databaseUrl: process.env.DATABASE_URL }),
  { mode: 0o600 },
);
try {
  const schema = await readFile("prisma/schema.prisma", "utf8");
  const generated = await readFile(
    "node_modules/.prisma/client/schema.prisma",
    "utf8",
  ).catch(() => "");
  if (schema.replace(/\s/g, "") !== generated.replace(/\s/g, ""))
    await prisma("generate");
  await prisma("migrate", "deploy");
  const { setShutdownHook } = await import("../server/src/index.js");
  const vite = await createServer({
    configFile: resolve("client/vite.config.ts"),
    root: resolve("client"),
    server: { host: "127.0.0.1", port: webPort, strictPort: true },
  });
  await vite.listen();
  setShutdownHook(async () => {
    await vite.close();
    if (postgres) await postgres.stop();
  });
  console.log(
    `\nEstate Desk is ready: http://localhost:${webPort}\nFirst visit: create your administrator account in the browser.\nExisting workspace: sign in with the email and password you chose.\n`,
  );
  process.on("message", (message) => {
    if (message === "shutdown") process.emit("SIGINT");
  });
} catch (error) {
  if (postgres) await postgres.stop();
  throw error;
}
