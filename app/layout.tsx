import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "Teatri Apuani",
  description: "Teatri Apuani - MVP",
  icons: {
    icon: [{ url: "/icon.png?v=2", sizes: "96x96", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png?v=2", sizes: "96x96", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
