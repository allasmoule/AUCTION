import React, { createContext, useCallback, useContext, useState } from "react";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant?: "default" | "success" | "destructive";
}

interface ToastContextValue {
  toast: (item: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((item: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev.slice(-3), { ...item, id }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
    }, 4200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {items.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto rounded-lg border px-4 py-3 shadow-xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-4 ${
              item.variant === "destructive"
                ? "bg-destructive/95 border-destructive text-white"
                : item.variant === "success"
                  ? "bg-emerald-950/95 border-emerald-500/60 text-emerald-50"
                  : "bg-card/95 border-primary/40 text-foreground"
            }`}
          >
            <div className="font-semibold text-sm">{item.title}</div>
            {item.description && <div className="text-xs opacity-90 mt-0.5">{item.description}</div>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
