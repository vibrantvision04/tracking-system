"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import MainHeader from "@/components/MainHeader";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen lg:h-screen overflow-y-auto lg:overflow-hidden max-w-[100vw] overflow-x-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto lg:overflow-hidden relative">
        <MainHeader />
        <main className="flex-1 flex flex-col min-h-0 bg-(--bg-dark) overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
