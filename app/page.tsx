import Link from "next/link";
import { getKids, postDueInterest } from "@/lib/bank";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Catching up on interest here means it lands the first time anyone opens
  // the app in a new month, whether or not the Vercel cron fired.
  await postDueInterest();
  const kids = await getKids();

  const total = kids.reduce((sum, kid) => sum + kid.balance, 0);

  return (
    <main>
      <header className="site-header">
        <div>
          <h1 className="site-title">Bank of Dad</h1>
          <p className="subtitle">1% interest, paid on the 1st of every month</p>
        </div>
      </header>

      <div className="kid-grid">
        {kids.map((kid) => (
          <Link key={kid.id} href={`/kid/${kid.slug}`} className="card kid-card">
            <span className="name">{kid.name}</span>
            <span className="balance">{formatMoney(kid.balance)}</span>
            <span className="meta">Tap to add or spend &rarr;</span>
          </Link>
        ))}
      </div>

      <p className="total-line">All three accounts: {formatMoney(total)}</p>
    </main>
  );
}
