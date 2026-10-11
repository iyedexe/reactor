"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant } from "../session";

const schema = z.object({ id: z.string().min(1), status: z.enum(["NEW", "READ", "ARCHIVED"]) });

/** Marks a private feedback message as new / read / archived (tenant-scoped). */
export async function setFeedbackStatusAction(input: { id: string; status: "NEW" | "READ" | "ARCHIVED" }) {
  const { id, status } = schema.parse(input);
  const { db } = await requireTenant();
  await db.privateFeedback.update({ where: { id }, data: { status } });
  revalidatePath("/messages-prives");
}
