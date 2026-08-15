import Link from "next/link";
import { notFound } from "next/navigation";
import { getKidBySlug, getTransactions, postDueInterest } from "@/lib/bank";
import { formatMoney, todayISO } from "@/lib/money";
import BalanceChart from "@/components/BalanceChart";
import TransactionForm from "@/components/TransactionForm";
import TransactionList from "@/components/TransactionList";

export const dynamic = "force-dynamic";

export default async function KidPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  await postDueInterest();
  const kid = await getKidBySlug(slug);
  if (!kid) notFound();

  const transactions = await getTransactions(kid.id);
  const today = todayISO();

  // The list is newest-first; the chart wants oldest-first running balances.
  const points = [...transactions]
    .reverse()
    .map((txn) => ({ date: txn.date, balance: txn.balance }));

  return (
    <main>
      <Link href="/" className="back-link">
        &larr; All accounts
      </Link>

      <header className="site-header">
        <div>
          <h1 className="site-title">{kid.name}</h1>
          <p className="subtitle">{transactions.length} transactions</p>
        </div>
      </header>

      <section className="card balance-hero">
        <div className="label">Current balance</div>
        <div className="amount">{formatMoney(kid.balance)}</div>
      </section>

      <section className="section">
        <h2 className="section-title">Add or subtract money</h2>
        <TransactionForm slug={kid.slug} kidId={kid.id} today={today} />
      </section>

      <section className="section">
        <h2 className="section-title">Balance over time</h2>
        <BalanceChart points={points} name={kid.name} />
      </section>

      <section className="section">
        <h2 className="section-title">All transactions</h2>
        <TransactionList transactions={transactions} slug={kid.slug} today={today} />
      </section>
    </main>
  );
}
