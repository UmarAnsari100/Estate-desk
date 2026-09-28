import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
config({ quiet: true });
const url =
  process.env.DATABASE_URL?.trim() ||
  JSON.parse(
    await readFile(".local-data/connection.json", "utf8").catch(() => {
      throw new Error(
        "Start npm run dev first, then run this command in another terminal.",
      );
    }),
  ).databaseUrl;
const db = new PrismaClient({ datasources: { db: { url } } });
let hide = false;
const output = new Writable({
  write(chunk, _encoding, done) {
    if (!hide) process.stdout.write(chunk);
    done();
  },
});
const terminal = createInterface({
  input: process.stdin,
  output,
  terminal: true,
});
try {
  const admins = await db.admin.findMany({ select: { email: true } });
  if (!admins.length) {
    console.log(
      "No administrator exists. Open the app and create your account.",
    );
  } else {
    console.log(
      "Existing administrator accounts:",
      admins.map((a) => a.email).join(", "),
    );
    const email = (await terminal.question("Account email: "))
      .trim()
      .toLowerCase();
    if (!admins.some((a) => a.email === email))
      throw new Error("No account with that email. Nothing was changed.");
    process.stdout.write("New password (at least 14 characters; hidden): ");
    hide = true;
    const password = await terminal.question("");
    hide = false;
    process.stdout.write("\n");
    process.stdout.write("Confirm password (hidden): ");
    hide = true;
    const confirm = await terminal.question("");
    hide = false;
    process.stdout.write("\n");
    if (password !== confirm || password.length < 14 || password.length > 72)
      throw new Error(
        "Passwords must match and contain 14–72 characters. Nothing was changed.",
      );
    await db.admin.update({
      where: { email },
      data: { passwordHash: await bcrypt.hash(password, 12) },
    });
    console.log(
      "Password updated. Sign in with this email and your new password.",
    );
  }
} finally {
  terminal.close();
  await db.$disconnect();
}
