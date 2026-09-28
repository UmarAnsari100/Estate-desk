import { Prisma } from "@prisma/client";
import { db } from "../repositories/db.js";
import { filtersSchema } from "../types/schemas.js";
export function propertyWhere(
  input: unknown,
  availableOnly = false,
): Prisma.PropertyWhereInput {
  const f = filtersSchema.parse(input);
  return {
    status: availableOnly ? "AVAILABLE" : f.status,
    purpose: f.purpose,
    propertyType: f.propertyType,
    city: f.city ? { contains: f.city, mode: "insensitive" } : undefined,
    location: f.location
      ? { contains: f.location, mode: "insensitive" }
      : undefined,
    area: f.area,
    areaUnit: f.areaUnit,
    bedrooms: f.bedrooms,
    price: { gte: f.minimumPrice, lte: f.maximumPrice },
    OR: f.q
      ? [
          { title: { contains: f.q, mode: "insensitive" } },
          { propertyCode: { contains: f.q, mode: "insensitive" } },
        ]
      : undefined,
  };
}
export const propertyService = {
  search: (
    input: unknown,
    availableOnly = false,
    includeDemo = true,
    includeReviewPreview = false,
  ) => {
    const f = filtersSchema.parse(input);
    return db.property.findMany({
      where: {
        ...propertyWhere(f, availableOnly && !includeReviewPreview),
        ...(includeReviewPreview
          ? {
              AND: [
                {
                  OR: [
                    { status: "AVAILABLE" as const },
                    { status: "INACTIVE" as const, requiresReview: true },
                  ],
                },
              ],
            }
          : {}),
        ...(includeDemo ? {} : { demo: false }),
      },
      orderBy: { createdAt: "desc" },
      take: availableOnly ? 3 : 30,
      skip: availableOnly ? 0 : (f.page - 1) * 30,
    });
  },
};
