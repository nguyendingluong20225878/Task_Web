"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

function getPageItems(page: number, totalPages: number) {
  if (totalPages <= 7)
    return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = new Set([1, totalPages, page, page - 1, page + 1]);
  const sorted = [...pages]
    .filter((item) => item >= 1 && item <= totalPages)
    .sort((a, b) => a - b);
  const items: Array<number | "..."> = [];

  sorted.forEach((item, index) => {
    const previous = sorted[index - 1];
    if (previous && item - previous > 1) items.push("...");
    items.push(item);
  });

  return items;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const from = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(total, currentPage * pageSize);
  const pages = getPageItems(currentPage, totalPages);

  return (
    <div className="flex min-h-14 flex-col gap-3 rounded-lg border-2 border-slate-950 bg-[#FFFDF3] p-3 font-bold md:flex-row md:items-center md:justify-between">
      <div className="text-sm">
        Hiển thị {from}-{to} trong tổng số {total} mục
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-10 rounded-lg border-2 border-slate-950 bg-white px-3 text-sm font-extrabold outline-none focus-visible:ring-4 focus-visible:ring-[#FFD84D] focus-visible:ring-offset-2"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          aria-label="Số mục mỗi trang"
        >
          {[10, 20, 50].map((value) => (
            <option key={value} value={value}>
              {value} / trang
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="secondary"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Trước
        </Button>
        <div className="flex min-w-[168px] flex-wrap justify-center gap-1">
          {pages.map((item, index) =>
            item === "..." ? (
              <span
                key={`gap-${index}`}
                className="grid h-9 w-9 place-items-center text-sm font-black"
              >
                ...
              </span>
            ) : (
              <button
                key={item}
                className={cn(
                  "h-9 w-9 rounded-lg border-2 border-slate-950 bg-white text-sm font-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFD84D] focus-visible:ring-offset-2",
                  currentPage === item &&
                    "bg-[#FFD84D] shadow-[2px_2px_0_#111827]"
                )}
                onClick={() => onPageChange(item)}
                aria-current={currentPage === item ? "page" : undefined}
              >
                {item}
              </button>
            )
          )}
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Sau
        </Button>
      </div>
    </div>
  );
}
