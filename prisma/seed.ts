import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const db = new PrismaClient();
try {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 14)
    throw new Error(
      "Set SEED_ADMIN_PASSWORD to a unique password of at least 14 characters in your local .env",
    );
  const email = (
    process.env.SEED_ADMIN_EMAIL || "admin@example.com"
  ).toLowerCase();
  await db.admin.upsert({
    where: { email },
    create: {
      email,
      name: "Administrator",
      passwordHash: await bcrypt.hash(password, 12),
    },
    update: {},
  });
  await db.businessSettings.upsert({
    where: { id: "singleton" },
    create: {
      companyName: "Estate Desk",
      description: "Private property advisory workspace",
      officeAddress: "Set your office address",
      businessHours: "Monday–Saturday, 9am–6pm PKT",
    },
    update: {},
  });
  await db.aISettings.upsert({
    where: { id: "singleton" },
    create: {},
    update: {},
  });
  const inventory = [
    [
      "DEMO-001",
      "Contemporary family home",
      "Bahria Town Phase 8",
      "Rawalpindi",
      5,
      18500000,
      3,
      "SALE",
    ],
    [
      "DEMO-002",
      "Spacious park-facing home",
      "Bahria Town Phase 7",
      "Rawalpindi",
      10,
      45000000,
      5,
      "SALE",
    ],
    [
      "DEMO-003",
      "Modern DHA residence",
      "DHA Phase 2",
      "Islamabad",
      10,
      42000000,
      5,
      "SALE",
    ],
    [
      "DEMO-004",
      "Family home with terrace",
      "DHA Phase 6",
      "Lahore",
      5,
      22000000,
      3,
      "SALE",
    ],
    [
      "DEMO-005",
      "Comfortable rental home",
      "Bahria Town",
      "Lahore",
      5,
      85000,
      3,
      "RENT",
    ],
    [
      "DEMO-006",
      "Reserved sample home",
      "Bahria Town Phase 8",
      "Rawalpindi",
      5,
      17500000,
      3,
      "SALE",
    ],
  ] as const;
  for (const [
    propertyCode,
    title,
    location,
    city,
    area,
    price,
    bedrooms,
    purpose,
  ] of inventory)
    await db.property.upsert({
      where: { propertyCode },
      create: {
        propertyCode,
        title: `${title} (demo)`,
        location,
        city,
        area,
        price,
        bedrooms,
        bathrooms: bedrooms,
        purpose,
        propertyType: "HOUSE",
        areaUnit: "MARLA",
        description:
          "Fictional demo inventory for testing. Not an actual listing.",
        amenities: ["Parking", "Terrace"],
        images: [],
        demo: true,
        status: propertyCode === "DEMO-006" ? "SOLD" : "AVAILABLE",
      },
      update: {},
    });
  console.log(
    "Demo inventory and administrator seeded. Existing accounts were not modified.",
  );
} finally {
  await db.$disconnect();
}
