import type { ReactNode } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { signOutDemo } from "./actions";
import "./globals.css";

export const metadata = { title: "Requirement Desk" };

// Every page depends on the signed-in user and live data. Without this, a
// build with demo mode off would freeze the pages as static files.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body>
        <header className="top-bar">
          <Link href="/" className="brand">Requirement Desk</Link>
          {user && (
            <form action={signOutDemo} className="who">
              <span>{user.name} ({user.role})</span>
              <button type="submit">Switch user</button>
            </form>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
