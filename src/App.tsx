import { useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Bell,
  Boxes,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  CloudDownload,
  FileCheck2,
  FileText,
  Filter,
  Gauge,
  History,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  LogOut,
  Map,
  Menu,
  MoreHorizontal,
  PackageCheck,
  PackageOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Truck,
  UserRound,
  Warehouse,
  X,
  XCircle,
} from "lucide-react";

type PageKey =
  | "dashboard"
  | "receipts"
  | "inventory"
  | "orders"
  | "picking"
  | "vehicles"
  | "routes"
  | "deliveries"
  | "haccp"
  | "nc"
  | "tasks"
  | "traceability"
  | "reports"
  | "audit"
  | "settings";

type Status = "success" | "warning" | "danger" | "neutral" | "info";

type UserRole = "management" | "warehouse" | "driver";

type AppUser = {
  id: string;
  username: string;
  initials: string;
  firstName: string;
  name: string;
  role: UserRole;
  roleLabel: string;
  facility: string;
};

type Notice = {
  id: number;
  title: string;
  body: string;
  tone: Status;
  icon: "temperature" | "lot" | "vehicle" | "task";
  time: string;
};

type Receipt = {
  id: string;
  supplier: string;
  document: string;
  date: string;
  items: string;
  value: string;
  status: string;
  statusTone: Status;
};

type InventoryRow = {
  id: string;
  product: string;
  sku: string;
  lot: string;
  location: string;
  qty: string;
  reserved: string;
  expiry: string;
  status: string;
  statusTone: Status;
};

const navGroups = [
  {
    label: "Pregled",
    items: [{ key: "dashboard" as PageKey, label: "Kontrolni centar", icon: LayoutDashboard }],
  },
  {
    label: "Operacije",
    items: [
      { key: "receipts" as PageKey, label: "Prijem robe", icon: ArrowDownToLine, count: "2" },
      { key: "inventory" as PageKey, label: "Zalihe", icon: Boxes },
      { key: "orders" as PageKey, label: "Porudžbine", icon: ClipboardCheck, count: "8" },
      { key: "picking" as PageKey, label: "Picking", icon: PackageOpen },
      { key: "vehicles" as PageKey, label: "Vozila", icon: Truck },
      { key: "routes" as PageKey, label: "Rute", icon: Map },
      { key: "deliveries" as PageKey, label: "Isporuke", icon: PackageCheck },
    ],
  },
  {
    label: "Kvalitet",
    items: [
      { key: "haccp" as PageKey, label: "HACCP / DHP", icon: Gauge, count: "3" },
      { key: "nc" as PageKey, label: "Neusaglašenosti", icon: AlertTriangle, count: "3" },
      { key: "tasks" as PageKey, label: "Zadaci", icon: ListChecks, count: "5" },
    ],
  },
  {
    label: "Analitika",
    items: [
      { key: "traceability" as PageKey, label: "Sledljivost", icon: History },
      { key: "reports" as PageKey, label: "Izveštaji", icon: BarChart3 },
      { key: "audit" as PageKey, label: "Audit trail", icon: FileCheck2 },
    ],
  },
];

const roleAccess: Record<UserRole, PageKey[]> = {
  management: ["dashboard", "receipts", "inventory", "orders", "picking", "vehicles", "routes", "deliveries", "haccp", "nc", "tasks", "traceability", "reports", "audit", "settings"],
  warehouse: ["dashboard", "receipts", "inventory", "picking", "haccp", "tasks"],
  driver: ["dashboard", "vehicles", "routes", "deliveries", "tasks"],
};

const appUsers: AppUser[] = [
  { id: "marko", username: "marko", initials: "MP", firstName: "Marko", name: "Marko Petrović", role: "management", roleLabel: "Odgovorno lice", facility: "Centralni magacin" },
  { id: "nikola", username: "nikola", initials: "NV", firstName: "Nikola", name: "Nikola Vuković", role: "warehouse", roleLabel: "Magacioner", facility: "Centralni magacin" },
  { id: "petar", username: "petar", initials: "PJ", firstName: "Petar", name: "Petar Janković", role: "driver", roleLabel: "Vozač", facility: "Distribucija · Ruta 091" },
];

const loginCredentials: Record<string, string> = {
  marko: "Marko#2026",
  nikola: "Nikola#2026",
  petar: "Petar#2026",
};

const authStorageKey = "pilot-distributeri-active-user";

const noticesSeed: Notice[] = [
  {
    id: 1,
    title: "Temperatura van opsega",
    body: "Komora K-02 · 8.6°C (limit 0–5°C)",
    tone: "danger",
    icon: "temperature",
    time: "pre 12 min",
  },
  {
    id: 2,
    title: "LOT na HOLD statusu",
    body: "LOT-2024-0821 · Vindija ABC jogurt",
    tone: "warning",
    icon: "lot",
    time: "pre 38 min",
  },
  {
    id: 3,
    title: "Vozilo nije spremno",
    body: "PG CG 412 · Kontrola čistoće nije prošla",
    tone: "warning",
    icon: "vehicle",
    time: "pre 1 h",
  },
  {
    id: 4,
    title: "Zadatak je istekao",
    body: "Provera rashladne komore K-01",
    tone: "danger",
    icon: "task",
    time: "juče",
  },
];

const receiptsSeed: Receipt[] = [
  { id: "PR-240821-04", supplier: "Frikom d.o.o.", document: "FR-88412", date: "19. sep 2026. · 08:40", items: "12 stavki", value: "€ 3.842,20", status: "Čeka odluku", statusTone: "warning" },
  { id: "PR-240821-03", supplier: "Imlek a.d.", document: "IM-22891", date: "19. sep 2026. · 07:55", items: "8 stavki", value: "€ 1.926,40", status: "U kontroli", statusTone: "info" },
  { id: "PR-240820-12", supplier: "Mlekara Šabac", document: "MS-11082", date: "18. sep 2026. · 15:25", items: "16 stavki", value: "€ 4.120,00", status: "Prihvaćen", statusTone: "success" },
  { id: "PR-240820-11", supplier: "Atlantic Grupa", document: "AT-90118", date: "18. sep 2026. · 11:10", items: "24 stavke", value: "€ 2.740,55", status: "Delimično prihvaćen", statusTone: "warning" },
];

const inventorySeed: InventoryRow[] = [
  { id: "1", product: "Jogurt 2.8% 1kg", sku: "MLK-001", lot: "LOT-2024-0821", location: "K-02 · A-14", qty: "1.248", reserved: "240", expiry: "28. sep 2026.", status: "HOLD", statusTone: "warning" },
  { id: "2", product: "Smrznuti grašak 450g", sku: "FRZ-018", lot: "LOT-2024-0819", location: "Z-01 · B-03", qty: "860", reserved: "120", expiry: "14. jan 2027.", status: "Dostupno", statusTone: "success" },
  { id: "3", product: "Pileći file 500g", sku: "MES-042", lot: "LOT-2024-0820", location: "K-01 · C-08", qty: "426", reserved: "426", expiry: "24. sep 2026.", status: "Rezervisano", statusTone: "info" },
  { id: "4", product: "Maslinovo ulje 1L", sku: "ULJ-006", lot: "LOT-2024-0802", location: "S-02 · A-02", qty: "312", reserved: "0", expiry: "19. avg 2027.", status: "Dostupno", statusTone: "success" },
  { id: "5", product: "Sir Edamer 250g", sku: "MLK-022", lot: "LOT-2024-0817", location: "K-02 · B-10", qty: "180", reserved: "60", expiry: "30. sep 2026.", status: "Dostupno", statusTone: "success" },
];

const orders = [
  { no: "POR-260919-018", customer: "Hotel Splendid", city: "Budva", items: "14", total: "€ 1.842,80", status: "Čeka picking", tone: "warning", delivery: "Danas, 10:30" },
  { no: "POR-260919-017", customer: "Voli Trade", city: "Podgorica", items: "26", total: "€ 3.140,20", status: "Rezervisano", tone: "info", delivery: "Danas, 11:15" },
  { no: "POR-260919-016", customer: "Restoran Galion", city: "Kotor", items: "8", total: "€ 620,50", status: "U isporuci", tone: "success", delivery: "Danas, 09:45" },
  { no: "POR-260919-015", customer: "Aroma market 04", city: "Cetinje", items: "19", total: "€ 1.922,10", status: "Nova", tone: "neutral", delivery: "Danas, 13:00" },
];

const audits = [
  { time: "09:42", user: "Marko Petrović", action: "Potvrđen prijem robe", entity: "PR-240820-12", event: "EVT-014", tone: "success" },
  { time: "09:30", user: "Jelena Jovanović", action: "Kreirana neusaglašenost", entity: "NC-260919-003", event: "EVT-007", tone: "danger" },
  { time: "09:12", user: "Nikola Vuković", action: "Pokrenut picking", entity: "PK-260919-008", event: "EVT-024", tone: "info" },
  { time: "08:55", user: "Ana Marković", action: "Merenje temperature", entity: "K-02 / 8.6°C", event: "EVT-006", tone: "warning" },
  { time: "08:40", user: "Marko Petrović", action: "Započet prijem", entity: "PR-240821-04", event: "EVT-009", tone: "neutral" },
];

const navTitle: Record<PageKey, string> = {
  dashboard: "Kontrolni centar",
  receipts: "Prijem robe",
  inventory: "Zalihe",
  orders: "Porudžbine",
  picking: "Picking",
  vehicles: "Vozila",
  routes: "Rute",
  deliveries: "Isporuke",
  haccp: "HACCP / DHP",
  nc: "Neusaglašenosti",
  tasks: "Zadaci",
  traceability: "Sledljivost",
  reports: "Izveštaji",
  audit: "Audit trail",
  settings: "Podešavanja",
};

function App() {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    const storedUserId = window.sessionStorage.getItem(authStorageKey);
    return appUsers.find((user) => user.id === storedUserId) || null;
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notices, setNotices] = useState(noticesSeed);
  const [receipts, setReceipts] = useState(receiptsSeed);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");

  if (!currentUser) {
    return <LoginScreen users={appUsers} onLogin={(user) => { window.sessionStorage.setItem(authStorageKey, user.id); setCurrentUser(user); setPage("dashboard"); }} />;
  }

  const unread = notices.length;
  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const handleAction = (message: string) => showToast(message);
  const clearNotice = (id: number) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
    showToast("Obaveštenje je označeno kao rešeno");
  };

  const activeLabel = navTitle[page];
  const visibleNavGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => roleAccess[currentUser.role].includes(item.key)) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "is-open" : "is-collapsed"}`}>
        <div className="brand">
          <div className="brand-mark"><span>P</span></div>
          {sidebarOpen && <div className="brand-copy"><strong>PILOT</strong><span>DISTRIBUTERI CG</span></div>}
        </div>
        <div className="facility-switcher">
          <div className="facility-icon"><Warehouse size={17} /></div>
          {sidebarOpen && <div className="facility-copy"><span>Aktivni objekat</span><strong>{currentUser.facility}</strong></div>}
          {sidebarOpen && <ChevronDown size={15} className="muted-icon" />}
        </div>
        <nav className="main-nav">
          {visibleNavGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              {sidebarOpen && <p className="nav-label">{group.label}</p>}
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.key} className={`nav-item ${page === item.key ? "active" : ""}`} onClick={() => setPage(item.key)} title={!sidebarOpen ? item.label : undefined}>
                    <Icon size={18} strokeWidth={page === item.key ? 2.3 : 1.8} />
                    {sidebarOpen && <span>{item.label}</span>}
                    {sidebarOpen && item.count && <span className="nav-count">{item.count}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {roleAccess[currentUser.role].includes("settings") && <button className={`nav-item ${page === "settings" ? "active" : ""}`} onClick={() => setPage("settings")} title={!sidebarOpen ? "Podešavanja" : undefined}>
            <Settings2 size={18} /><span>{sidebarOpen && "Podešavanja"}</span>
          </button>}
          {sidebarOpen && <div className="sidebar-status"><span className="status-dot"></span><span>Sistem operativan</span><span className="status-version">v0.1</span></div>}
        </div>
        <button className="sidebar-toggle" onClick={() => setSidebarOpen((open) => !open)} aria-label="Sakrij meni">
          {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setSidebarOpen((open) => !open)}><Menu size={20} /></button>
            <div className="breadcrumb"><span>{currentUser.facility}</span><ArrowRight size={13} /><strong>{activeLabel}</strong></div>
          </div>
          <div className="topbar-actions">
            <div className="operational-pill"><span className="status-dot"></span><span className="operational-label">Operativni dan</span><strong>19. sep 2026.</strong></div>
            <div className="notification-wrap">
              <button className={`icon-button ${notificationsOpen ? "selected" : ""}`} onClick={() => setNotificationsOpen((open) => !open)} aria-label="Obaveštenja">
                <Bell size={18} />{unread > 0 && <span className="notification-dot">{unread}</span>}
              </button>
              {notificationsOpen && <NotificationPanel notices={notices} onClear={clearNotice} />}
            </div>
            <div className="user-menu-wrap">
              <button className="user-menu user-menu-button" onClick={() => setUserMenuOpen((open) => !open)}>
                <div className={`avatar ${currentUser.role}`}>{currentUser.initials}</div>
                <div className="user-copy"><strong>{currentUser.name}</strong><span>{currentUser.roleLabel}</span></div>
                <ChevronDown size={15} className={`muted-icon ${userMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {userMenuOpen && <UserAccountMenu currentUser={currentUser} onLogout={() => { window.sessionStorage.removeItem(authStorageKey); setCurrentUser(null); setUserMenuOpen(false); setNotificationsOpen(false); }} />}
            </div>
          </div>
        </header>
        <div className="page-content">
          {page === "dashboard" && <Dashboard currentUser={currentUser} onNavigate={setPage} onAction={handleAction} />}
          {page === "receipts" && <ReceiptsPage receipts={receipts} onAction={handleAction} onAccept={(id) => { setReceipts((all) => all.map((receipt) => receipt.id === id ? { ...receipt, status: "Prihvaćen", statusTone: "success" } : receipt)); showToast("Prijem je prihvaćen i evidentiran u audit trail-u"); }} />}
          {page === "inventory" && <InventoryPage search={search} setSearch={setSearch} onAction={handleAction} />}
          {page === "orders" && <OrdersPage onAction={handleAction} />}
          {page === "picking" && <PickingPage onAction={handleAction} />}
          {page === "vehicles" && <VehiclesPage onAction={handleAction} />}
          {page === "routes" && <RoutesPage onAction={handleAction} />}
          {page === "deliveries" && <DeliveriesPage onAction={handleAction} />}
          {page === "haccp" && <HaccpPage onAction={handleAction} />}
          {page === "nc" && <NcPage onAction={handleAction} />}
          {page === "tasks" && <TasksPage onAction={handleAction} />}
          {page === "traceability" && <TraceabilityPage onAction={handleAction} />}
          {page === "reports" && <ReportsPage onAction={handleAction} />}
          {page === "audit" && <AuditPage />}
          {page === "settings" && <SettingsPage onAction={handleAction} />}
        </div>
      </main>
      {toast && <div className="toast"><CheckCircle2 size={17} />{toast}</div>}
    </div>
  );
}

function PageHeader({ eyebrow, title, description, action, actionLabel, onAction }: { eyebrow?: string; title: string; description?: string; action?: boolean; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="page-header">
      <div><div className="eyebrow">{eyebrow || "Operativni pregled"}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {action && <button className="primary-button" onClick={onAction}><Plus size={16} />{actionLabel || "Nova stavka"}</button>}
    </div>
  );
}

function LoginScreen({ users, onLogin }: { users: AppUser[]; onLogin: (user: AppUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const user = users.find((candidate) => candidate.username === username.trim().toLowerCase());
    if (!user || loginCredentials[user.username] !== password) {
      setError("Korisničko ime ili lozinka nisu ispravni.");
      return;
    }
    setError("");
    onLogin(user);
  };

  const fillCredentials = (user: AppUser) => {
    setUsername(user.username);
    setPassword(loginCredentials[user.username]);
    setError("");
  };

  return <div className="auth-shell">
    <div className="auth-card">
      <div className="auth-brand"><div className="brand-mark"><span>P</span></div><div className="brand-copy"><strong>PILOT</strong><span>DISTRIBUTERI CG</span></div></div>
      <div className="auth-heading"><div className="auth-lock"><LockKeyhole size={19} /></div><div><div className="eyebrow">Bezbedan pristup sistemu</div><h1>Prijava u PILOT</h1><p>Unesite svoje kredencijale. Nakon prijave videćete samo radni prostor svoje uloge.</p></div></div>
      <form className="auth-form" onSubmit={submit}>
        <label>Korisničko ime<input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="npr. nikola" autoComplete="username" autoFocus /></label>
        <label>Lozinka<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Unesite lozinku" autoComplete="current-password" /></label>
        {error && <div className="auth-error"><AlertCircle size={15} />{error}</div>}
        <button className="primary-button auth-submit" type="submit">Prijavi se <ArrowRight size={16} /></button>
      </form>
      <div className="auth-security-note"><ShieldCheck size={15} /><span>Sesija se čuva samo u ovom pregledaču. Odjavite se nakon završetka rada.</span></div>
    </div>
    <div className="auth-demo">
      <div className="eyebrow">Pilot nalozi</div><h2>Izaberite radni profil</h2><p>Za ovaj MVP možete koristiti pripremljene naloge. Svaki nalog otvara zaseban dashboard i meni.</p>
      <div className="credential-list">{users.map((user) => <button className={`credential-card ${user.role}`} key={user.id} type="button" onClick={() => fillCredentials(user)}><div className={`avatar ${user.role}`}>{user.initials}</div><div><strong>{user.name}</strong><span>{user.roleLabel}</span><small>{user.username} · {loginCredentials[user.username]}</small></div><ArrowRight size={15} /></button>)}</div>
      <div className="auth-demo-foot"><LockKeyhole size={14} />Demo kredencijali će se zameniti serverskom autentikacijom pre produkcije.</div>
    </div>
  </div>;
}

function UserAccountMenu({ currentUser, onLogout }: { currentUser: AppUser; onLogout: () => void }) {
  return <div className="user-account-menu"><div className="user-switcher-header"><span>Prijavljen korisnik</span><strong>{currentUser.facility}</strong></div><div className="account-identity"><div className={`avatar small ${currentUser.role}`}>{currentUser.initials}</div><div><strong>{currentUser.name}</strong><span>{currentUser.roleLabel}</span></div></div><button className="logout-button" onClick={onLogout}><LogOut size={15} />Odjavi se</button><div className="user-switcher-note"><ShieldCheck size={13} />Pristup meniju zavisi od uloge</div></div>;
}

function Dashboard({ currentUser, onNavigate, onAction }: { currentUser: AppUser; onNavigate: (page: PageKey) => void; onAction: (message: string) => void }) {
  if (currentUser.role === "warehouse") return <WarehouseDashboard user={currentUser} onNavigate={onNavigate} onAction={onAction} />;
  if (currentUser.role === "driver") return <DriverDashboard user={currentUser} onNavigate={onNavigate} onAction={onAction} />;
  return <ManagementDashboard user={currentUser} onNavigate={onNavigate} onAction={onAction} />;
}

function WarehouseDashboard({ user, onNavigate, onAction }: { user: AppUser; onNavigate: (page: PageKey) => void; onAction: (message: string) => void }) {
  return <>
    <PageHeader eyebrow="Magacin · Smjena 1 · Centralni magacin" title={`${user.firstName}, tvoj radni pregled`} description="Prijemi, picking i stanje robe koje danas obrađuješ." />
    <div className="role-banner warehouse"><div className="role-banner-icon"><Warehouse size={21} /></div><div><strong>Magacionerski režim</strong><span>Prikazani su samo zadaci i operacije za skladište.</span></div><div className="role-banner-meta"><span>Aktivna smjena</span><strong>06:00 – 14:00</strong></div></div>
    <section className="stats-grid">
      <StatCard label="Prijemi na rampi" value="2" detail="1 čeka unos stavki" icon={ArrowDownToLine} tone="blue" onClick={() => onNavigate("receipts")} />
      <StatCard label="Picking nalozi" value="3" detail="1 spreman za početak" icon={PackageOpen} tone="violet" onClick={() => onNavigate("picking")} />
      <StatCard label="Dostupna zaliha" value="14.280" detail="jedinica na lokacijama" icon={Boxes} tone="green" onClick={() => onNavigate("inventory")} />
      <StatCard label="LOT-ovi na HOLD" value="4" detail="ne pomerati bez odluke" icon={AlertTriangle} tone="orange" onClick={() => onNavigate("inventory")} />
    </section>
    <div className="role-dashboard-grid">
      <section className="panel role-work-panel"><div className="panel-header"><div><h2>Moji radni nalozi</h2><p>Operacije koje su ti dodeljene danas</p></div><button className="link-button" onClick={() => onNavigate("tasks")}>Svi zadaci <ArrowRight size={15} /></button></div><div className="role-task-list">
        <button className="role-task" onClick={() => onNavigate("receipts")}><span className="role-task-icon blue"><ArrowDownToLine size={17} /></span><div><strong>Unesi stavke prijema PR-240821-04</strong><span>Frikom d.o.o. · 12 stavki · Rampa 02</span></div><StatusBadge label="U toku" tone="info" /><ArrowRight size={15} /></button>
        <button className="role-task" onClick={() => onNavigate("picking")}><span className="role-task-icon violet"><PackageOpen size={17} /></span><div><strong>Završi picking PK-260919-008</strong><span>Voli Trade · 8 od 26 stavki potvrđeno</span></div><StatusBadge label="Prioritet" tone="warning" /><ArrowRight size={15} /></button>
        <button className="role-task" onClick={() => onNavigate("inventory")}><span className="role-task-icon orange"><Archive size={17} /></span><div><strong>Ne pomeraj LOT-2024-0821</strong><span>HOLD · Komora K-02 · čeka odluku kvaliteta</span></div><StatusBadge label="Blokirano" tone="danger" /><ArrowRight size={15} /></button>
      </div></section>
      <section className="panel quick-panel"><div className="panel-header"><div><h2>Brze operacije</h2><p>Najčešće akcije u skladištu</p></div></div><div className="quick-action-grid"><button onClick={() => onNavigate("receipts")}><ArrowDownToLine size={18} /><span>Prijem robe</span><small>Unos i kontrola</small></button><button onClick={() => onNavigate("picking")}><PackageOpen size={18} /><span>Pokreni picking</span><small>3 aktivna naloga</small></button><button onClick={() => onNavigate("inventory")}><Boxes size={18} /><span>Pronađi LOT</span><small>Po lokaciji ili SKU</small></button><button onClick={() => onAction("Otvorena je forma za novo merenje temperature")}><Gauge size={18} /><span>Temperatura</span><small>Nova kontrola</small></button></div></section>
    </div>
    <section className="panel role-bottom-panel"><div className="panel-header"><div><h2>Stanje smene</h2><p>Pregled rada magacina u realnom vremenu</p></div><StatusBadge label="Sve operacije stabilne" tone="success" /></div><div className="shift-progress"><div><span>Prijemi</span><strong>10 / 12</strong><div className="progress-track"><span style={{ width: "83%" }}></span></div></div><div><span>Picking</span><strong>2 / 3</strong><div className="progress-track"><span style={{ width: "66%" }}></span></div></div><div><span>Kontrole</span><strong>24 / 28</strong><div className="progress-track green-track"><span style={{ width: "86%" }}></span></div></div></div></section>
  </>;
}

function DriverDashboard({ user, onNavigate, onAction }: { user: AppUser; onNavigate: (page: PageKey) => void; onAction: (message: string) => void }) {
  return <>
    <PageHeader eyebrow="Distribucija · Vozački portal · Subota, 19. septembar 2026." title={`${user.firstName}, spreman za rutu?`} description="Ovde vidiš svoje vozilo, stopove i potvrde isporuke." />
    <div className="role-banner driver"><div className="role-banner-icon"><Truck size={21} /></div><div><strong>Vozački režim</strong><span>Samo tvoje vozilo, ruta i isporuke su prikazane.</span></div><div className="role-banner-meta"><span>Dodeljeno vozilo</span><strong>PG CG 308</strong></div></div>
    <section className="stats-grid">
      <StatCard label="Današnja ruta" value="RUTA-091" detail="8 kupaca · u toku" icon={Map} tone="blue" onClick={() => onNavigate("routes")} />
      <StatCard label="Preostali stopovi" value="6" detail="od 8 planiranih" icon={Map} tone="violet" onClick={() => onNavigate("routes")} />
      <StatCard label="Isporučeno" value="2" detail="danas na ovoj ruti" icon={PackageCheck} tone="green" onClick={() => onNavigate("deliveries")} />
      <StatCard label="Status vozila" value="SPREMNO" detail="kontrola 06:30 · 3.2°C" icon={Truck} tone="orange" onClick={() => onNavigate("vehicles")} />
    </section>
    <div className="role-dashboard-grid">
      <section className="panel route-focus-panel"><div className="panel-header"><div><h2>Moja ruta RUTA-091</h2><p>PG CG 308 · Hladnjača · 0° do 5°C</p></div><StatusBadge label="U toku" tone="info" /></div><div className="route-progress-card"><div className="route-progress-top"><div><span>Napredak rute</span><strong>2 od 8 stopova</strong></div><strong>25%</strong></div><div className="progress-track"><span style={{ width: "25%" }}></span></div><div className="route-progress-meta"><span>Polazak 06:45</span><span>Planirani povratak 13:45</span></div></div><div className="driver-stop-list"><button className="driver-stop done"><span>1</span><div><strong>Restoran Galion</strong><small>Kotor · isporučeno u 09:45</small></div><CheckCircle2 size={17} /></button><button className="driver-stop done"><span>2</span><div><strong>Hotel Splendid</strong><small>Budva · isporučeno u 10:30</small></div><CheckCircle2 size={17} /></button><button className="driver-stop current" onClick={() => onNavigate("deliveries")}><span>3</span><div><strong>Voli Trade</strong><small>Podgorica · 26 stavki · sledeći stop</small></div><ArrowRight size={17} /></button><button className="driver-stop"><span>4</span><div><strong>Aroma market 02</strong><small>Podgorica · planirano 12:00</small></div><Clock3 size={17} /></button></div></section>
      <section className="panel quick-panel"><div className="panel-header"><div><h2>Akcije vozača</h2><p>Brze potvrde sa terena</p></div></div><div className="quick-action-grid driver-actions"><button onClick={() => onNavigate("deliveries")}><PackageCheck size={18} /><span>Potvrdi isporuku</span><small>Potpis i količina</small></button><button onClick={() => onAction("Otvoren je obrazac za prijavu povrata")}><ArrowDownToLine size={18} /><span>Prijavi povrat</span><small>LOT i razlog</small></button><button onClick={() => onNavigate("vehicles")}><Gauge size={18} /><span>Unesi temperaturu</span><small>Vozilo PG CG 308</small></button><button onClick={() => onAction("Podrška distribucije je obaveštena")}><Bell size={18} /><span>Pozovi dispečera</span><small>Operativna podrška</small></button></div><div className="driver-note"><ShieldCheck size={16} /><span>Vozilo je spremno za nastavak rute. Sledeća obavezna kontrola: po povratku.</span></div></section>
    </div>
    <section className="panel role-bottom-panel"><div className="panel-header"><div><h2>Napomena dispečera</h2><p>Poslednja poruka za tvoju rutu</p></div><StatusBadge label="Važno" tone="warning" /></div><div className="dispatcher-note"><div className="avatar small">DM</div><div><strong>Dispečerski centar</strong><span>Kupac Voli Trade je potvrdio prijem između 11:15 i 11:30. Kod odbijanja bilo koje stavke obavezno unesi razlog i fotografiju.</span></div><time>pre 18 min</time></div></section>
  </>;
}

function ManagementDashboard({ user, onNavigate, onAction }: { user: AppUser; onNavigate: (page: PageKey) => void; onAction: (message: string) => void }) {
  const [range, setRange] = useState("Danas");
  return (
    <>
      <PageHeader eyebrow={`Subota, 19. septembar 2026. · Smjena 1 · ${user.roleLabel}`} title={`Dobro jutro, ${user.firstName}`} description="Evo pregleda ključnih operacija i odstupanja za današnji dan." />
      <div className="dashboard-toolbar"><div className="live-indicator"><span className="pulse"></span><strong>Live operativni pregled</strong><span>·</span><span>poslednje osvežavanje pre 2 min</span></div><div className="range-control"><CalendarDays size={15} />{["Danas", "7 dana", "30 dana"].map((label) => <button key={label} className={range === label ? "selected" : ""} onClick={() => setRange(label)}>{label}</button>)}</div></div>
      <section className="critical-strip">
        <div className="section-heading"><div><h2>Zahteva pažnju</h2><span>4 aktivna upozorenja za obradu</span></div><button className="link-button" onClick={() => onNavigate("haccp")}>Pregledaj sve <ArrowRight size={15} /></button></div>
        <div className="alert-grid">{[
          { title: "Temperatura van opsega", value: "1", detail: "Komora K-02", tone: "danger", icon: AlertTriangle, page: "haccp" as PageKey },
          { title: "LOT-ovi na HOLD", value: "4", detail: "Potrebna odluka", tone: "warning", icon: Archive, page: "inventory" as PageKey },
          { title: "Vozila nisu spremna", value: "1", detail: "Pre utovara", tone: "warning", icon: Truck, page: "vehicles" as PageKey },
          { title: "Istekli zadaci", value: "2", detail: "Rok je prošao", tone: "danger", icon: Clock3, page: "tasks" as PageKey },
        ].map((card) => { const Icon = card.icon; return <button className={`alert-card ${card.tone}`} key={card.title} onClick={() => onNavigate(card.page)}><div className="alert-card-icon"><Icon size={19} /></div><div className="alert-card-content"><strong>{card.title}</strong><span>{card.detail}</span></div><b>{card.value}</b><ArrowRight size={15} className="alert-arrow" /></button>; })}</div>
      </section>
      <section className="stats-grid">
        <StatCard label="Današnji prijemi" value="12" detail="2 čekaju odluku" icon={ArrowDownToLine} tone="blue" onClick={() => onNavigate("receipts")} />
        <StatCard label="Porudžbine" value="38" detail="8 čeka picking" icon={ClipboardCheck} tone="violet" onClick={() => onNavigate("orders")} />
        <StatCard label="Isporuke danas" value="24" detail="16 završeno" icon={PackageCheck} tone="green" onClick={() => onNavigate("deliveries")} />
        <StatCard label="Zaliha na stanju" value="€ 84.260" detail="+4,8% u odnosu na juče" icon={Boxes} tone="orange" onClick={() => onNavigate("inventory")} />
      </section>
      <div className="dashboard-columns">
        <section className="panel activity-panel"><div className="panel-header"><div><h2>Operativni tok</h2><p>Aktivnosti u poslednja 24 sata</p></div><button className="icon-button small"><MoreHorizontal size={17} /></button></div><div className="activity-list">{[
          { time: "09:42", title: "Prijem PR-240820-12 prihvaćen", desc: "Mlekara Šabac · 16 stavki · 1.240 kg", icon: CheckCircle2, tone: "success" },
          { time: "09:30", title: "Otvorena neusaglašenost NC-260919-003", desc: "Oštećena ambalaža · Visok prioritet", icon: AlertCircle, tone: "danger" },
          { time: "09:12", title: "Picking PK-260919-008 započet", desc: "Voli Trade · 26 stavki · Nikola Vuković", icon: PackageOpen, tone: "info" },
          { time: "08:55", title: "Kontrola temperature nije prošla", desc: "Komora K-02 · 8.6°C / limit 0–5°C", icon: Gauge, tone: "warning" },
          { time: "08:40", title: "Novi prijem započet", desc: "Frikom d.o.o. · PR-240821-04", icon: ArrowDownToLine, tone: "neutral" },
        ].map((item) => { const Icon = item.icon; return <div className="activity-row" key={item.time + item.title}><span className="activity-time">{item.time}</span><span className={`activity-icon ${item.tone}`}><Icon size={15} /></span><div><strong>{item.title}</strong><p>{item.desc}</p></div></div>; })}</div><button className="panel-footer-link" onClick={() => onNavigate("audit")}>Otvori audit trail <ArrowRight size={15} /></button></section>
        <section className="panel control-panel"><div className="panel-header"><div><h2>Kontrole kvaliteta</h2><p>Stanje za današnji dan</p></div><button className="link-button" onClick={() => onNavigate("haccp")}>HACCP / DHP</button></div><div className="donut-wrap"><div className="donut-chart"><div><strong>86%</strong><span>uspešno</span></div></div><div className="donut-legend"><div><span className="legend-dot green"></span><div><strong>24</strong><span>Uspešno</span></div></div><div><span className="legend-dot orange"></span><div><strong>3</strong><span>Upozorenje</span></div></div><div><span className="legend-dot red"></span><div><strong>1</strong><span>Neuspešno</span></div></div></div></div><div className="next-control"><div className="next-control-icon"><Clock3 size={17} /></div><div><span>Sledeća obavezna kontrola</span><strong>Komora K-01 · za 34 min</strong></div><ArrowRight size={16} /></div></section>
      </div>
      <div className="bottom-grid"><section className="panel table-panel"><div className="panel-header"><div><h2>Prijemi koji čekaju odluku</h2><p>Potrebna kontrola odgovornog lica</p></div><button className="link-button" onClick={() => onNavigate("receipts")}>Svi prijemi <ArrowRight size={15} /></button></div><ReceiptTable compact onAction={onAction} /></section><section className="panel mini-tasks"><div className="panel-header"><div><h2>Moji zadaci</h2><p>2 zadatka zahtevaju pažnju</p></div><button className="link-button" onClick={() => onNavigate("tasks")}>Svi zadaci <ArrowRight size={15} /></button></div><div className="task-list">{[
          { title: "Pregledati LOT-2024-0821", meta: "Neusaglašenost · Visok", due: "Danas, 10:00", tone: "danger" },
          { title: "Verifikovati korektivnu meru", meta: "NC-260918-007 · Srednji", due: "Danas, 14:30", tone: "warning" },
          { title: "Dnevna provera komore K-01", meta: "HACCP kontrola", due: "Danas, 11:00", tone: "success" },
        ].map((task) => <div className="task-row" key={task.title}><span className={`task-check ${task.tone}`}></span><div><strong>{task.title}</strong><span>{task.meta}</span></div><time>{task.due}</time></div>)}</div></section></div>
    </>
  );
}

function StatCard({ label, value, detail, icon: Icon, tone, onClick }: { label: string; value: string; detail: string; icon: typeof Boxes; tone: string; onClick: () => void }) {
  return <button className="stat-card" onClick={onClick}><div className={`stat-icon ${tone}`}><Icon size={19} /></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div><ArrowRight size={16} className="stat-arrow" /></button>;
}

function NotificationPanel({ notices, onClear }: { notices: Notice[]; onClear: (id: number) => void }) {
  const icons = { temperature: Gauge, lot: Archive, vehicle: Truck, task: Clock3 };
  return <div className="notification-panel"><div className="notification-panel-header"><div><strong>Obaveštenja</strong><span>{notices.length} nepročitano</span></div><button className="link-button">Označi sve</button></div>{notices.length === 0 ? <div className="empty-notices"><CheckCircle2 size={24} /><span>Sve je rešeno</span></div> : notices.map((notice) => { const Icon = icons[notice.icon]; return <div className="notice-row" key={notice.id}><div className={`notice-icon ${notice.tone}`}><Icon size={15} /></div><div className="notice-copy"><strong>{notice.title}</strong><span>{notice.body}</span><small>{notice.time}</small></div><button className="notice-dismiss" onClick={() => onClear(notice.id)}><Check size={14} /></button></div>; })}</div>;
}

function ReceiptTable({ compact = false, onAction }: { compact?: boolean; onAction: (message: string) => void }) {
  const visible = compact ? receiptsSeed.slice(0, 3) : receiptsSeed;
  return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Prijem</th><th>Dobavljač</th><th>Datum</th><th>Stavke</th><th>Status</th><th></th></tr></thead><tbody>{visible.map((receipt) => <tr key={receipt.id}><td><strong className="table-link">{receipt.id}</strong><span className="table-sub">{receipt.document}</span></td><td>{receipt.supplier}</td><td className="muted-text">{receipt.date}</td><td>{receipt.items}<span className="table-sub">{receipt.value}</span></td><td><StatusBadge label={receipt.status} tone={receipt.statusTone} /></td><td><button className="row-action" onClick={() => onAction(`Otvoren je detalj prijema ${receipt.id}`)}><ArrowRight size={15} /></button></td></tr>)}</tbody></table></div>;
}

function StatusBadge({ label, tone }: { label: string; tone: Status | string }) { return <span className={`status-badge ${tone}`}><span></span>{label}</span>; }

function ReceiptsPage({ receipts, onAction, onAccept }: { receipts: Receipt[]; onAction: (message: string) => void; onAccept: (id: string) => void }) {
  const [filter, setFilter] = useState("Svi");
  const [showForm, setShowForm] = useState(false);
  const filtered = filter === "Svi" ? receipts : receipts.filter((receipt) => filter === "Čekaju odluku" ? receipt.status === "Čeka odluku" : receipt.status === "Prihvaćen");
  return <><PageHeader eyebrow="Operacije · Ulaz robe" title="Prijem robe" description="Očekivani i aktivni prijemi sa kontrolom LOT-a, rokova i odluka." action actionLabel="Novi prijem" onAction={() => setShowForm(true)} /><div className="page-summary-row"><div className="summary-chip"><span className="summary-dot blue"></span><strong>12</strong><span>danas</span></div><div className="summary-chip"><span className="summary-dot orange"></span><strong>2</strong><span>čekaju odluku</span></div><div className="summary-chip"><span className="summary-dot green"></span><strong>8</strong><span>prihvaćeno</span></div><div className="summary-chip"><span className="summary-dot gray"></span><strong>€ 14.682</strong><span>vrednost danas</span></div></div><section className="panel full-panel"><div className="panel-header table-toolbar"><div className="filter-tabs">{["Svi", "Čekaju odluku", "Prihvaćen"].map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><div className="table-actions"><div className="search-field"><Search size={16} /><input placeholder="Pretraži prijem..." /></div><button className="secondary-button"><Filter size={15} />Filteri</button><button className="icon-button small"><MoreHorizontal size={17} /></button></div></div><div className="receipts-table-shell"><table className="data-table receipts-table"><thead><tr><th>Prijem</th><th>Dobavljač</th><th>Datum</th><th>Stavke</th><th>Vrednost</th><th>Status</th><th>Akcija</th></tr></thead><tbody>{filtered.map((receipt) => <tr key={receipt.id}><td><strong className="table-link">{receipt.id}</strong><span className="table-sub">Dokument {receipt.document}</span></td><td><div className="partner-cell"><div className="partner-avatar">{receipt.supplier.slice(0, 2).toUpperCase()}</div><strong>{receipt.supplier}</strong></div></td><td className="muted-text">{receipt.date}</td><td>{receipt.items}</td><td><strong>{receipt.value}</strong></td><td><StatusBadge label={receipt.status} tone={receipt.statusTone} /></td><td>{receipt.status === "Čeka odluku" ? <button className="small-action" onClick={() => onAccept(receipt.id)}><Check size={14} />Prihvati</button> : <button className="row-action" onClick={() => onAction(`Otvoren je detalj prijema ${receipt.id}`)}><ArrowRight size={15} /></button>}</td></tr>)}</tbody></table></div><div className="pagination"><span>Prikazano 1–{filtered.length} od 12 prijema</span><div><button className="pagination-button">‹</button><button className="pagination-button selected">1</button><button className="pagination-button">2</button><button className="pagination-button">3</button><button className="pagination-button">›</button></div></div></section>{showForm && <Modal title="Novi očekivani prijem" onClose={() => setShowForm(false)}><div className="form-grid"><label>Dobavljač<select><option>Izaberite dobavljača</option><option>Frikom d.o.o.</option><option>Imlek a.d.</option><option>Mlekara Šabac</option></select></label><label>Datum prijema<input type="date" defaultValue="2026-09-19" /></label><label>Broj dokumenta<input placeholder="npr. FR-88420" /></label><label>Napomena<input placeholder="Opciona napomena" /></label></div><div className="modal-footer"><button className="secondary-button" onClick={() => setShowForm(false)}>Otkaži</button><button className="primary-button" onClick={() => { setShowForm(false); onAction("Očekivani prijem je kreiran"); }}><Check size={15} />Kreiraj prijem</button></div></Modal>}</>;
}

function InventoryPage({ search, setSearch, onAction }: { search: string; setSearch: (value: string) => void; onAction: (message: string) => void }) {
  const filtered = useMemo(() => inventorySeed.filter((row) => `${row.product} ${row.sku} ${row.lot} ${row.location}`.toLowerCase().includes(search.toLowerCase())), [search]);
  return <><PageHeader eyebrow="Operacije · Skladište" title="Zalihe" description="Stanje robe po lokacijama, LOT-ovima i statusima zalihe." action actionLabel="Premesti robu" onAction={() => onAction("Otvoren je proces premeštanja zalihe")} /><div className="stats-grid compact-stats"><StatCard label="Ukupna količina" value="18.420" detail="jedinica na stanju" icon={Boxes} tone="blue" onClick={() => undefined} /><StatCard label="Dostupno" value="14.280" detail="77,5% ukupne zalihe" icon={CheckCircle2} tone="green" onClick={() => undefined} /><StatCard label="Rezervisano" value="3.420" detail="za 38 porudžbina" icon={ClipboardCheck} tone="violet" onClick={() => undefined} /><StatCard label="Na HOLD" value="720" detail="4 LOT-a zahtevaju odluku" icon={AlertTriangle} tone="orange" onClick={() => undefined} /></div><section className="panel full-panel"><div className="panel-header table-toolbar"><div><h2>Pregled zalihe</h2><p>Centralni magacin · ažurirano pre 2 min</p></div><div className="table-actions"><div className="search-field wide"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="LOT, proizvod, SKU, lokacija..." /></div><button className="secondary-button"><Filter size={15} />Filteri</button><button className="secondary-button"><CloudDownload size={15} />Izvoz</button></div></div><div className="receipts-table-shell"><table className="data-table inventory-table"><thead><tr><th>Proizvod</th><th>LOT</th><th>Lokacija</th><th>Količina</th><th>Rezervisano</th><th>Rok trajanja</th><th>Status</th><th></th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><td><strong>{row.product}</strong><span className="table-sub">{row.sku}</span></td><td><strong className="table-link">{row.lot}</strong></td><td><span className="location-cell"><Warehouse size={14} />{row.location}</span></td><td><strong>{row.qty}</strong><span className="table-sub">kom</span></td><td>{row.reserved}</td><td className={row.expiry.startsWith("24") || row.expiry.startsWith("28") ? "expiry-near" : ""}>{row.expiry}</td><td><StatusBadge label={row.status} tone={row.statusTone} /></td><td><button className="row-action" onClick={() => onAction(`Otvoren je detalj LOT-a ${row.lot}`)}><ArrowRight size={15} /></button></td></tr>)}</tbody></table></div></section></>;
}

function OrdersPage({ onAction }: { onAction: (message: string) => void }) {
  return <><PageHeader eyebrow="Operacije · Prodaja" title="Porudžbine" description="Praćenje prodajnih naloga od rezervacije do isporuke." action actionLabel="Nova porudžbina" onAction={() => onAction("Otvorena je forma za novu porudžbinu")} /><section className="panel full-panel"><div className="panel-header table-toolbar"><div className="filter-tabs"><button className="selected">Sve <b>38</b></button><button>Nova <b>4</b></button><button>Čeka picking <b>8</b></button><button>U isporuci <b>6</b></button></div><div className="table-actions"><div className="search-field"><Search size={16} /><input placeholder="Broj, kupac, grad..." /></div><button className="secondary-button"><Filter size={15} />Filteri</button></div></div><div className="receipts-table-shell"><table className="data-table"><thead><tr><th>Porudžbina</th><th>Kupac</th><th>Isporuka</th><th>Stavke</th><th>Vrednost</th><th>Status</th><th></th></tr></thead><tbody>{orders.map((order) => <tr key={order.no}><td><strong className="table-link">{order.no}</strong><span className="table-sub">Kreirana danas, 08:12</span></td><td><strong>{order.customer}</strong><span className="table-sub">{order.city}</span></td><td>{order.delivery}</td><td>{order.items}</td><td><strong>{order.total}</strong></td><td><StatusBadge label={order.status} tone={order.tone} /></td><td><button className="row-action" onClick={() => onAction(`Otvoren je detalj porudžbine ${order.no}`)}><ArrowRight size={15} /></button></td></tr>)}</tbody></table></div></section></>;
}

function PickingPage({ onAction }: { onAction: (message: string) => void }) {
  const picks = [{ id: "PK-260919-008", order: "POR-260919-017", customer: "Voli Trade", progress: "18 / 26", percent: 69, operator: "Nikola Vuković", status: "U toku", tone: "info" }, { id: "PK-260919-007", order: "POR-260919-016", customer: "Restoran Galion", progress: "8 / 8", percent: 100, operator: "Ana Marković", status: "Završeno", tone: "success" }, { id: "PK-260919-006", order: "POR-260919-018", customer: "Hotel Splendid", progress: "0 / 14", percent: 0, operator: "Nije dodeljen", status: "Čeka", tone: "warning" }];
  return <><PageHeader eyebrow="Operacije · Skladište" title="Picking" description="Nalozi za komisioniranje sa potvrdom lokacije, LOT-a i količine." action actionLabel="Kreiraj picking" onAction={() => onAction("Picking nalog je kreiran iz rezervisanih porudžbina")} /><div className="workflow-banner"><div className="workflow-step done"><span>1</span><div><strong>Rezervacija</strong><small>12 završeno</small></div></div><ArrowRight size={16} /><div className="workflow-step current"><span>2</span><div><strong>Picking</strong><small>3 aktivna naloga</small></div></div><ArrowRight size={16} /><div className="workflow-step"><span>3</span><div><strong>Utovar</strong><small>Čeka picking</small></div></div><ArrowRight size={16} /><div className="workflow-step"><span>4</span><div><strong>Isporuka</strong><small>24 danas</small></div></div></div><section className="panel full-panel"><div className="panel-header"><div><h2>Aktivni nalozi</h2><p>LOT-aware komisioniranje</p></div><button className="secondary-button"><Filter size={15} />Filteri</button></div><div className="picking-list">{picks.map((pick) => <div className="picking-row" key={pick.id}><div className="pick-id"><PackageOpen size={18} /><div><strong>{pick.id}</strong><span>{pick.order} · {pick.customer}</span></div></div><div className="pick-progress"><div className="progress-label"><span>Napredak</span><strong>{pick.progress} stavki</strong></div><div className="progress-track"><span style={{ width: `${pick.percent}%` }}></span></div></div><div className="pick-operator"><span>Operator</span><strong>{pick.operator}</strong></div><StatusBadge label={pick.status} tone={pick.tone} /><button className="row-action" onClick={() => onAction(`Otvoren picking nalog ${pick.id}`)}><ArrowRight size={15} /></button></div>)}</div></section></>;
}

function VehiclesPage({ onAction }: { onAction: (message: string) => void }) {
  const vehicles = [{ reg: "PG CG 412", type: "Hladnjača", temp: "0° do 5°C", status: "Nije spremno", tone: "danger", check: "Čistoća · NOK", driver: "Nikola Vuković" }, { reg: "PG CG 308", type: "Hladnjača", temp: "0° do 5°C", status: "Spremno", tone: "success", check: "Prošlo u 08:10", driver: "Petar Janković" }, { reg: "PG CG 227", type: "Kombi", temp: "—", status: "Spremno", tone: "success", check: "Prošlo u 07:45", driver: "Miloš Radović" }, { reg: "PG CG 156", type: "Hladnjača", temp: "2° do 8°C", status: "Na ruti", tone: "info", check: "Prošlo u 06:30", driver: "Stefan Ivanović" }];
  return <><PageHeader eyebrow="Operacije · Flota" title="Vozila" description="Spremnost vozila, temperaturni režimi i kontrole pre utovara." action actionLabel="Nova kontrola" onAction={() => onAction("Otvorena je kontrolna lista vozila")} /><section className="vehicle-grid">{vehicles.map((vehicle) => <div className={`vehicle-card ${vehicle.tone}`} key={vehicle.reg}><div className="vehicle-top"><div className="vehicle-symbol"><Truck size={20} /></div><StatusBadge label={vehicle.status} tone={vehicle.tone} /><button className="icon-button small"><MoreHorizontal size={16} /></button></div><h3>{vehicle.reg}</h3><div className="vehicle-type">{vehicle.type} <span>·</span> {vehicle.temp}</div><div className="vehicle-divider"></div><div className="vehicle-meta"><div><span>Poslednja kontrola</span><strong>{vehicle.check}</strong></div><div><span>Vozač / operater</span><strong>{vehicle.driver}</strong></div></div>{vehicle.tone === "danger" && <button className="secondary-button full-width" onClick={() => onAction("Kontrola vozila PG CG 412 je otvorena")}>Otvori kontrolu <ArrowRight size={14} /></button>}</div>)}</section></>;
}

function RoutesPage({ onAction }: { onAction: (message: string) => void }) {
  const routes = [{ no: "RUTA-091", vehicle: "PG CG 308", driver: "Petar Janković", stops: "8 kupaca", time: "07:30 – 13:45", status: "U toku", tone: "info" }, { no: "RUTA-090", vehicle: "PG CG 156", driver: "Stefan Ivanović", stops: "6 kupaca", time: "06:45 – 12:20", status: "U toku", tone: "info" }, { no: "RUTA-089", vehicle: "PG CG 227", driver: "Miloš Radović", stops: "10 kupaca", time: "06:10 – 11:55", status: "Završena", tone: "success" }];
  return <><PageHeader eyebrow="Operacije · Distribucija" title="Rute" description="Planirane rute, vozila, vozači i statusi stopova." action actionLabel="Nova ruta" onAction={() => onAction("Otvoren je planer nove rute")} /><section className="panel full-panel"><div className="panel-header"><div><h2>Današnje rute</h2><p>Subota, 19. septembar 2026.</p></div><div className="table-actions"><button className="secondary-button"><CalendarDays size={15} />Izaberi datum</button><button className="secondary-button"><Map size={15} />Mapa</button></div></div><div className="route-list">{routes.map((route) => <div className="route-row" key={route.no}><div className="route-icon"><Map size={18} /></div><div className="route-main"><strong>{route.no}</strong><span>{route.vehicle} · {route.driver}</span></div><div className="route-stops"><strong>{route.stops}</strong><span>{route.time}</span></div><StatusBadge label={route.status} tone={route.tone} /><button className="row-action" onClick={() => onAction(`Otvorena ruta ${route.no}`)}><ArrowRight size={15} /></button></div>)}</div></section></>;
}

function DeliveriesPage({ onAction }: { onAction: (message: string) => void }) {
  const deliveries = [{ no: "IS-260919-016", customer: "Restoran Galion", route: "RUTA-090", items: "8 / 8", status: "Isporučeno", tone: "success", time: "09:45" }, { no: "IS-260919-015", customer: "Voli Trade", route: "RUTA-091", items: "— / 26", status: "Na putu", tone: "info", time: "11:15" }, { no: "IS-260919-014", customer: "Aroma market 02", route: "RUTA-090", items: "— / 12", status: "Na putu", tone: "info", time: "10:30" }, { no: "IS-260919-013", customer: "Hotel Splendid", route: "RUTA-091", items: "— / 14", status: "Čeka isporuku", tone: "warning", time: "12:00" }];
  return <><PageHeader eyebrow="Operacije · Distribucija" title="Isporuke" description="Praćenje isporuka, potvrda kupca i povrata." action actionLabel="Evidentiraj povrat" onAction={() => onAction("Otvoren je obrazac za povrat robe")} /><div className="delivery-kpis"><div><Truck size={17} /><span>Na ruti</span><strong>18</strong></div><div><CheckCircle2 size={17} /><span>Isporučeno</span><strong>16</strong></div><div><Clock3 size={17} /><span>Čeka isporuku</span><strong>6</strong></div><div><XCircle size={17} /><span>Reklamacije</span><strong>1</strong></div></div><section className="panel full-panel"><div className="panel-header table-toolbar"><div><h2>Današnje isporuke</h2><p>Potvrda mora sadržati status, količinu i LOT</p></div><div className="table-actions"><div className="search-field"><Search size={16} /><input placeholder="Isporuka, kupac..." /></div><button className="secondary-button"><Filter size={15} />Filteri</button></div></div><div className="receipts-table-shell"><table className="data-table"><thead><tr><th>Isporuka</th><th>Kupac</th><th>Ruta</th><th>Stavke</th><th>Planirano</th><th>Status</th><th></th></tr></thead><tbody>{deliveries.map((delivery) => <tr key={delivery.no}><td><strong className="table-link">{delivery.no}</strong><span className="table-sub">Danas, {delivery.time}</span></td><td><strong>{delivery.customer}</strong></td><td>{delivery.route}</td><td>{delivery.items}</td><td>{delivery.time}</td><td><StatusBadge label={delivery.status} tone={delivery.tone} /></td><td><button className="row-action" onClick={() => onAction(`Otvoren detalj isporuke ${delivery.no}`)}><ArrowRight size={15} /></button></td></tr>)}</tbody></table></div></section></>;
}

function HaccpPage({ onAction }: { onAction: (message: string) => void }) {
  const readings = [{ point: "Komora K-02", measure: "Temperatura", value: "8.6°C", limit: "0–5°C", result: "Neuspešno", tone: "danger", time: "08:55", by: "Ana Marković" }, { point: "Komora K-01", measure: "Temperatura", value: "3.2°C", limit: "0–5°C", result: "Uspešno", tone: "success", time: "08:40", by: "Marko Petrović" }, { point: "Prijemna rampa", measure: "Čistoća", value: "U redu", limit: "Vizuelna kontrola", result: "Uspešno", tone: "success", time: "08:25", by: "Nikola Vuković" }, { point: "Vozilo PG CG 412", measure: "Čistoća", value: "NOK", limit: "Mora biti OK", result: "Neuspešno", tone: "danger", time: "08:10", by: "Petar Janković" }];
  return <><PageHeader eyebrow="Kvalitet · HACCP / DHP" title="Kontrole kvaliteta" description="Aktivna pravila, merenja i odstupanja sa jasnim tragom odgovornosti." action actionLabel="Novo merenje" onAction={() => onAction("Otvorena je forma za novo merenje")} /><div className="haccp-summary"><div className="haccp-card success"><CheckCircle2 size={20} /><div><span>Danas uspešno</span><strong>24</strong></div><small>86% kontrola</small></div><div className="haccp-card warning"><AlertTriangle size={20} /><div><span>Upozorenja</span><strong>3</strong></div><small>Zahteva pregled</small></div><div className="haccp-card danger"><XCircle size={20} /><div><span>Neuspešno</span><strong>1</strong></div><small>NC otvorena</small></div><div className="haccp-card info"><Clock3 size={20} /><div><span>Sledeća kontrola</span><strong>34 min</strong></div><small>Komora K-01</small></div></div><section className="panel full-panel"><div className="panel-header table-toolbar"><div><h2>Poslednja merenja</h2><p>Istorijski zapisi se ne menjaju · Pravila su versioned</p></div><div className="table-actions"><button className="secondary-button"><Filter size={15} />Filteri</button><button className="secondary-button"><RefreshCw size={15} />Osveži</button></div></div><div className="receipts-table-shell"><table className="data-table"><thead><tr><th>Kontrolna tačka</th><th>Merenje</th><th>Vrednost</th><th>Aktivno pravilo</th><th>Rezultat</th><th>Vreme / izvršilac</th><th></th></tr></thead><tbody>{readings.map((reading) => <tr key={reading.point}><td><strong>{reading.point}</strong></td><td>{reading.measure}</td><td><strong className={reading.tone === "danger" ? "text-danger" : ""}>{reading.value}</strong></td><td><span className="rule-cell">{reading.limit}<small>Pravilo v2</small></span></td><td><StatusBadge label={reading.result} tone={reading.tone} /></td><td>{reading.time}<span className="table-sub">{reading.by}</span></td><td><button className="row-action" onClick={() => onAction(`Otvoren detalj kontrole za ${reading.point}`)}><ArrowRight size={15} /></button></td></tr>)}</tbody></table></div></section></>;
}

function NcPage({ onAction }: { onAction: (message: string) => void }) {
  const ncs = [{ no: "NC-260919-003", title: "Temperatura komore K-02 van opsega", source: "HACCP · Komora K-02", severity: "Visok", severityTone: "danger", status: "Istraga", statusTone: "warning", owner: "Jelena Jovanović", date: "19. sep 2026." }, { no: "NC-260918-007", title: "Oštećena ambalaža na prijemu", source: "Prijem PR-240820-12", severity: "Visok", severityTone: "danger", status: "Čeka verifikaciju", statusTone: "info", owner: "Marko Petrović", date: "18. sep 2026." }, { no: "NC-260917-004", title: "Nedostaje deklaracija na 2 artikla", source: "Prijem PR-240817-09", severity: "Srednji", severityTone: "warning", status: "Otvorena", statusTone: "neutral", owner: "Ana Marković", date: "17. sep 2026." }];
  return <><PageHeader eyebrow="Kvalitet · Upravljanje odstupanjima" title="Neusaglašenosti" description="Od detekcije do istrage, korektivne mere i nezavisne verifikacije." action actionLabel="Nova neusaglašenost" onAction={() => onAction("Otvoren je obrazac za novu neusaglašenost")} /><div className="nc-overview"><div><span>Otvorene</span><strong>3</strong><small>+1 ove nedelje</small></div><div><span>Visok prioritet</span><strong className="text-danger">2</strong><small>Zahteva pažnju danas</small></div><div><span>Čeka verifikaciju</span><strong>1</strong><small>Korektivna mera završena</small></div><div><span>Prosečno vreme rešavanja</span><strong>2,4 <small>dana</small></strong><small className="text-success">−18% u odnosu na prošli mesec</small></div></div><section className="panel full-panel"><div className="panel-header table-toolbar"><div className="filter-tabs"><button className="selected">Sve <b>3</b></button><button>Otvorene <b>2</b></button><button>Čekaju verifikaciju <b>1</b></button></div><div className="table-actions"><div className="search-field"><Search size={16} /><input placeholder="NC broj, opis, izvor..." /></div><button className="secondary-button"><Filter size={15} />Filteri</button></div></div><div className="nc-list">{ncs.map((nc) => <div className="nc-row" key={nc.no}><div className={`severity-bar ${nc.severityTone}`}></div><div className="nc-title"><strong>{nc.no}</strong><h3>{nc.title}</h3><span>{nc.source} · {nc.date}</span></div><div><span className="meta-label">Ozbiljnost</span><StatusBadge label={nc.severity} tone={nc.severityTone} /></div><div><span className="meta-label">Odgovorno lice</span><strong>{nc.owner}</strong></div><StatusBadge label={nc.status} tone={nc.statusTone} /><button className="row-action" onClick={() => onAction(`Otvoren detalj neusaglašenosti ${nc.no}`)}><ArrowRight size={15} /></button></div>)}</div></section></>;
}

function TasksPage({ onAction }: { onAction: (message: string) => void }) {
  const tasks = [{ title: "Pregledati LOT-2024-0821", source: "NC-260919-003 · HOLD odluka", due: "Danas, 10:00", priority: "Visok", tone: "danger", status: "Istekao", statusTone: "danger" }, { title: "Dnevna provera komore K-01", source: "HACCP kontrola · Komora K-01", due: "Danas, 11:00", priority: "Srednji", tone: "warning", status: "Dodeljen", statusTone: "info" }, { title: "Verifikovati korektivnu meru", source: "NC-260918-007 · CA-260918-004", due: "Danas, 14:30", priority: "Srednji", tone: "warning", status: "Dodeljen", statusTone: "info" }, { title: "Kalibracija termometra TK-04", source: "Oprema · rok 20. sep", due: "Sutra, 09:00", priority: "Nizak", tone: "neutral", status: "Otvoren", statusTone: "neutral" }];
  return <><PageHeader eyebrow="Operativa · Moje obaveze" title="Zadaci" description="Zadaci nastali iz poslovnih događaja, kontrola i neusaglašenosti." action actionLabel="Novi zadatak" onAction={() => onAction("Otvoren je obrazac za novi zadatak")} /><section className="panel full-panel"><div className="panel-header table-toolbar"><div className="task-tabs"><button className="selected">Moji zadaci <b>5</b></button><button>Svi zadaci</button><button>Istekom roka <b className="red-text">2</b></button></div><div className="table-actions"><button className="secondary-button"><Filter size={15} />Filteri</button></div></div><div className="task-center-list">{tasks.map((task, index) => <div className="center-task" key={task.title}><button className={`round-check ${task.statusTone === "success" ? "checked" : ""}`} onClick={() => onAction(`Zadatak "${task.title}" je označen kao završen`)}>{index === 2 ? <Check size={13} /> : ""}</button><div className="center-task-copy"><strong>{task.title}</strong><span>{task.source}</span></div><div className="center-task-due"><span>Rok</span><strong className={task.statusTone === "danger" ? "text-danger" : ""}>{task.due}</strong></div><StatusBadge label={task.priority} tone={task.tone} /><StatusBadge label={task.status} tone={task.statusTone} /><button className="row-action"><MoreHorizontal size={15} /></button></div>)}</div></section></>;
}

function TraceabilityPage({ onAction }: { onAction: (message: string) => void }) {
  const [query, setQuery] = useState("LOT-2024-0821");
  const [searched, setSearched] = useState(true);
  return <><PageHeader eyebrow="Analitika · Sledljivost" title="Traceability search" description="Pratite LOT kroz ceo tok — od dobavljača i prijema do kupca i povrata." /><section className="trace-search panel"><div className="trace-search-copy"><div className="trace-icon"><History size={20} /></div><div><h2>Pretraži poslovni lanac</h2><p>LOT broj, proizvod, prijem, kupac ili broj isporuke</p></div></div><div className="trace-search-form"><div className="search-field wide"><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setSearched(false); }} onKeyDown={(event) => event.key === "Enter" && setSearched(true)} placeholder="npr. LOT-2024-0821" /></div><button className="primary-button" onClick={() => setSearched(true)}>Pretraži</button></div><div className="trace-suggestions"><span>Brzi pristup:</span><button onClick={() => { setQuery("LOT-2024-0821"); setSearched(true); }}>LOT-2024-0821</button><button onClick={() => { setQuery("IS-260919-016"); setSearched(true); }}>IS-260919-016</button><button onClick={() => { setQuery("Frikom d.o.o."); setSearched(true); }}>Frikom d.o.o.</button></div></section>{searched && <><div className="trace-result-header"><div><span>Rezultat pretrage</span><strong>{query}</strong></div><StatusBadge label="Lanac kompletan" tone="success" /></div><section className="trace-chain panel"><div className="trace-chain-head"><div><h2>LOT-2024-0821</h2><p>Jogurt 2.8% 1kg · prihvaćeno 1.248 kom</p></div><StatusBadge label="HOLD" tone="warning" /><button className="secondary-button" onClick={() => onAction("LOT detalj je spreman za štampu")}><FileText size={15} />Štampaj</button></div><div className="chain-flow">{[{ icon: Truck, label: "Dobavljač", value: "Frikom d.o.o.", meta: "FR-88412" }, { icon: ArrowDownToLine, label: "Prijem", value: "PR-240821-04", meta: "19. sep 2026. · 08:40" }, { icon: Archive, label: "LOT", value: "LOT-2024-0821", meta: "28. sep 2026. · HOLD" }, { icon: Warehouse, label: "Zaliha", value: "K-02 · A-14", meta: "1.248 kom · 240 rez." }, { icon: PackageCheck, label: "Isporuka", value: "IS-260919-016", meta: "Restoran Galion" }, { icon: UserRound, label: "Kupac", value: "Restoran Galion", meta: "Kotor · isporučeno" }].map((node, index, all) => { const Icon = node.icon; return <div className="chain-node-wrap" key={node.label}><div className={`chain-node ${node.label === "LOT" ? "highlight" : ""}`}><div className="chain-node-icon"><Icon size={19} /></div><span>{node.label}</span><strong>{node.value}</strong><small>{node.meta}</small></div>{index < all.length - 1 && <div className="chain-line"><ArrowRight size={14} /></div>}</div>; })}</div><div className="trace-detail-grid"><div><span>Kontrole</span><strong>3 zapisa</strong><small>2 uspešne · 1 odstupanje</small></div><div><span>Picking</span><strong>PK-260919-008</strong><small>Potvrđeno u 09:12</small></div><div><span>Utovar</span><strong>UT-260919-005</strong><small>Vozilo PG CG 308</small></div><div><span>Istorija</span><strong>9 događaja</strong><small>Poslednji pre 12 min</small></div></div></section><section className="panel trace-timeline"><div className="panel-header"><div><h2>Timeline događaja</h2><p>Auditovan tok za LOT-2024-0821</p></div></div><div className="timeline">{audits.slice(0, 4).map((audit) => <div className="timeline-row" key={audit.time + audit.event}><div className="timeline-dot"></div><div className="timeline-time">{audit.time}</div><div><strong>{audit.action}</strong><span>{audit.entity} · {audit.user}</span></div><code>{audit.event}</code></div>)}</div></section></>}</>;
}

function ReportsPage({ onAction }: { onAction: (message: string) => void }) {
  const reports = [{ title: "Stanje zaliha", description: "Pregled količina po lokaciji, proizvodu i LOT-u", icon: Boxes, color: "blue" }, { title: "Pregled LOT-ova", description: "Status, rok trajanja i sledljivost svih LOT-ova", icon: Archive, color: "violet" }, { title: "Istek roka", description: "LOT-ovi kojima uskoro ističe rok trajanja", icon: Clock3, color: "orange" }, { title: "Prijemi robe", description: "Pregled prijema, odluka i odbijene robe", icon: ArrowDownToLine, color: "green" }, { title: "Isporuke", description: "Status isporuka, povrati i reklamacije", icon: PackageCheck, color: "blue" }, { title: "Neusaglašenosti", description: "Trendovi, ozbiljnost i vreme rešavanja", icon: AlertTriangle, color: "red" }, { title: "Temperature", description: "Merenja, odstupanja i kontrole po tački", icon: Gauge, color: "orange" }, { title: "Audit trail", description: "Imutabilni trag poslovnih odluka i promena", icon: FileCheck2, color: "violet" }];
  return <><PageHeader eyebrow="Analitika · Izveštavanje" title="Izveštaji" description="Operativni izveštaji zasnovani na događajima i server-side filtriranju." /><div className="report-toolbar"><div className="date-range"><CalendarDays size={15} /><span>01. sep 2026.</span><ArrowRight size={14} /><span>19. sep 2026.</span><ChevronDown size={14} /></div><button className="secondary-button" onClick={() => onAction("Izveštaj je izvezen u CSV formatu")}><CloudDownload size={15} />Izvezi CSV</button></div><div className="report-grid">{reports.map((report) => { const Icon = report.icon; return <button className="report-card" key={report.title} onClick={() => onAction(`Pokrenut je izveštaj: ${report.title}`)}><div className={`report-icon ${report.color}`}><Icon size={20} /></div><div><h3>{report.title}</h3><p>{report.description}</p></div><ArrowRight size={17} /></button>; })}</div></>;
}

function AuditPage() {
  return <><PageHeader eyebrow="Analitika · Kontrola sistema" title="Audit trail" description="Imutabilan zapis kritičnih poslovnih odluka, događaja i promena." /><section className="panel full-panel"><div className="panel-header table-toolbar"><div><h2>Poslednje aktivnosti</h2><p>Svi zapisi sadrže korisnika, vreme, entitet i izvorni event</p></div><div className="table-actions"><div className="search-field"><Search size={16} /><input placeholder="Korisnik, entitet, event..." /></div><button className="secondary-button"><Filter size={15} />Filteri</button></div></div><div className="audit-table-shell"><table className="data-table"><thead><tr><th>Vreme</th><th>Korisnik</th><th>Akcija</th><th>Entitet</th><th>Source event</th><th></th></tr></thead><tbody>{audits.map((audit) => <tr key={audit.time + audit.entity}><td><strong>{audit.time}</strong><span className="table-sub">19. sep 2026.</span></td><td><div className="audit-user"><div className="mini-avatar">{audit.user.split(" ").map((n) => n[0]).join("")}</div>{audit.user}</div></td><td><span className="audit-action"><span className={`audit-dot ${audit.tone}`}></span>{audit.action}</span></td><td><strong className="table-link">{audit.entity}</strong></td><td><code>{audit.event}</code></td><td><button className="row-action"><ArrowRight size={15} /></button></td></tr>)}</tbody></table></div></section></>;
}

function SettingsPage({ onAction }: { onAction: (message: string) => void }) {
  return <><PageHeader eyebrow="Sistem · Konfiguracija" title="Podešavanja" description="Objekti, korisnici, uloge, odgovorna lica i poslovna pravila." /><div className="settings-layout"><section className="panel settings-nav"><button className="selected"><Warehouse size={17} />Objekti i zone</button><button><UserRound size={17} />Korisnici i uloge</button><button><ShieldCheck size={17} />Dozvole</button><button><Gauge size={17} />Kontrolna pravila</button><button><Archive size={17} />Šifarnici</button><button><Settings2 size={17} />Sistemske postavke</button></section><section className="panel settings-content"><div className="panel-header"><div><h2>Objekti i zone</h2><p>Organizacija · Centralni magacin</p></div><button className="primary-button" onClick={() => onAction("Otvorena je forma za novi objekat")}><Plus size={15} />Novi objekat</button></div><div className="facility-card"><div className="facility-card-head"><div className="facility-big-icon"><Warehouse size={20} /></div><div><h3>Centralni magacin</h3><span>MAG-CG-01 · Podgorica</span></div><StatusBadge label="Aktivan" tone="success" /><button className="icon-button small"><MoreHorizontal size={17} /></button></div><div className="zone-grid"><div><strong>K-01</strong><span>Rashladna zona</span><small>0° do 5°C · 18 lokacija</small></div><div><strong>K-02</strong><span>Rashladna zona</span><small>0° do 5°C · 16 lokacija</small></div><div><strong>Z-01</strong><span>Suva zona</span><small>15° do 25°C · 32 lokacije</small></div><div><strong>S-02</strong><span>Ambalaža</span><small>Suva · 12 lokacija</small></div></div></div><div className="facility-card secondary-facility"><div className="facility-card-head"><div className="facility-big-icon"><Warehouse size={20} /></div><div><h3>Distribucija Bar</h3><span>MAG-CG-02 · Bar</span></div><StatusBadge label="Aktivan" tone="success" /><button className="icon-button small"><MoreHorizontal size={17} /></button></div></div></section></div></>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal"><div className="modal-header"><div><span>Operativni unos</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>{children}</div></div>;
}

export default App;