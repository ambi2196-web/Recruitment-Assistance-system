"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }

  return <button type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button>;
}
