"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AddLead() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  async function submit(form: FormData) {
    setError("");
    const res = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
    if (!res.ok) return setError((await res.json().catch(() => ({ error: "Failed" }))).error);
    setOpen(false);
    router.refresh();
  }

  if (!open) return <button onClick={() => setOpen(true)} className="text-xs font-medium text-indigo-700 hover:underline">+ Add lead</button>;
  const input = "rounded-md border border-zinc-300 px-2 py-1 text-sm";
  return (
    <form action={submit} className="flex flex-wrap items-center gap-2">
      <input name="name" placeholder="Business name" required className={input} />
      <input name="category" placeholder="Category (gym)" required className={`${input} w-28`} />
      <input name="city" placeholder="City" required className={`${input} w-28`} />
      <input name="country" placeholder="GB" defaultValue="GB" className={`${input} w-14`} />
      <input name="phone" placeholder="Phone" className={`${input} w-32`} />
      <input name="website" placeholder="Website" className={input} />
      <button className="rounded-md bg-zinc-900 px-3 py-1 text-sm text-white">Add</button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-500">Cancel</button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </form>
  );
}
