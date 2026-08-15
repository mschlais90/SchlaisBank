"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/app/actions";
import { createTransactionAction, updateTransactionAction } from "@/app/actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

type Props = {
  slug: string;
  /** Today's date, computed on the server so it matches the family's timezone. */
  today: string;
  /** Present when adding to an account. */
  kidId?: number;
  /** Present when editing an existing transaction. */
  transaction?: { id: number; date: string; amount: number; reason: string };
  onDone?: () => void;
  onCancel?: () => void;
};

export default function TransactionForm({
  slug,
  today,
  kidId,
  transaction,
  onDone,
  onCancel,
}: Props) {
  const isEdit = Boolean(transaction);
  const action = isEdit ? updateTransactionAction : createTransactionAction;
  const [state, formAction] = useActionState<ActionResult | null, FormData>(action, null);

  const [direction, setDirection] = useState<"add" | "subtract">(
    transaction && transaction.amount < 0 ? "subtract" : "add"
  );
  const formRef = useRef<HTMLFormElement>(null);
  const amountId = useId();
  const reasonId = useId();
  const dateId = useId();

  useEffect(() => {
    if (state?.ok) {
      if (!isEdit) {
        formRef.current?.reset();
        setDirection("add");
      }
      onDone?.();
    }
  }, [state, isEdit, onDone]);

  return (
    <form ref={formRef} action={formAction} className={isEdit ? "" : "card form-card"}>
      <input type="hidden" name="slug" value={slug} />
      {kidId ? <input type="hidden" name="kidId" value={kidId} /> : null}
      {transaction ? <input type="hidden" name="id" value={transaction.id} /> : null}
      <input type="hidden" name="direction" value={direction} />

      <div className="field-row two">
        <div className="field">
          <label htmlFor={amountId}>Amount</label>
          <div className="toggle-group" style={{ marginBottom: 8 }}>
            <button
              type="button"
              className="toggle add"
              aria-pressed={direction === "add"}
              onClick={() => setDirection("add")}
            >
              Add
            </button>
            <button
              type="button"
              className="toggle subtract"
              aria-pressed={direction === "subtract"}
              onClick={() => setDirection("subtract")}
            >
              Subtract
            </button>
          </div>
          <input
            id={amountId}
            name="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            defaultValue={transaction ? Math.abs(transaction.amount).toFixed(2) : ""}
            required
          />
        </div>

        <div className="field">
          <label htmlFor={dateId}>Date</label>
          <input
            id={dateId}
            name="date"
            type="date"
            defaultValue={transaction?.date ?? today}
            required
          />
        </div>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor={reasonId}>Reason</label>
        <input
          id={reasonId}
          name="reason"
          type="text"
          placeholder="Rocks, Birthday, Prodigy…"
          defaultValue={transaction?.reason ?? ""}
          maxLength={200}
          required
        />
      </div>

      <div className="form-actions">
        <SubmitButton label={isEdit ? "Save changes" : "Save transaction"} />
        {onCancel ? (
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        {state && !state.ok ? <span className="error">{state.error}</span> : null}
      </div>
    </form>
  );
}
