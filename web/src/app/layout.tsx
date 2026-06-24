import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import MainHeader from "@/components/MainHeader";
import { ToastContainer } from "react-toastify";
import { ConfirmProvider } from "@/context/ConfirmContext";
import { AuthProvider } from "@/context/AuthContext";
import AuthGate from "@/components/AuthGate";

import "react-toastify/dist/ReactToastify.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "VSWM Jaipur | GPS Vehicle Tracking",
  description: "Real-time GPS tracking & waste management for Jaipur Municipal Corporation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        />
      </head>
      <body className={`${inter.className} antialiased`} suppressHydrationWarning>
        <AuthProvider>
          <ConfirmProvider>
            <AuthGate>
              <div className="flex h-screen overflow-hidden">
                <Sidebar />
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                  <MainHeader />
                  <main className="flex-1 flex flex-col min-h-0 bg-[var(--bg-dark)]">{children}</main>
                </div>
              </div>
            </AuthGate>
          </ConfirmProvider>
          <ToastContainer
            position="bottom-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="dark"
          />
        </AuthProvider>
      </body>
    </html>
  );
}