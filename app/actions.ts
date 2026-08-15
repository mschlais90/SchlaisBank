"use server";

import { revalidatePath } from "next/cache";
import { addTransaction, deleteTransaction, updateTransaction } from "@/lib/bank";

export type ActionResult = { ok: true } | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Shared validation for the add and edit forms. */
function parseEntry(formData: FormData): { date: string; amount: number; reason: string } | string {
  const date = String(formData.get("date") ?? "");
  const rawAmount = String(formData.get("amount") ?? "").replace(/[$,\s]/g, "");
  const direction = String(formData.get("direction") ?? "add");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!ISO_DATE.test(date)) return "Pick a valid date.";

  const magnitude = Number(rawAmount);
  if (!rawAmount || Number.isNaN(magnitude)) return "Enter an amount.";
  if (magnitude <= 0) return "Amount must be greater than zero — use Add or Subtract to set the direction.";
  if (magnitude > 100000) return "That amount looks like a typo.";

  if (!reason) return "Add a short reason.";
  if (reason.length > 200) return "Keep the reason under 200 characters.";

  return { date, amount: direction === "subtract" ? -magnitude : magnitude, reason };
}

export async function createTransactionAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const kidId = Number(formData.get("kidId"));
  const slug = String(formData.get("slug") ?? "");
  if (!kidId) return { ok: false, error: "Missing account." };

  const parsed = parseEntry(formData);
  if (typeof parsed === "string") return { ok: false, error: parsed };

  await addTransaction({ kidId, ...parsed });
  revalidatePath(`/kid/${slug}`);
  revalidatePath("/");
  return { ok: true };
}

export async function updateTransactionAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const id = Number(formData.get("id"));
  const slug = String(formData.get("slug") ?? "");
  if (!id) return { ok: false, error: "Missing transaction." };

  const parsed = parseEntry(formData);
  if (typeof parsed === "string") return { ok: false, error: parsed };

  await updateTransaction({ id, ...parsed });
  revalidatePath(`/kid/${slug}`);
  revalidatePath("/");
  return { ok: true };
}

export async function deleteTransactionAction(id: number, slug: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing transaction." };
  await deleteTransaction(id);
  revalidatePath(`/kid/${slug}`);
  revalidatePath("/");
  return { ok: true };
}
