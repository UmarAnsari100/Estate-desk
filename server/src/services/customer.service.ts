import { Prisma } from "@prisma/client";
import { databaseSafeDisplayName } from "../utils/text.js";
export async function identifyCustomer(
  tx: Prisma.TransactionClient,
  phone: string,
  name?: string,
) {
  const safeName = name ? databaseSafeDisplayName(name) : "";
  return tx.customer.upsert({
    where: { whatsappNumber: phone },
    create: { whatsappNumber: phone, name: safeName || phone },
    // Keep a previously known name when an incoming push name contains only
    // characters the local database cannot represent.
    update: safeName ? { name: safeName } : {},
  });
}
