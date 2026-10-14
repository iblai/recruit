import type { Metadata, Viewport } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";

// The proxy's nonce-based CSP requires per-request rendering.
export const dynamic = "force-dynamic";

const openSans = Open_Sans({ subsets: ["latin"], variable: "--font-open-sans" });

export const metadata: Metadata = {
  title: {
    default: "ibl.ai/recruit",
    template: "%s · ibl.ai/recruit",
  },
  description:
    "The open-source recruitment CRM for universities on the ibl.ai platform — a Chief of Staff agent, prospects, schools, applications, activities and landing pages.",
  applicationName: "ibl.ai/recruit",
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

/**
 * The root layout is deliberately bare. Two route groups hang off it:
 *  - `(app)` — the signed-in recruitment workspace, wrapped in the ibl.ai
 *    providers (SSO, organization, Redux).
 *  - `(public)` — prospect-facing landing pages at `/p/<org>/<slug>`, which
 *    must render without a session and without the SDK bundle.
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${openSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
