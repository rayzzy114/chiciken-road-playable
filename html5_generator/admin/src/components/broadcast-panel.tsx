"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function BroadcastPanel() {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) {
      setPreviewUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(photo);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [photo]);

  const submit = async (mode: "preview" | "broadcast") => {
    setStatus("");
    if (!text.trim() && !photo) {
      setStatus("Нужно заполнить текст или прикрепить фото.");
      return;
    }

    setIsSending(true);
    try {
      const body = new FormData();
      body.set("text", text);
      if (photo) body.set("photo", photo);
      body.set("mode", mode);

      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        body,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(payload?.error ?? "Broadcast failed"));
      if (mode === "preview") {
        setStatus(`Тест отправлен: ${payload.sent}/${payload.total}, ошибок ${payload.failed}`);
      } else {
        setStatus(`Рассылка завершена: отправлено ${payload.sent}/${payload.total}, ошибок ${payload.failed}`);
      }
    } catch (error) {
      setStatus(`Ошибка: ${error instanceof Error ? error.message : "не удалось отправить"}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit("broadcast");
      }}
      className="flex flex-col gap-3"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Текст рассылки (HTML поддерживается)"
        className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm"
        disabled={isSending}
      />
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        disabled={isSending}
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={isSending} onClick={() => void submit("preview")}>
          {isSending ? "Отправка..." : "Тест в Telegram"}
        </Button>
        <Button type="submit" disabled={isSending}>
          {isSending ? "Отправка..." : "Отправить всем"}
        </Button>
      </div>
      <div className="rounded-md border bg-muted/30 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Локальный предпросмотр</p>
        {previewUrl ? (
          <img src={previewUrl} alt="Preview" className="mb-2 max-h-52 rounded-md border object-contain" />
        ) : null}
        <div className="whitespace-pre-wrap rounded bg-background p-2 text-sm">{text || "Текст рассылки..."}</div>
      </div>
      {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
    </form>
  );
}
