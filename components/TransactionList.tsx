"use client";

import { useState, useTransition } from "react";
import type { Transaction } from "@/lib/bank";
import { formatDate, formatMoney, formatSigned } from "@/lib/money";
import { deleteTransactionAction } from "@/app/actions";
import TransactionForm from "./TransactionForm";

export default function TransactionList({
  transactions,
  slug,
  today,
}: {
  transactions: Transaction[];
  slug: string;
  today: string;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  if (transactions.length === 0) {
    return <div className="card empty">No transactions yet.</div>;
  }

  function remove(id: number) {
    startTransition(async () => {
      await deleteTransactionAction(id, slug);
      setConfirmingId(null);
    });
  }

  return (
    <ul className="card txn-list">
      {transactions.map((txn) => (
        <li key={txn.id} className="txn">
          {editingId === txn.id ? (
            <div style={{ gridColumn: "1 / -1" }}>
              <TransactionForm
                slug={slug}
                today={today}
                transaction={{
                  id: txn.id,
                  date: txn.date,
                  amount: txn.amount,
                  reason: txn.reason,
                }}
                onDone={() => setEditingId(null)}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <>
              <div>
                <div className="reason">
                  {txn.reason || <em style={{ opacity: 0.6 }}>No reason given</em>}
                  {txn.kind === "interest" ? <span className="tag">Interest</span> : null}
                </div>
                <div className="when">{formatDate(txn.date)}</div>
              </div>

              <div>
                <div className={`amount ${txn.amount < 0 ? "neg" : "pos"}`}>
                  {formatSigned(txn.amount)}
                </div>
                <div className="running">{formatMoney(txn.balance)}</div>
              </div>

              <div className="txn-actions">
                <button type="button" className="ghost" onClick={() => setEditingId(txn.id)}>
                  Edit
                </button>
                {confirmingId === txn.id ? (
                  <>
                    <button
                      type="button"
                      className="ghost danger"
                      disabled={isPending}
                      onClick={() => remove(txn.id)}
                    >
                      {isPending ? "Deleting…" : "Really delete"}
                    </button>
                    <button type="button" className="ghost" onClick={() => setConfirmingId(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => setConfirmingId(txn.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
