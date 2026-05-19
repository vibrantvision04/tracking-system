"use client";
import dynamic from "next/dynamic";

const D2DMap = dynamic(() => import("@/components/D2DMap"), { ssr: false });

export default function D2DPage() {
  return <D2DMap />;
}
