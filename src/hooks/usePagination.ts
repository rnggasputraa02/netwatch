"use client";
import { useEffect, useState } from "react";
/** Pagination reusable; kembali ke halaman 1 saat resetKey (filter) atau ukuran halaman berubah. */
export function usePagination<T>(rows: T[], resetKey: string) {
  const [page, setPage] = useState(1); const [size, setSize] = useState(10);
  useEffect(() => setPage(1), [resetKey, size]);
  const pages = Math.max(1, Math.ceil(rows.length / size)); const cur = Math.min(page, pages);
  return { items: rows.slice((cur - 1) * size, cur * size), page: cur, size, setPage, setSize };
}
