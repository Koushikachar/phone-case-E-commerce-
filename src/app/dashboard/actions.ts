"use server";

import { db } from "@/db";
import { OrderStatus } from "@/generated/prisma/enums";

export const changeOrderStatus = async ({
  id,
  newStatus,
}: {
  id: string;
  newStatus: OrderStatus;
}) => {
  await db.order.update({
    where: { id },
    data: { status: newStatus },
  });
};
