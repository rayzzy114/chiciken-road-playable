"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";

interface BalanceFormProps {
  userId: string;
}

export function BalanceForm({ userId }: BalanceFormProps) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(parseFloat(amount))) return;

    setIsLoading(true);
    try {
      // In a real app, we'd call a Server Action here
      const res = await fetch("/api/admin/add-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, amount: parseFloat(amount) }),
      });
      if (res.ok) {
        setAmount("");
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to add balance", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleAdd} className="flex gap-2 items-center">
      <Input
        type="number"
        step="0.01"
        placeholder="+"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-20 h-8 text-xs"
        disabled={isLoading}
      />
      <Button size="sm" variant="outline" className="h-8 px-2" disabled={isLoading}>
        <Plus className="h-4 w-4" />
      </Button>
    </form>
  );
}
