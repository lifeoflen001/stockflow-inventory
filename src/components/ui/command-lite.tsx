import { createContext, useContext, useMemo, useState, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

type CommandContextValue = { query: string; setQuery: (query: string) => void };
const CommandContext = createContext<CommandContextValue>({ query: "", setQuery: () => undefined });

export function Command({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  const [query, setQuery] = useState("");
  return <CommandContext.Provider value={{ query, setQuery }}><div className={className} {...props}>{children}</div></CommandContext.Provider>;
}

export function CommandInput({ onChange, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const { query, setQuery } = useContext(CommandContext);
  return <input {...props} value={props.value ?? query} onChange={(event) => { setQuery(event.target.value); onChange?.(event); }} className="flex h-10 w-full border-b bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground" />;
}

export function CommandList({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return <div className={className ?? "max-h-60 overflow-y-auto p-1"} {...props}>{children}</div>;
}

export function CommandGroup({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return <div className={className} {...props}>{children}</div>;
}

export function CommandItem({ value, onSelect, children, className, ...props }: HTMLAttributes<HTMLButtonElement> & { value?: string; onSelect?: () => void; children?: ReactNode }) {
  const { query } = useContext(CommandContext);
  const matches = useMemo(() => !query || (value ?? "").toLowerCase().includes(query.toLowerCase()), [query, value]);
  if (!matches) return null;
  return <button type="button" className={className ?? "flex w-full rounded-sm px-2 py-2 text-left text-sm hover:bg-muted"} onClick={onSelect} {...props}>{children}</button>;
}

export function CommandEmpty({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return <div className={className ?? "py-6 text-center text-sm text-muted-foreground"} {...props}>{children}</div>;
}
