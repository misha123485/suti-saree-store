'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

/**
 * Plain arrow shown in front of a category / tag page title. Goes back to
 * the page the shopper came from; if the page was opened directly (no
 * history, e.g. from a Google result in a new tab) it falls back to Home.
 */
export default function BackButton({ fallbackHref = '/' }: { fallbackHref?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Go back"
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
      className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
}
