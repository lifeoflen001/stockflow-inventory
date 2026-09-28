export type OperationalRole = "super_admin" | "procurement_manager" | "procurement_officer" | "store_keeper" | "department_manager" | "accountant" | "supplier";

export type GoodsFlowStage =
  | "requisition"
  | "approval"
  | "purchase_order"
  | "supplier_dispatch"
  | "goods_receipt"
  | "inspection"
  | "stock_posting";

export interface OperationalMetric {
  key: string;
  value: number;
  change?: number;
}

export interface GoodsFlowStageSummary {
  stage: GoodsFlowStage;
  count: number;
  delayed: number;
}

export interface WorkQueueItem {
  id: string;
  reference: string;
  title: string;
  supplier?: string;
  location?: string;
  status: string;
  priority: "low" | "normal" | "high" | "critical";
  amount?: number;
  dueAt?: string;
  nextAction?: string;
}

export interface OperationsActivity {
  id: string;
  actor: string;
  action: string;
  reference: string;
  occurredAt: string;
  stage: GoodsFlowStage;
}

export interface AutomationStatus {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "failed";
  runsToday: number;
  lastRunAt?: string;
}

export interface OperationsCharts {
  purchaseOrderStatus: Array<{ name: string; value: number }>;
  stockStatus: Array<{ name: string; value: number }>;
  stockByLocation: Array<{ name: string; value: number }>;
  movementTrend: Array<{ date: string; received: number; issued: number; transferred: number; adjusted: number }>;
}

export interface OperationsDashboardSnapshot {
  generatedAt: string | null;
  department?: { id: string; name: string; code: string; branch?: string | null } | null;
  metrics: OperationalMetric[];
  summary: {
    inventoryValue: number;
    inventoryUnits: number;
    lowStockItems: number;
    outOfStockItems: number;
    expectedReceipts: number;
    receiptsToday: number;
    issuesToday: number;
    transfersToday: number;
    adjustmentsToday: number;
    spendMtd?: number;
    spendYtd?: number;
    openPurchaseOrderValue?: number;
    overdueDeliveryValue?: number;
    pendingApprovalCount?: number;
    departmentName?: string;
    departmentCode?: string;
    departmentBranch?: string;
    departmentTotalOrders?: number;
    departmentPendingOrders?: number;
    departmentApprovedOrders?: number;
    departmentOpenPurchaseOrders?: number;
    departmentReceivedOrders?: number;
    departmentCommittedSpend?: number;
    departmentOverdueCount?: number;
    totalPurchaseOrders?: number;
    pendingManagerApprovalCount?: number;
    pendingPaymentVerificationCount?: number;
    verifiedPaymentsMtd?: number;
    outstandingPaymentValue?: number;
  };
  warehouseComparison: Array<{ id: number; name: string; units: number; value: number }>;
  supplierPerformance: Array<{ name: string; orders: number; spend: number; overdue: number }>;
  flow: GoodsFlowStageSummary[];
  workQueue: WorkQueueItem[];
  exceptions: WorkQueueItem[];
  activity: OperationsActivity[];
  automations: AutomationStatus[];
  charts: OperationsCharts;
}

export const emptyOperationsSnapshot: OperationsDashboardSnapshot = {
  generatedAt: null,
  metrics: [],
  summary: { inventoryValue: 0, inventoryUnits: 0, lowStockItems: 0, outOfStockItems: 0, expectedReceipts: 0, receiptsToday: 0, issuesToday: 0, transfersToday: 0, adjustmentsToday: 0 },
  warehouseComparison: [],
  supplierPerformance: [],
  flow: [
    { stage: "requisition", count: 0, delayed: 0 },
    { stage: "approval", count: 0, delayed: 0 },
    { stage: "purchase_order", count: 0, delayed: 0 },
    { stage: "supplier_dispatch", count: 0, delayed: 0 },
    { stage: "goods_receipt", count: 0, delayed: 0 },
    { stage: "inspection", count: 0, delayed: 0 },
    { stage: "stock_posting", count: 0, delayed: 0 },
  ],
  workQueue: [],
  exceptions: [],
  activity: [],
  automations: [],
  charts: { purchaseOrderStatus: [], stockStatus: [], stockByLocation: [], movementTrend: [] },
};
