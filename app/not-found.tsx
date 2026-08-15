import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <h1 className="site-title">Not found</h1>
      <p className="subtitle" style={{ marginBottom: 16 }}>
        That page doesn&apos;t exist.
      </p>
      <Link href="/" className="back-link">
        &larr; All accounts
      </Link>
    </main>
  );
}
