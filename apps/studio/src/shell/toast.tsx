// SPDX-License-Identifier: EPL-2.0
import { Check, Info } from 'lucide-react';
import { useEffect, type ReactElement } from 'react';
import { create } from 'zustand';

interface Toast {
  readonly id: number;
  readonly text: string;
  readonly tone: 'ok' | 'info';
}

interface ToastState {
  readonly toasts: readonly Toast[];
  show(text: string, tone?: Toast['tone']): void;
  dismiss(id: number): void;
}

let next = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  show: (text, tone = 'ok') =>
    set((state) => ({ toasts: [...state.toasts.slice(-2), { id: next++, text, tone }] })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Shows a short confirmation, such as "Link copied". */
export const toast = (text: string, tone?: Toast['tone']): void =>
  useToasts.getState().show(text, tone);

function Item({ toast: item }: { readonly toast: Toast }): ReactElement {
  const dismiss = useToasts((state) => state.dismiss);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), 2600);
    return () => clearTimeout(timer);
  }, [item.id, dismiss]);
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2 text-[13px] shadow-pop">
      {item.tone === 'ok' ? (
        <Check className="size-4 text-ok" />
      ) : (
        <Info className="size-4 text-accent" />
      )}
      {item.text}
    </div>
  );
}

export function Toaster(): ReactElement {
  const toasts = useToasts((state) => state.toasts);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((t) => (
        <Item key={t.id} toast={t} />
      ))}
    </div>
  );
}
