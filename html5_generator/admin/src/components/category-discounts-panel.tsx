"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLAYABLE_CATEGORIES } from "@/lib/playable-categories";

type DiscountRow = {
  category: string;
  label: string;
  percent: number;
};

type Props = {
  initialRows: DiscountRow[];
};

export function CategoryDiscountsPanel({ initialRows }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const orderedRows = useMemo(() => {
    const byKey = new Map(rows.map((row) => [row.category, row]));
    return PLAYABLE_CATEGORIES.map((item) => ({
      category: item.key,
      label: item.label,
      percent: byKey.get(item.key)?.percent ?? 0,
    }));
  }, [rows]);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const updatePercent = (category: string, value: string) => {
    const numeric = Number(value);
    const percent = Number.isFinite(numeric) ? Math.max(0, Math.min(90, Math.trunc(numeric))) : 0;
    setRows((prev) =>
      prev.map((row) => (row.category === category ? { ...row, percent } : row)),
    );
  };

  const saveCategory = async (category: string) => {
    const row = orderedRows.find((item) => item.category === category);
    if (!row) return;
    setSaving(category);
    setStatus("");
    try {
      const res = await fetch("/api/admin/category-discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, percent: row.percent }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(payload?.error ?? "save failed"));
      setStatus(`Скидка для ${row.label}: ${row.percent}%`);
    } catch (error) {
      setStatus(`Ошибка: ${error instanceof Error ? error.message : "не удалось сохранить"}`);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {orderedRows.map((row) => (
        <div key={row.category} className="flex items-center gap-2">
          <div className="min-w-32 text-sm">{row.label}</div>
          <Input
            type="number"
            min={0}
            max={90}
            value={row.percent}
            onChange={(e) => updatePercent(row.category, e.target.value)}
            className="w-24"
            disabled={saving === row.category}
          />
          <span className="text-xs text-muted-foreground">%</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => saveCategory(row.category)}
            disabled={saving === row.category}
          >
            Сохранить
          </Button>
        </div>
      ))}
      {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
    </div>
  );
}
