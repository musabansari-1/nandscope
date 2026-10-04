import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  applicationName: "NANDscope",
  title: "NANDscope — Write code. Zoom down to NAND.",
  description: "An interactive computer microscope. Follow source code through VM, Hack assembly, machine code, CPU execution, logic gates and all the way down to NAND.",
  keywords: ["computer architecture", "compiler", "CPU simulator", "Hack computer", "Nand2Tetris", "assembly", "logic gates", "NAND"],
  openGraph: {
    title: "NANDscope — Write code. Zoom down to NAND.",
    description: "Follow code through a real compiler and CPU simulation, all the way down to NAND gates.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NANDscope — Write code. Zoom down to NAND.",
    description: "An interactive computer microscope from source code to NAND gates.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
