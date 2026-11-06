import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/store";
import Shell from "@/components/layout/Shell";
export const metadata: Metadata = { title: "NetWatch — Dasbor Pemantauan Jaringan Offline" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="id" data-anim="subtle"><body><AppProvider><Shell>{children}</Shell></AppProvider></body></html>);
}
