import Link from "next/link";
import { AppShell } from "../components/AppShell";

const links = [
  { href: "/", label: "Home" },
  { href: "/agencies", label: "Agencies" },
  { href: "/sold-products", label: "Sold Products" },
  { href: "/activities", label: "Activities" },
  { href: "/people", label: "People" },
];

export default function DevNotesPage() {
  return (
    <AppShell
      title="Dev Notes"
      subtitle="Quick navigation for local development. Add new slices here as you build."
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              padding: 14,
              borderRadius: 10,
              border: "1px solid #e3e6eb",
              background: "#fff",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
