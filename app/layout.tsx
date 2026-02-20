import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#ffffff",
  colorScheme: "light",
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
    <html lang="it" className="light" style={{ colorScheme: "light" }} suppressHydrationWarning>
      <body className="antialiased bg-white text-gray-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
