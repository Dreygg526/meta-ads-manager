import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ads Manager",
  description: "Meta ads for every account in one place, without logging in to Facebook.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
