import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DTax — AI-Powered Crypto Tax Intelligence",
  description: "Open source crypto tax calculator with FIFO, LIFO, HIFO support. Calculate your crypto capital gains and generate tax reports.",
  keywords: ["crypto", "tax", "bitcoin", "FIFO", "capital gains", "portfolio"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <nav className="nav">
            <a href="/" className="nav-brand">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect width="28" height="28" rx="8" fill="#6366f1" />
                <text x="6" y="20" fill="white" fontSize="16" fontWeight="bold" fontFamily="Inter">D</text>
              </svg>
              <span>DTax</span>
            </a>
            <div className="nav-links">
              <a href="/" className="nav-link active">Dashboard</a>
              <a href="/transactions" className="nav-link">Transactions</a>
              <a href="/tax" className="nav-link">Tax Report</a>
            </div>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
