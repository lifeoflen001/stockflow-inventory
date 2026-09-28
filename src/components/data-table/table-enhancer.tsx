import { useEffect } from "react";

type TableState = {
  page: number;
  pageSize: number;
  hidden: Set<number>;
  total: number;
  signature: string;
  refresh: () => void;
};

const PAGE_SIZES = [10, 25, 50, 100];
let tableSequence = 0;

function readPreference(key: string): { pageSize?: number; hidden?: number[] } {
  try { return JSON.parse(window.localStorage.getItem(`stockflow:table:${key}`) ?? "{}"); } catch { return {}; }
}

function savePreference(key: string, state: TableState) {
  try { window.localStorage.setItem(`stockflow:table:${key}`, JSON.stringify({ pageSize: state.pageSize, hidden: [...state.hidden] })); } catch { /* storage may be unavailable */ }
}

function createButton(label: string, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = `data-table-button ${className}`;
  return button;
}

const icon = (path: string) => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="data-table-icon">${path}</svg>`;

function setButtonIcon(button: HTMLButtonElement, svg: string, label: string) {
  button.innerHTML = svg;
  button.title = label;
  button.setAttribute("aria-label", label);
}

function enhanceTable(table: HTMLTableElement) {
  if (table.dataset.noTableControls === "true" || table.dataset.tableEnhanced === "true") return;
  const headerCells = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead tr:first-child > th"));
  const firstRow = table.querySelector("tbody tr");
  const columnCount = headerCells.length || firstRow?.children.length || 0;
  if (!columnCount) return;

  const labels = Array.from({ length: columnCount }, (_, index) => headerCells[index]?.textContent?.trim() || `Column ${index + 1}`);
  const tableKey = `${window.location.pathname}:${labels.join("|")}`;
  const preference = readPreference(tableKey);
  const state: TableState = { page: 1, pageSize: PAGE_SIZES.includes(preference.pageSize ?? 10) ? preference.pageSize ?? 10 : 10, hidden: new Set((preference.hidden ?? []).filter((index) => index >= 0 && index < columnCount)), total: 0, signature: "", refresh: () => undefined };
  const tableId = `stockflow-table-${++tableSequence}`;
  const scope = `.${tableId}`;
  const parent = table.parentElement;
  if (!parent) return;
  const toolbarHost = parent.classList.contains("overflow-x-auto") && parent.parentElement ? parent.parentElement : parent;
  table.dataset.tableEnhanced = "true";
  table.classList.add(tableId);

  const toolbar = document.createElement("div");
  toolbar.className = "data-table-toolbar";
  const summary = document.createElement("span");
  summary.className = "data-table-summary";
  const right = document.createElement("div");
  right.className = "data-table-actions";
  const rowsLabel = document.createElement("label");
  rowsLabel.className = "data-table-page-size";
  rowsLabel.textContent = "Rows";
  const pageSize = document.createElement("select");
  pageSize.className = "data-table-select";
  pageSize.setAttribute("aria-label", "Rows per page");
  PAGE_SIZES.forEach((size) => { const option = document.createElement("option"); option.value = String(size); option.textContent = String(size); pageSize.appendChild(option); });
  pageSize.value = String(state.pageSize);
  rowsLabel.appendChild(pageSize);

  const columnsButton = createButton("Columns", "data-table-columns-toggle");
  setButtonIcon(columnsButton, icon('<path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 4v4M16 10v4M10 16v4"/>'), "Choose table columns");
  columnsButton.setAttribute("aria-haspopup", "menu");
  columnsButton.setAttribute("aria-expanded", "false");
  const columnsMenu = document.createElement("div");
  columnsMenu.className = "data-table-columns-menu";
  columnsMenu.setAttribute("role", "menu");
  columnsMenu.hidden = true;
  const menuTitle = document.createElement("p");
  menuTitle.className = "data-table-columns-title";
  menuTitle.textContent = "Visible columns";
  columnsMenu.appendChild(menuTitle);
  const columnChecks: HTMLInputElement[] = [];
  labels.forEach((label, index) => {
    const item = document.createElement("label");
    item.className = "data-table-column-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !state.hidden.has(index);
    checkbox.dataset.columnIndex = String(index);
    item.append(checkbox, document.createTextNode(label));
    columnsMenu.appendChild(item);
    columnChecks.push(checkbox);
  });
  const resetButton = createButton("", "data-table-reset");
  setButtonIcon(resetButton, icon('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'), "Reset columns");
  resetButton.addEventListener("click", () => { state.hidden.clear(); columnChecks.forEach((checkbox) => { checkbox.checked = true; }); state.refresh(); });
  columnsMenu.appendChild(resetButton);
  const closeColumnsMenu = () => {
    columnsMenu.hidden = true;
    columnsButton.classList.remove("is-open");
    columnsButton.setAttribute("aria-expanded", "false");
  };
  columnsButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = columnsMenu.hidden === true;
    columnsMenu.hidden = !open;
    columnsButton.classList.toggle("is-open", open);
    columnsButton.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (event) => { if (!columnsMenu.contains(event.target as Node) && event.target !== columnsButton) closeColumnsMenu(); }, { once: false });

  const previous = createButton("");
  const next = createButton("");
  setButtonIcon(previous, icon('<path d="m15 18-6-6 6-6"/>'), "Previous page");
  setButtonIcon(next, icon('<path d="m9 18 6-6-6-6"/>'), "Next page");
  const pageText = document.createElement("span");
  pageText.className = "data-table-page-text";
  previous.addEventListener("click", () => { state.page = Math.max(1, state.page - 1); state.refresh(); });
  next.addEventListener("click", () => { state.page += 1; state.refresh(); });
  pageSize.addEventListener("change", () => { state.pageSize = Number(pageSize.value); state.page = 1; state.refresh(); });
  columnChecks.forEach((checkbox) => checkbox.addEventListener("change", () => {
    const index = Number(checkbox.dataset.columnIndex);
    if (!checkbox.checked && columnChecks.filter((item) => item.checked).length === 0) { checkbox.checked = true; return; }
    if (checkbox.checked) state.hidden.delete(index); else state.hidden.add(index);
    state.refresh();
  }));

  const rowsIcon = document.createElement("span");
  rowsIcon.innerHTML = icon('<path d="M4 6h16M4 12h16M4 18h16"/>');
  rowsIcon.title = "Rows per page";
  rowsIcon.setAttribute("aria-label", "Rows per page");
  rowsLabel.textContent = "";
  rowsLabel.append(rowsIcon, pageSize);
  right.append(rowsLabel, columnsButton, previous, pageText, next);
  toolbar.append(summary, right, columnsMenu);
  toolbarHost.insertBefore(toolbar, parent);

  const style = document.createElement("style");
  document.head.appendChild(style);

  state.refresh = () => {
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody > tr"));
    const signature = rows.map((row) => row.textContent ?? "").join("\u001f");
    if (state.signature && signature !== state.signature) state.page = 1;
    state.signature = signature;
    state.total = rows.length;
    const pageCount = Math.max(1, Math.ceil(state.total / state.pageSize));
    state.page = Math.min(state.page, pageCount);
    const start = state.total === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
    const end = Math.min(state.page * state.pageSize, state.total);
    summary.textContent = state.total ? `Showing ${start.toLocaleString()} to ${end.toLocaleString()} of ${state.total.toLocaleString()}` : "No records";
    pageText.textContent = `Page ${state.page} of ${pageCount}`;
    previous.disabled = state.page <= 1;
    next.disabled = state.page >= pageCount;
    rows.forEach((row) => Array.from(row.children).forEach((cell, index) => { (cell as HTMLElement).style.display = state.hidden.has(index) ? "none" : ""; }));
    Array.from(table.querySelectorAll("thead tr > th")).forEach((cell, index) => { (cell as HTMLElement).style.display = state.hidden.has(index) ? "none" : ""; });
    style.textContent = `${scope} tbody > tr { display: none; } ${state.total ? `${scope} tbody > tr:nth-child(n+${start}):nth-child(-n+${end}) { display: table-row; }` : ""} ${[...state.hidden].map((index) => `${scope} th:nth-child(${index + 1}), ${scope} td:nth-child(${index + 1}) { display: none; }`).join(" ")}`;
    savePreference(tableKey, state);
  };
  state.refresh();
  (table as HTMLTableElement & { __stockflowTableState?: TableState }).__stockflowTableState = state;
}

function enhanceTables() {
  document.querySelectorAll<HTMLTableElement>("table").forEach(enhanceTable);
  document.querySelectorAll<HTMLTableElement>("table[data-table-enhanced='true']").forEach((table) => (table as HTMLTableElement & { __stockflowTableState?: TableState }).__stockflowTableState?.refresh());
}

export function TableEnhancer() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => { window.cancelAnimationFrame(frame); frame = window.requestAnimationFrame(enhanceTables); };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame); };
  }, []);
  return null;
}
