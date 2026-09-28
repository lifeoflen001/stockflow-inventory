import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, Boxes, Moon, PackageCheck, Sun, Truck, Warehouse } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button.tsx";
import { BRAND_LOGO_URL } from "@/lib/branding.ts";

const workspaceScreens = [
  {
    label: "Inventory overview",
    title: "Live stock position",
    metric: "12,486",
    metricLabel: "units in stock",
    trend: "+12.8%",
    icon: Boxes,
    items: [["Engine oil 20W-50", "1,248", "Healthy"], ["Brake pads / Toyota", "486", "Reorder soon"], ["Air filters", "1,920", "Healthy"]]
  },
  {
    label: "Procurement flow",
    title: "Orders in motion",
    metric: "28",
    metricLabel: "active purchase orders",
    trend: "+6.4%",
    icon: PackageCheck,
    items: [["PO-2026-0841", "Dar es Salaam", "Awaiting approval"], ["PO-2026-0838", "Arusha branch", "In transit"], ["PO-2026-0829", "Mwanza store", "Received"]]
  },
  {
    label: "Logistics control",
    title: "Fleet movement",
    metric: "94.2%",
    metricLabel: "delivery completion",
    trend: "+4.1%",
    icon: Truck,
    items: [["Dar es Salaam → Arusha", "Today", "On route"], ["Mwanza → Dodoma", "Tomorrow", "Scheduled"], ["Zanzibar store", "18 Aug", "Delivered"]]
  },
  {
    label: "Store operations",
    title: "Warehouse capacity",
    metric: "78%",
    metricLabel: "average utilization",
    trend: "Optimal",
    icon: Warehouse,
    items: [["Central warehouse", "86%", "Healthy"], ["Northern hub", "71%", "Healthy"], ["Coastal store", "64%", "Healthy"]]
  }
];

export function AuthShell({ children }: { children: ReactNode }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [activeWorkspace, setActiveWorkspace] = useState(0);
  const screen = workspaceScreens[activeWorkspace];
  const ScreenIcon = screen.icon;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveWorkspace((current) => (current + 1) % workspaceScreens.length);
    }, 4800);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className={`auth-stage ${isDark ? "auth-stage-dark" : "auth-stage-light"}`}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="auth-theme-toggle"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>

      <section className="auth-panel">
        <section className="auth-form-panel">
          <div className="auth-form-content">
            <div className="auth-brand-lockup">
              <img src={BRAND_LOGO_URL} alt="Tanzania Specialist" />
            </div>
            {children}
          </div>
        </section>

        <aside className="auth-hero-panel" aria-label="StockFlow workspace overview">
          <div className="auth-architecture" aria-hidden="true">
            <span className="auth-architecture-plane auth-architecture-plane-one" />
            <span className="auth-architecture-plane auth-architecture-plane-two" />
            <span className="auth-architecture-plane auth-architecture-plane-three" />
            <span className="auth-architecture-arch" />
            <span className="auth-architecture-seam auth-architecture-seam-one" />
            <span className="auth-architecture-seam auth-architecture-seam-two" />
          </div>
          <div className="auth-hero-overlay" />
          <div className="auth-workspace-window" key={activeWorkspace}>
            <div className="auth-workspace-chrome">
              <span className="auth-workspace-brand"><i /> StockFlow</span>
              <span className="auth-workspace-status"><b /> Live</span>
            </div>
            <div className="auth-workspace-nav">
              <span className="is-active">Overview</span><span>Inventory</span><span>Procurement</span><span>Logistics</span>
            </div>
            <div className="auth-workspace-heading">
              <div><span>{screen.label}</span><h3>{screen.title}</h3></div>
              <ScreenIcon aria-hidden="true" />
            </div>
            <div className="auth-workspace-metric">
              <strong>{screen.metric}</strong>
              <span>{screen.metricLabel}</span>
              <em><ArrowUpRight aria-hidden="true" /> {screen.trend}</em>
            </div>
            <div className="auth-workspace-chart" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
            <div className="auth-workspace-table">
              {screen.items.map(([name, value, status]) => <div className="auth-workspace-row" key={name}><span>{name}</span><strong>{value}</strong><em className={status === "Reorder soon" ? "is-warning" : ""}>{status}</em></div>)}
            </div>
          </div>
          <div className="auth-hero-content">
            <span className="auth-hero-kicker"><i /> Secure operations platform</span>
            <h2>One controlled view of every operation.</h2>
            <p>Inventory, procurement, logistics and stores — connected in one workspace.</p>
          </div>
          <div className="auth-hero-footer">
            <span>STOCKFLOW / 0{activeWorkspace + 1}</span>
            <div className="auth-hero-indicators">{workspaceScreens.map((item, index) => <b className={index === activeWorkspace ? "is-active" : ""} key={item.label} />)}</div>
          </div>
        </aside>
      </section>
    </main>
  );
}
