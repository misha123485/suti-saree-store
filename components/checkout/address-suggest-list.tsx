'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { fetchAutoSuggestions, type AutoSuggestion } from '@/lib/address-autosuggest';

/**
 * Dropdown of address suggestions under the Street address field.
 * Renders nothing unless the field is focused and there are results.
 * Debounced (600 ms), cancels stale requests, and stays quiet right after
 * the customer picks a suggestion.
 */
export default function AddressSuggestList({
  query,
  active,
  onPick,
}: {
  query: string;
  active: boolean;
  onPick: (s: AutoSuggestion) => void;
}) {
  const [items, setItems] = useState<AutoSuggestion[]>([]);
  const pickedRef = useRef('');

  useEffect(() => {
    const q = query.trim();
    if (!active || q.length < 3 || q === pickedRef.current) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const res = await fetchAutoSuggestions(q, ctrl.signal);
      if (!ctrl.signal.aborted) setItems(res);
    }, 600);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, active]);

  if (!active || items.length === 0) return null;

  return (
    <ul
      role="listbox"
      className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-md border border-border bg-background shadow-lg"
    >
      {items.map((s) => (
        <li key={s.label}>
          <button
            type="button"
            role="option"
            aria-selected={false}
            // keep the input focused so the list does not close before the click
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              pickedRef.current = s.line1.trim();
              setItems([]);
              onPick(s);
            }}
            className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
          >
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{s.label}</span>
          </button>
        </li>
      ))}
      <li className="px-3 py-1 text-[10px] text-muted-foreground">
        Suggestions: OpenStreetMap. Add your house/flat no. after picking.
      </li>
    </ul>
  );
}
