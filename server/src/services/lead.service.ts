import { leadFields } from "../types/schemas.js";
import { db } from "../repositories/db.js";
export function nonNullLead(input: unknown) {
  return Object.fromEntries(
    Object.entries(leadFields.parse(input)).filter(
      ([, v]) => v !== null && v !== undefined,
    ),
  );
}
export const leadService = {
  async update(conversationId: string, input: unknown, resetSearch = false) {
    return db.lead.update({
      where: { conversationId },
      data: {
        ...(resetSearch
          ? {
              purpose: null,
              propertyType: null,
              preferredLocation: null,
              city: null,
              minimumBudget: null,
              maximumBudget: null,
              preferredArea: null,
              areaUnit: null,
              bedrooms: null,
              interestedPropertyId: null,
            }
          : {}),
        ...nonNullLead(input),
      },
    });
  },
};
