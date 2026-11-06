"use client";
import { useEffect, useState } from "react";
export function useClock(): string {
  const [c, setC] = useState("");
  useEffect(() => { const t = setInterval(() => setC(new Date().toLocaleTimeString("id-ID")), 1000); return () => clearInterval(t); }, []);
  return c;
}
