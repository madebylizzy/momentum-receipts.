import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Momentum Receipts — AI Expense Extraction",
  description: "AI-powered receipt processing and expense extraction powered by DeepSeek",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#F8F7F3] text-[#17201C] antialiased min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>
        <footer className="border-t border-[#d7deda] py-6 text-center text-xs text-[#66736D] bg-[#ffffff]">
          Momentum Receipts · AI Integration Assessment Slice · Reused Auth from Assessment 1
        </footer>
      </body>
    </html>
  );
}
