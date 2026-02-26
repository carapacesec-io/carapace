import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Carapace — Automated Code Review & Security",
  description:
    "Automated code review and security analysis. Catch bugs, vulnerabilities, and code smells on every PR. One-click fixes, full repo upgrades, and attack scanning.",
  metadataBase: new URL("https://carapacesec.io"),
  openGraph: {
    title: "Carapace — Automated Code Review & Security",
    description:
      "120+ detection rules. Auto-fix suggestions. Every PR, automatically.",
    url: "https://carapacesec.io",
    siteName: "Carapace",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Carapace — Automated Code Review & Security",
    description:
      "120+ detection rules. Auto-fix suggestions. Every PR, automatically.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head />
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
