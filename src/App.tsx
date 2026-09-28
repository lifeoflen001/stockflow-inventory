import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import AppLayout from "./pages/layout/AppLayout.tsx";
import { PageContentLoader } from "./components/ui/page-loader.tsx";
import { RouteErrorBoundary } from "./components/errors/route-error-boundary.tsx";
import { useAuth } from "./hooks/use-auth.ts";

const AuthCallback = lazy(() => import("./pages/auth/callback.tsx"));
const RegisterPage = lazy(() => import("./pages/auth/register.tsx"));
const VerifyEmailPage = lazy(() => import("./pages/auth/verify-email.tsx"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/forgot-password.tsx"));
const ResetPasswordPage = lazy(() => import("./pages/auth/reset-password.tsx"));
const AcceptInvitationPage = lazy(() => import("./pages/auth/accept-invitation.tsx"));
const Dashboard = lazy(() => import("./pages/dashboard/page.tsx"));
const InventoryPage = lazy(() => import("./pages/inventory/page.tsx"));
const PriceListsPage = lazy(() => import("./pages/price-lists/page.tsx"));
const POSPage = lazy(() => import("./pages/pos/page.tsx"));
const ProcurementPage = lazy(() => import("./pages/procurement/page.tsx"));
const PurchaseOrderDetailsPage = lazy(() => import("./pages/procurement/details.tsx"));
const SuppliersPage = lazy(() => import("./pages/suppliers/page.tsx"));
const SupplierProfilePage = lazy(() => import("./pages/suppliers/profile.tsx"));
const SupplierDocumentsPage = lazy(() => import("./pages/suppliers/documents.tsx"));
const SupplierPortalPage = lazy(() => import("./pages/supplier-portal/page.tsx"));
const SupplierCatalogPage = lazy(() => import("./pages/supplier-portal/catalog.tsx"));
const CustomersPage = lazy(() => import("./pages/customers/page.tsx"));
const LogisticsPage = lazy(() => import("./pages/logistics/page.tsx"));
const PettyCashPage = lazy(() => import("./pages/petty-cash/page.tsx"));
const PettyCashDetailsPage = lazy(() => import("./pages/petty-cash/details.tsx"));
const WorkshopIssuesPage = lazy(() => import("./pages/workshop-issues/page.tsx"));
const VehiclesPage = lazy(() => import("./pages/vehicles/page.tsx"));
const StaffPage = lazy(() => import("./pages/staff/page.tsx"));
const WarehousesPage = lazy(() => import("./pages/warehouses/page.tsx"));
const WarehouseLocatorPage = lazy(() => import("./pages/warehouse-locator/page.tsx"));
const DepartmentWorkspacePage = lazy(() => import("./pages/department-workspace/page.tsx"));
const DepartmentAssignmentsPage = lazy(() => import("./pages/department-assignments/page.tsx"));
const UserAccessPage = lazy(() => import("./pages/user-access/page.tsx"));
const SalesHistoryPage = lazy(() => import("./pages/sales/page.tsx"));
const ReportsPage = lazy(() => import("./pages/reports/page.tsx"));
const UsersManagementPage = lazy(() => import("./pages/users/page.tsx"));
const RolesPage = lazy(() => import("./pages/roles/page.tsx"));
const ProfilePage = lazy(() => import("./pages/profile/page.tsx"));
const SettingsPage = lazy(() => import("./pages/settings/page.tsx"));
const PoliciesPage = lazy(() => import("./pages/policies/page.tsx"));
const MediaLibraryPage = lazy(() => import("./pages/media/page.tsx"));
const CalendarPage = lazy(() => import("./pages/calendar/page.tsx"));
const OrganizationStructurePage = lazy(() => import("./pages/organization/page.tsx"));
const AnnouncementsPage = lazy(() => import("./pages/announcements/page.tsx"));
const AnnouncementDetailsPage = lazy(() => import("./pages/announcements/details.tsx"));
const SearchPage = lazy(() => import("./pages/search/page.tsx"));
const NotificationsPage = lazy(() => import("./pages/notifications/page.tsx"));
const OfflineSyncPage = lazy(() => import("./pages/offline-sync/page.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

function PageLoader() {
  const { pathname } = useLocation();
  const variant = pathname === "/" ? "dashboard" : ["/warehouses", "/pos"].some((path) => pathname.startsWith(path)) ? "cards" : ["/procurement/", "/workshop-issues"].some((path) => pathname.startsWith(path)) ? "detail" : "table";
  return <PageContentLoader variant={variant} />;
}

function PermissionGate({ permission, children }: { permission: string | string[]; children: ReactNode }) {
  const { user } = useAuth();
  const required = Array.isArray(permission) ? permission : [permission];
  const allowed = user?.role === "super_admin" || required.some((item) => user?.permissions.includes(item));
  return allowed ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <DefaultProviders>
      <BrowserRouter>
        <RouteErrorBoundary><Suspense fallback={<PageLoader />}><Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<PermissionGate permission="inventory.view"><InventoryPage /></PermissionGate>} />
            <Route path="/price-lists" element={<PermissionGate permission="master_data.manage"><PriceListsPage /></PermissionGate>} />
            <Route path="/pos" element={<PermissionGate permission="sales.create"><POSPage /></PermissionGate>} />
            <Route path="/sales" element={<PermissionGate permission="sales.view"><SalesHistoryPage /></PermissionGate>} />
            <Route path="/procurement" element={<PermissionGate permission="purchase_orders.view"><ProcurementPage /></PermissionGate>} />
            <Route path="/procurement/:id" element={<PermissionGate permission="purchase_orders.view"><PurchaseOrderDetailsPage /></PermissionGate>} />
            <Route path="/supplier-portal" element={<PermissionGate permission="supplier_orders.view"><SupplierPortalPage /></PermissionGate>} />
            <Route path="/supplier-portal/catalog" element={<PermissionGate permission="supplier_catalog.manage"><SupplierCatalogPage /></PermissionGate>} />
            <Route path="/supplier-portal/purchase-orders/:id" element={<PermissionGate permission="supplier_orders.view"><PurchaseOrderDetailsPage /></PermissionGate>} />
            <Route path="/suppliers" element={<PermissionGate permission="suppliers.view"><SuppliersPage /></PermissionGate>} />
            <Route path="/suppliers/:id" element={<PermissionGate permission="suppliers.view"><SupplierProfilePage /></PermissionGate>} />
            <Route path="/suppliers/:id/documents" element={<PermissionGate permission={["suppliers.view", "supplier_documents.upload"]}><SupplierDocumentsPage /></PermissionGate>} />
            <Route path="/customers" element={<PermissionGate permission="customers.view"><CustomersPage /></PermissionGate>} />
            <Route path="/logistics" element={<PermissionGate permission="logistics.view"><LogisticsPage /></PermissionGate>} />
            <Route path="/petty-cash/:id" element={<PermissionGate permission="petty_cash.view"><PettyCashDetailsPage /></PermissionGate>} />
            <Route path="/petty-cash" element={<PermissionGate permission="petty_cash.view"><PettyCashPage /></PermissionGate>} />
            <Route path="/workshop-issues" element={<PermissionGate permission="workshop.issues.view"><WorkshopIssuesPage /></PermissionGate>} />
            <Route path="/vehicles" element={<PermissionGate permission="vehicles.view"><VehiclesPage /></PermissionGate>} />
            <Route path="/staff" element={<PermissionGate permission="staff.view"><StaffPage /></PermissionGate>} />
            <Route path="/warehouses" element={<PermissionGate permission="locations.view"><WarehousesPage /></PermissionGate>} />
            <Route path="/warehouse-locator" element={<PermissionGate permission="warehouse_locator.view"><WarehouseLocatorPage /></PermissionGate>} />
            <Route path="/department-workspace" element={<PermissionGate permission="department.view"><DepartmentWorkspacePage /></PermissionGate>} />
            <Route path="/department-assignments" element={<PermissionGate permission="users.manage"><DepartmentAssignmentsPage /></PermissionGate>} />
            <Route path="/user-access" element={<PermissionGate permission="users.manage"><UserAccessPage /></PermissionGate>} />
            <Route path="/reports" element={<PermissionGate permission="reports.view"><ReportsPage /></PermissionGate>} />
            <Route path="/users" element={<PermissionGate permission="users.view"><UsersManagementPage /></PermissionGate>} />
            <Route path="/roles" element={<PermissionGate permission="users.view"><RolesPage /></PermissionGate>} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<PermissionGate permission="users.manage"><SettingsPage /></PermissionGate>} />
            <Route path="/policies" element={<PoliciesPage />} />
            <Route path="/media" element={<PermissionGate permission="media.view"><MediaLibraryPage /></PermissionGate>} />
            <Route path="/calendar" element={<PermissionGate permission={["calendar.view", "locations.view"]}><CalendarPage /></PermissionGate>} />
            <Route path="/companies" element={<PermissionGate permission="locations.view"><OrganizationStructurePage /></PermissionGate>} />
            <Route path="/branches" element={<PermissionGate permission="locations.view"><OrganizationStructurePage /></PermissionGate>} />
            <Route path="/departments" element={<PermissionGate permission={["departments.view", "locations.view"]}><OrganizationStructurePage /></PermissionGate>} />
            <Route path="/storage-locations" element={<PermissionGate permission="locations.view"><OrganizationStructurePage /></PermissionGate>} />
            <Route path="/announcements" element={<PermissionGate permission="announcements.view"><AnnouncementsPage /></PermissionGate>} />
            <Route path="/announcements/:id" element={<PermissionGate permission="announcements.view"><AnnouncementDetailsPage /></PermissionGate>} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/offline-sync" element={<PermissionGate permission={["inventory.view", "stock.count", "stock.issue", "stock.adjust", "stock.transfer.dispatch"]}><OfflineSyncPage /></PermissionGate>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes></Suspense></RouteErrorBoundary>
      </BrowserRouter>
    </DefaultProviders>
  );
}
