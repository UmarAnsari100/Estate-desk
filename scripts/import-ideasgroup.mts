import { Prisma, PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parseIdeasGroupWebsite } from "./lib/ideasgroup-parser.js";

config({ quiet: true });
const execFileAsync = promisify(execFile);
const sourceRepository = "https://github.com/tayyeb805/ideasgroup-website.git";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const repoArg = args.indexOf("--repo");
const repo = path.resolve(
  repoArg >= 0 ? args[repoArg + 1] : ".source-repos/ideasgroup-filtered",
);
if (repoArg >= 0 && !args[repoArg + 1])
  throw new Error("--repo requires a path");

const html = await readFile(path.join(repo, "public/index.html"), "utf8");
const [{ stdout: revisionOutput }, { stdout: committedAtOutput }] =
  await Promise.all([
    execFileAsync("git", ["-C", repo, "rev-parse", "HEAD"]),
    execFileAsync("git", ["-C", repo, "show", "-s", "--format=%cI", "HEAD"]),
  ]);
const revision = revisionOutput.trim();
const sourceCommittedAt = new Date(committedAtOutput.trim());
const sourceUrl = `https://github.com/tayyeb805/ideasgroup-website/blob/${revision}/public/index.html`;
const { properties, commercialRates } = parseIdeasGroupWebsite(html);
const rawBase = `https://raw.githubusercontent.com/tayyeb805/ideasgroup-website/${revision}/`;
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
};
const report = {
  sourceRepository,
  sourceUrl,
  sourceRevision: revision,
  sourceCommittedAt: sourceCommittedAt.toISOString(),
  extractedAt: new Date().toISOString(),
  apartmentPriceRows: properties.length,
  commercialReferenceRows: commercialRates.length,
  warnings: [
    "The website does not publish individual unit availability; apartment rows require administrator review and remain inactive.",
    "Commercial figures are rates per square foot, not total unit prices, so they are retained as references and are not imported as properties.",
    "Payment terms are source facts, but availability, discounts and final quotes must be confirmed by an authorized agent.",
  ],
  commercialRates,
  properties: properties.map(({ imagePath, ...property }) => ({
    ...property,
    imageUrl: rawBase + imagePath,
  })),
};
await mkdir("docs", { recursive: true });
await writeFile(
  "docs/ideasgroup-import-report.json",
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(`Source revision: ${revision}`);
console.log(
  `Extracted ${properties.length} apartment price rows and ${commercialRates.length} commercial reference rates.`,
);
console.table(
  properties.map((p) => ({
    code: p.propertyCode,
    title: p.title,
    area: p.area,
    price: p.price,
  })),
);

if (!apply) {
  console.log(
    "Dry run only. Review docs/ideasgroup-import-report.json, then run with --apply to write inactive records.",
  );
  process.exit(0);
}

const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  JSON.parse(
    await readFile(".local-data/connection.json", "utf8").catch(() => {
      throw new Error(
        "Start npm run dev first, then run this command in another terminal.",
      );
    }),
  ).databaseUrl;
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
let created = 0;
let updated = 0;
let unchanged = 0;
let stale = 0;
try {
  for (const property of properties) {
    const existing = await db.property.findUnique({
      where: { propertyCode: property.propertyCode },
    });
    const pricingDetails =
      property.pricingDetails as unknown as Prisma.InputJsonValue;
    const sourced = {
      title: property.title,
      purpose: property.purpose,
      propertyType: property.propertyType,
      location: property.location,
      city: property.city,
      area: property.area,
      areaUnit: property.areaUnit,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      price: property.price,
      currency: property.currency,
      description: property.description,
      amenities: property.amenities,
      images: [rawBase + property.imagePath],
      sourceUrl,
      sourceRepository,
      sourceRevision: revision,
      sourceReference: property.sourceReference,
      sourceUpdatedAt: sourceCommittedAt,
      pricingDetails,
    };
    if (!existing) {
      await db.property.create({
        data: {
          propertyCode: property.propertyCode,
          ...sourced,
          status: "INACTIVE",
          featured: false,
          demo: false,
          requiresReview: true,
        },
      });
      created++;
      continue;
    }
    if (existing.sourceRepository !== sourceRepository) {
      throw new Error(
        `Refusing to overwrite ${property.propertyCode}: that code belongs to a manually entered or different source record.`,
      );
    }
    const changed =
      existing.title !== property.title ||
      Number(existing.area) !== property.area ||
      Number(existing.price) !== property.price ||
      existing.bedrooms !== property.bedrooms ||
      stableJson(existing.pricingDetails) !==
        stableJson(property.pricingDetails);
    await db.property.update({
      where: { id: existing.id },
      data: {
        ...sourced,
        ...(changed
          ? { status: "INACTIVE" as const, requiresReview: true }
          : {}),
      },
    });
    if (changed) updated++;
    else unchanged++;
  }
  const codes = properties.map((p) => p.propertyCode);
  const staleResult = await db.property.updateMany({
    where: { sourceRepository, propertyCode: { notIn: codes } },
    data: { status: "INACTIVE", requiresReview: true },
  });
  stale = staleResult.count;
  console.log(
    `Import complete: ${created} created, ${updated} changed, ${unchanged} refreshed, ${stale} stale deactivated.`,
  );
  console.log(
    "All newly created or changed rows are INACTIVE and marked Review required.",
  );
} finally {
  await db.$disconnect();
}
