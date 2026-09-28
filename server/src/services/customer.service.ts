import { Prisma } from "@prisma/client";
export async function identifyCustomer(
  tx: Prisma.TransactionClient,
  phone: string,
  name?: string,
) {
  return tx.customer.upsert({
    where: { whatsappNumber: phone },
    create: { whatsappNumber: phone, name: name || phone },
    update: name ? { name } : {},
  });
}
