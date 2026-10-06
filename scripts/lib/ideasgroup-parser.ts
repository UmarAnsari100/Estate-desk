import * as cheerio from "cheerio";

export type PricingDetails = {
  publishedRatePerSqFt: number;
  booking?: number;
  confirmation?: number;
  downPayment?: number;
  quarterlyBalloon?: number;
  quarterlyInstallments?: number;
  monthlyInstallment: number;
  monthlyInstallments: number;
  halfYearlyInstallment?: number;
  halfYearlyInstallments?: number;
  possession: number;
  sourceAvailability: "NOT_STATED";
};

export type ImportedProperty = {
  propertyCode: string;
  title: string;
  purpose: "SALE";
  propertyType: "APARTMENT";
  location: string;
  city: "Islamabad";
  area: number;
  areaUnit: "SQ_FT";
  bedrooms: number;
  bathrooms: null;
  price: number;
  currency: "PKR";
  description: string;
  amenities: string[];
  imagePaths: string[];
  sourceReference: string;
  pricingDetails: PricingDetails;
};

export type CommercialRate = {
  category: string;
  ratePerSqFt: number;
  highlights: string;
};

const money = (value: string) => Number(value.replace(/[^0-9]/g, ""));
const text = (value: string) => value.replace(/\s+/g, " ").trim();
const bedrooms = (category: string) =>
  /^studio$/i.test(category) ? 0 : Number(category.match(/\d+/)?.[0] ?? 0);
const slug = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const ideasOneImagePaths = (category: string) => {
  const floorPlan = /^studio$|^1\s*bed$/i.test(category)
    ? "public/images/one/ideas_one_studio_1bed.png"
    : /^2\s*bed$/i.test(category)
      ? "public/images/one/ideas_one_2bed.png"
      : "public/images/one/ideas_one_3bed.png";
  return [
    floorPlan,
    "public/images/one/ideas_one_featured.jpg",
    "public/images/one/ideas_one_payment_plan.png",
  ];
};

const towerImagePaths = (type: string, tower: "A" | "B") => {
  const normalized = type.trim().toUpperCase();
  const floorPlan = normalized.startsWith("XL")
    ? "public/images/tower/typexl.jpg"
    : normalized.startsWith("B")
      ? "public/images/tower/typeb.jpg"
      : normalized.startsWith("C")
        ? "public/images/tower/typec.jpg"
        : "public/images/tower/typea.jpg";
  return [
    floorPlan,
    "public/images/tower/ideas_tower_elevation.jpg",
    `public/images/tower/ideas_tower_payment_plan_${tower.toLowerCase()}.jpg`,
  ];
};

export function parseIdeasGroupWebsite(html: string) {
  const $ = cheerio.load(html);
  const properties: ImportedProperty[] = [];

  $("#ideasOneAptsTableWrap tbody tr").each((_index, row) => {
    const cells = $(row)
      .find("td")
      .map((_i, cell) => text($(cell).text()))
      .get();
    if (cells.length !== 7) return;
    const [category, areaText, total, down, monthly, halfYearly, possession] =
      cells;
    const area = money(areaText);
    properties.push({
      propertyCode: `IG-ONE-${slug(category)}-${area}`,
      title: `IDEAS ONE ${category} Apartment — ${area} sq ft`,
      purpose: "SALE",
      propertyType: "APARTMENT",
      location: "Gate 2, Multi Gardens B-17, Main G.T. Road",
      city: "Islamabad",
      area,
      areaUnit: "SQ_FT",
      bedrooms: bedrooms(category),
      bathrooms: null,
      price: money(total),
      currency: "PKR",
      description:
        "Finished apartment in IDEAS ONE. The source page describes the project as CDA approved and its basement as 80% complete. Individual unit availability is not published and must be confirmed before offering it to a customer.",
      amenities: [
        "Dedicated parking access",
        "High-speed escalators",
        "Panoramic elevators",
        "24/7 security surveillance",
        "Full backup power",
      ],
      imagePaths: ideasOneImagePaths(category),
      sourceReference: `IDEAS ONE apartments / ${category} / ${area} sq ft`,
      pricingDetails: {
        publishedRatePerSqFt: 16500,
        downPayment: money(down),
        monthlyInstallment: money(monthly),
        monthlyInstallments: 60,
        halfYearlyInstallment: money(halfYearly),
        halfYearlyInstallments: 10,
        possession: money(possession),
        sourceAvailability: "NOT_STATED",
      },
    });
  });

  const parseTower = (
    selector: string,
    tower: "A" | "B",
    rate: number,
    months: number,
  ) => {
    $(`${selector} tbody tr`).each((_index, row) => {
      const cells = $(row)
        .find("td")
        .map((_i, cell) => text($(cell).text()))
        .get();
      if (cells.length !== 9) return;
      const [
        category,
        type,
        areaText,
        total,
        booking,
        confirmation,
        balloon,
        monthly,
        possession,
      ] = cells;
      const area = money(areaText);
      properties.push({
        propertyCode: `IG-TOWER-${tower}-${slug(type)}-${area}`,
        title: `IDEAS Tower ${tower} ${category} Type ${type} — ${area} sq ft`,
        purpose: "SALE",
        propertyType: "APARTMENT",
        location: "Plot 04, MR-1A, Block B, Gate 1, Multi Gardens B-17",
        city: "Islamabad",
        area,
        areaUnit: "SQ_FT",
        bedrooms: bedrooms(category),
        bathrooms: null,
        price: money(total),
        currency: "PKR",
        description:
          "Finished apartment in IDEAS Tower. The source page describes the residential high-rise as 90% complete. Individual unit availability is not published and must be confirmed before offering it to a customer.",
        amenities: [
          "Secure parking",
          "High-speed elevators",
          "24/7 security",
          "Backup power",
        ],
        imagePaths: towerImagePaths(type, tower),
        sourceReference: `IDEAS Tower ${tower} / ${category} / Type ${type} / ${area} sq ft`,
        pricingDetails: {
          publishedRatePerSqFt: rate,
          booking: money(booking),
          confirmation: money(confirmation),
          quarterlyBalloon: money(balloon),
          quarterlyInstallments: 5,
          monthlyInstallment: money(monthly),
          monthlyInstallments: months,
          possession: money(possession),
          sourceAvailability: "NOT_STATED",
        },
      });
    });
  };

  parseTower("#towerATableWrap", "A", 20000, 18);
  parseTower("#towerBTableWrap", "B", 16000, 30);

  const commercialRates: CommercialRate[] = [];
  $("#ideasOneCommTableWrap tbody tr").each((_index, row) => {
    const cells = $(row)
      .find("td")
      .map((_i, cell) => text($(cell).text()))
      .get();
    if (cells.length === 3)
      commercialRates.push({
        category: cells[0],
        ratePerSqFt: money(cells[1]),
        highlights: cells[2],
      });
  });

  if (properties.length !== 17)
    throw new Error(
      `Expected 17 apartment price rows, found ${properties.length}. The source layout may have changed.`,
    );
  if (commercialRates.length !== 6)
    throw new Error(
      `Expected 6 commercial rate rows, found ${commercialRates.length}. The source layout may have changed.`,
    );
  return { properties, commercialRates };
}
