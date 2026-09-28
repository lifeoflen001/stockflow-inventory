import type { ApiEndpoint, QueryParams, RequestBody } from "@/types/api.ts";
import { emptyOperationsSnapshot } from "@/types/operations.ts";
import type { ManagedUser, Permission, Role, UserInvitation } from "@/types/admin.ts";

type JsonRecord = any;
type JsonList = JsonRecord[];

export interface DashboardStats {
  totalProducts: number;
  todayRevenue: number;
  todaySalesCount: number;
  pendingPOs: number;
  activeShipments: number;
  totalSuppliers: number;
  totalCustomers: number;
  lowStockCount: number;
  lowStockItems: Array<{
    product: { _id: string; name?: string; sku?: string; reorderLevel?: number };
    stock: { quantity: number };
  }>;
}

const emptyDashboardStats: DashboardStats = {
  totalProducts: 0,
  todayRevenue: 0,
  todaySalesCount: 0,
  pendingPOs: 0,
  activeShipments: 0,
  totalSuppliers: 0,
  totalCustomers: 0,
  lowStockCount: 0,
  lowStockItems: [],
};

const emptySalesReport = { totalRevenue: 0, totalTransactions: 0, avgOrderValue: 0, totalDiscount: 0, revenueByDay: [] as JsonList, topProducts: [] as JsonList, paymentMethods: [] as JsonList, cashierStats: [] as JsonList };
const emptyInventoryReport = { totalSkus: 0, totalCostValue: 0, totalRetailValue: 0, potentialProfit: 0, lowStockCount: 0, outOfStockCount: 0, valuationByCategory: [] as JsonList, productValuations: [] as JsonList, lowStockItems: [] as JsonList };
const emptyProcurementReport = { totalPOs: 0, totalSpend: 0, totalPaid: 0, totalOutstanding: 0, spendByDay: [] as JsonList, spendBySupplier: [] as JsonList, statusBreakdown: [] as JsonList };

const query = <T>(path: string, empty: T): ApiEndpoint<T, QueryParams> => ({ method: "GET", path, empty });
const mutation = <T = any>(method: "POST" | "PATCH" | "DELETE", path: string, empty = {} as T): ApiEndpoint<T, RequestBody> => ({ method, path, empty });

// REST route contracts. Adjust only these paths if the future backend uses a
// different convention; components and hooks remain backend-agnostic.
export const endpoints = {
  dashboard: {
    getStats: query("/dashboard/stats", emptyDashboardStats),
    getSalesChart: query("/dashboard/sales-chart", [] as JsonList),
    getRecentActivity: query("/dashboard/recent-activity", [] as JsonList),
    getTopProducts: query("/dashboard/top-products", [] as JsonList),
    getOperations: query("/dashboard/operations", emptyOperationsSnapshot),
  },
  search: {
    global: query("/search", { data: { results: [] as JsonList } }),
  },
  vehicles: {
    list: query("/vehicles", [] as JsonList),
    create: mutation("POST", "/vehicles"),
    update: mutation("PATCH", "/vehicles/:id"),
    remove: mutation("DELETE", "/vehicles/:id"),
  },
  workshopStaff: {
    list: query("/staff", [] as JsonList),
    create: mutation("POST", "/staff"),
    update: mutation("PATCH", "/staff/:id"),
    remove: mutation("DELETE", "/staff/:id"),
  },
  workshopIssues: {
    list: query("/workshop-issues", [] as JsonList),
    create: mutation("POST", "/workshop-issues"),
  },
  customers: {
    listCustomers: query("/customers", [] as JsonList),
    createCustomer: mutation("POST", "/customers"),
    updateCustomer: mutation("PATCH", "/customers/:id"),
    deleteCustomer: mutation("DELETE", "/customers/:id"),
  },
  suppliers: {
    listSuppliers: query("/suppliers", [] as JsonList),
    getProfile: query("/suppliers/:supplierId/profile", { supplier: null, contacts: [], commercialTerms: null, mappings: [], documents: [], transactions: [], stats: {} } as JsonRecord),
    createSupplier: mutation("POST", "/suppliers"),
    updateSupplier: mutation("PATCH", "/suppliers/:id"),
    deleteSupplier: mutation("DELETE", "/suppliers/:id"),
  },
  inventory: {
    listProducts: query("/products", [] as JsonList),
    listCategories: query("/categories", [] as JsonList),
    listUnits: query("/units", [] as JsonList),
    getStockAdjustments: query("/inventory/adjustments", [] as JsonList),
    getInventoryValuation: query("/inventory/valuation", { totalCostValue: 0, totalSellValue: 0, potentialProfit: 0, totalUnits: 0, totalProducts: 0, categoryBreakdown: [] as JsonList }),
    getProduct: query("/products/:id", null as JsonRecord),
    createProduct: mutation("POST", "/products"),
    updateProduct: mutation("PATCH", "/products/:id"),
    deleteProduct: mutation("DELETE", "/products/:id"),
    toggleProductActive: mutation("PATCH", "/products/:id/active"),
    adjustStock: mutation("POST", "/inventory/adjustments"),
    transferStock: mutation("POST", "/inventory/transfers"),
    listIssues: query("/inventory/issues", [] as JsonList),
    issueGoods: mutation("POST", "/inventory/issues"),
    listReplenishmentRequests: query("/replenishment-requests", [] as JsonList),
    createReplenishmentRequest: mutation("POST", "/replenishment-requests"),
    createCategory: mutation("POST", "/categories"),
    updateCategory: mutation("PATCH", "/categories/:id"),
    deleteCategory: mutation("DELETE", "/categories/:id"),
    createUnit: mutation("POST", "/units"),
    deleteUnit: mutation("DELETE", "/units/:id"),
  },
  priceLists: {
    list: query("/price-lists", [] as JsonList),
    get: query("/price-lists/:id", {} as JsonRecord),
    create: mutation("POST", "/price-lists"),
    update: mutation("PATCH", "/price-lists/:id"),
    delete: mutation("DELETE", "/price-lists/:id"),
    createItem: mutation("POST", "/price-lists/:priceListId/items"),
    updateItem: mutation("PATCH", "/price-lists/:priceListId/items/:itemId"),
    deleteItem: mutation("DELETE", "/price-lists/:priceListId/items/:itemId"),
  },
  warehouses: {
    listWarehouses: query("/warehouses", [] as JsonList),
    getWarehouseStock: query("/warehouses/:warehouseId/stock", [] as JsonList),
    getWarehouseStats: query("/warehouses/:warehouseId/stats", { totalSkus: 0, totalUnits: 0, totalValue: 0, lowStockCount: 0 }),
    createWarehouse: mutation("POST", "/warehouses"),
    updateWarehouse: mutation("PATCH", "/warehouses/:id"),
    deleteWarehouse: mutation("DELETE", "/warehouses/:id"),
  },
  warehouseLocator: {
    list: query("/warehouse-locator", { warehouse: null as JsonRecord, rows: [] as JsonList }),
    update: mutation("PATCH", "/warehouse-locator/:productId"),
  },
  departmentWorkspace: {
    get: query("/department-workspace", { department: null as JsonRecord, summary: {} as JsonRecord, orders: [] as JsonList, purchaseOrders: [] as JsonList }),
    createOrder: mutation("POST", "/department-workspace/orders"),
  },
  organizationStructure: {
    listCompanies: query("/companies", { data: [] as JsonList }), createCompany: mutation("POST", "/companies"), updateCompany: mutation("PATCH", "/companies/:id"), deleteCompany: mutation("DELETE", "/companies/:id"),
    listBranches: query("/branches", { data: [] as JsonList }), createBranch: mutation("POST", "/branches"), updateBranch: mutation("PATCH", "/branches/:id"), deleteBranch: mutation("DELETE", "/branches/:id"),
    listDepartments: query("/departments", { data: [] as JsonList }), createDepartment: mutation("POST", "/departments"), updateDepartment: mutation("PATCH", "/departments/:id"), deleteDepartment: mutation("DELETE", "/departments/:id"),
    listStorageLocations: query("/storage-locations", { data: { warehouses: [] as JsonList, stores: [] as JsonList } }), createStorageLocation: mutation("POST", "/storage-locations/:type"), updateStorageLocation: mutation("PATCH", "/storage-locations/:type/:id"), deleteStorageLocation: mutation("DELETE", "/storage-locations/:type/:id"),
  },
  announcements: {
    list: query("/announcements", { data: [] as JsonList }), get: query("/announcements/:id", { data: {} as JsonRecord }), create: mutation("POST", "/announcements"), update: mutation("PATCH", "/announcements/:id"), delete: mutation("DELETE", "/announcements/:id"),
  },
  notifications: {
    list: query("/notifications", { data: [] as JsonList, meta: { unread_count: 0 } }),
    markRead: mutation("PATCH", "/notifications/:id/read"),
    markAllRead: mutation("POST", "/notifications/read-all"),
    broadcast: mutation("POST", "/notifications/broadcast"),
    preferences: query("/notifications/preferences", [] as JsonList),
    updatePreference: mutation("PATCH", "/notifications/preferences/:eventType"),
    rules: query("/notifications/rules", [] as JsonList),
    updateRule: mutation("PATCH", "/notifications/rules/:eventType"),
  },
  sales: {
    listSales: query("/sales", [] as JsonList),
    getSale: query("/sales/:id", {} as JsonRecord),
    getDailySummary: query("/sales/daily-summary", {} as JsonRecord),
    createSale: mutation("POST", "/sales"),
  },
  procurement: {
    listPurchaseOrders: query("/purchase-orders", [] as JsonList),
    getPurchaseOrder: query("/purchase-orders/:id", {} as JsonRecord),
    getSupplierStats: query("/suppliers/:supplierId/stats", { totalOrders: 0, totalSpend: 0, totalPaid: 0, outstanding: 0 } as JsonRecord),
    createPurchaseOrder: mutation("POST", "/purchase-orders"),
    uploadPurchaseOrderDocument: mutation("POST", "/purchase-orders/:id/documents"),
    deletePurchaseOrderDocument: mutation("DELETE", "/purchase-orders/:id/documents/:documentId"),
    addPurchaseOrderComment: mutation("POST", "/purchase-orders/:id/comments"),
    updatePOStatus: mutation("PATCH", "/purchase-orders/:id/status"),
    receivePurchaseOrder: mutation("POST", "/purchase-orders/:id/receipts"),
    recordPayment: mutation("POST", "/purchase-orders/:id/payments"),
    listPettyCash: query("/petty-cash", [] as JsonList),
    getPettyCash: query("/petty-cash/:id", {} as JsonRecord),
    createPettyCash: mutation("POST", "/petty-cash"),
  },
  logistics: {
    listShipments: query("/shipments", [] as JsonList),
    getShipment: query("/shipments/:id", {} as JsonRecord),
    createShipment: mutation("POST", "/shipments"),
    updateShipmentStatus: mutation("PATCH", "/shipments/:id/status"),
  },
  reports: {
    getSalesReport: query("/reports/sales", emptySalesReport),
    getInventoryReport: query("/reports/stock", emptyInventoryReport),
    getProcurementReport: query("/reports/purchases", emptyProcurementReport),
    listTemplates: query("/reports/templates", [] as JsonList),
    getReport: query("/reports/:report", {} as JsonRecord),
  },
  users: { updateCurrentUser: mutation("POST", "/auth/sync") },
  account: {
    updateProfile: mutation("PATCH", "/account/profile"),
    changePassword: mutation("POST", "/account/password"),
    getSettings: query("/settings", { data: { name: "", settings: { currency: "TSHS", timezone: "Africa/Dar_es_Salaam", date_format: "d/m/Y", low_stock_notifications: true, email_notifications: true } } }), 
    updateSettings: mutation("PATCH", "/settings"),
    clearCache: mutation("POST", "/settings/cache/clear"),
    testEmail: mutation("POST", "/settings/email/test"),
    updateSection: mutation("PATCH", "/settings/:section"),
  },
  backups: {
    get: query("/backups", { data: { settings: { automatic: false, frequency: "weekly", retention_days: 30, email_copy: false, include_uploads: true, storage: "local" }, backups: [] as JsonList, last_backup: null } }),
    updateSettings: mutation("PATCH", "/backups/settings"),
    run: mutation("POST", "/backups"),
    delete: mutation("DELETE", "/backups/:id"),
  },
  administration: {
    acceptInvitation: mutation("POST", "/invitations/accept"),
    listUsers: query("/users", { data: [] as ManagedUser[] }),
    updateUser: mutation("PATCH", "/users/:id"),
    deleteUser: mutation("DELETE", "/users/:id"),
    listRoles: query("/roles", { data: { roles: [] as Role[], permissions: [] as Permission[] } }),
    createRole: mutation("POST", "/roles"),
    updateRole: mutation("PATCH", "/roles/:id"),
    deleteRole: mutation("DELETE", "/roles/:id"),
    listInvitations: query("/invitations", { data: [] as UserInvitation[] }),
    createInvitation: mutation<{ data: { invitation: UserInvitation; token?: string | null; message?: string } }>("POST", "/invitations"),
    revokeInvitation: mutation("POST", "/invitations/:id/revoke"),
  },
} as const;
