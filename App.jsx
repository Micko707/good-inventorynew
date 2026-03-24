const SUPABASE_URL = "https://jteqtixqeflvetunodlf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0ZXF0aXhxZWZsdmV0dW5vZGxmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyODc0MTIsImV4cCI6MjA4OTg2MzQxMn0.3Evg2vZ2fuz22YJnJ1ybo-7DfKYAzvYYZ8_kvZdHULE";

const headers = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
};

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { ...headers, ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  if (res.status === 204) return null;
  return res.json();
}

const SPLIT = 0.8;
const CONDITIONS = ["DS", "VNDS", "Used"];
const BRANDS = ["Nike", "ASICS", "Fear of God", "Geedup", "Corteiz", "Palm Angels", "Chrome Hearts", "Closure", "The Giving Movement", "Adidas", "New Balance", "Jordan Brand", "Other"];

function Badge({ status }) {
  const styles = {
    listed: { bg: "#1a2e1a", color: "#4ade80", label: "LISTED" },
    sold: { bg: "#2e1a1a", color: "#f87171", label: "SOLD" },
  };
  const s = styles[status] || styles.listed;
  return React.createElement("span", {
    style: { background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", padding: "3px 8px", borderRadius: 4, fontFamily: "'DM Mono', monospace" }
  }, s.label);
}

function StatCard({ label, value, sub }) {
  return React.createElement("div", {
    style: { background: "#111", border: "1px solid #222", borderRadius: 12, padding: "20px 24px", flex: 1, minWidth: 140 }
  },
    React.createElement("div", { style: { color: "#555", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 } }, label),
    React.createElement("div", { style: { color: "#fff", fontSize: 28, fontWeight: 700, fontFamily: "'DM Mono', monospace", lineHeight: 1 } }, value),
    sub && React.createElement("div", { style: { color: "#444", fontSize: 12, marginTop: 6 } }, sub)
  );
}

function Spinner() {
  return React.createElement("div", {
    style: { display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }
  }, React.createElement("div", {
    style: { width: 28, height: 28, border: "2px solid #222", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }
  }));
}

function App() {
  const [inventory, setInventory] = React.useState([]);
  const [consignors, setConsignors] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [view, setView] = React.useState("dashboard");
  const [filterConsignor, setFilterConsignor] = React.useState("all");
  const [toast, setToast] = React.useState(null);
  const [confirmSell, setConfirmSell] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [dbError, setDbError] = React.useState(null);
  const [form, setForm] = React.useState({ brand: "", name: "", size: "", sku: "", consignor_name: "", consignor_email: "", list_price: "", cost_price: "", condition: "DS" });

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const loadData = async () => {
    setLoading(true);
    setDbError(null);
    try {
      const [inv, cons] = await Promise.all([
        sbFetch("inventory?select=*,consignors(*)&order=created_at.desc"),
        sbFetch("consignors?select=*&order=name.asc"),
      ]);
      setInventory(inv || []);
      setConsignors(cons || []);
    } catch (e) {
      setDbError(e.message);
    }
    setLoading(false);
  };

  React.useEffect(() => { loadData(); }, []);

  const stats = React.useMemo(() => ({
    listed: inventory.filter(i => i.status === "listed").length,
    sold: inventory.filter(i => i.status === "sold").length,
    totalValue: inventory.filter(i => i.status === "listed").reduce((a, b) => a + b.list_price, 0),
    totalSold: inventory.filter(i => i.status === "sold").reduce((a, b) => a + b.list_price, 0),
    totalOwed: inventory.filter(i => i.status === "sold").reduce((a, b) => a + b.list_price * SPLIT, 0),
    totalMargin: inventory.filter(i => i.status === "sold").reduce((a, b) => a + (b.list_price - b.cost_price), 0),
  }), [inventory]);

  const consignorStats = React.useMemo(() => consignors.map(c => {
    const items = inventory.filter(i => i.consignor_id === c.id);
    const sold = items.filter(i => i.status === "sold");
    const listed = items.filter(i => i.status === "listed");
    const balance = sold.reduce((a, b) => a + b.list_price * (c.split_percent / 100), 0);
    return { ...c, items, sold, listed, balance };
  }), [consignors, inventory]);

  const handleUpload = async () => {
    if (!form.brand || !form.name || !form.consignor_name || !form.list_price) { showToast("Please fill in required fields"); return; }
    setSaving(true);
    try {
      const existing = consignors.find(c => c.name.toLowerCase() === form.consignor_name.toLowerCase());
      let consignor = existing;
      if (!existing) {
        const [newC] = await sbFetch("consignors", {
          method: "POST", headers: { Prefer: "return=representation" },
          body: JSON.stringify({ name: form.consignor_name, email: form.consignor_email, split_percent: 80 }),
        });
        consignor = newC;
      }
      await sbFetch("inventory", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ brand: form.brand, name: form.name, size: form.size, sku: form.sku, condition: form.condition, list_price: parseFloat(form.list_price), cost_price: parseFloat(form.cost_price) || 0, consignor_id: consignor.id, status: "listed", date_added: new Date().toISOString().split("T")[0] }),
      });
      showToast(`"${form.name}" added to inventory`);
      setForm({ brand: "", name: "", size: "", sku: "", consignor_name: "", consignor_email: "", list_price: "", cost_price: "", condition: "DS" });
      await loadData();
      setView("listed");
    } catch (e) { showToast("Error saving: " + e.message); }
    setSaving(false);
  };

  const markSold = async (item) => {
    setSaving(true);
    try {
      const dateSold = new Date().toISOString().split("T")[0];
      await sbFetch(`inventory?id=eq.${item.id}`, { method: "PATCH", body: JSON.stringify({ status: "sold", date_sold: dateSold }) });
      const consignor = consignors.find(c => c.id === item.consignor_id);
      const split = consignor ? consignor.split_percent / 100 : SPLIT;
      await sbFetch("sales", {
        method: "POST",
        body: JSON.stringify({ inventory_id: item.id, consignor_id: item.consignor_id, sale_price: item.list_price, consignor_payout: item.list_price * split, store_margin: item.list_price * (1 - split), date_sold: dateSold, email_sent: false }),
      });
      showToast(`"${item.name}" marked as sold`);
      setConfirmSell(null);
      await loadData();
    } catch (e) { showToast("Error: " + e.message); }
    setSaving(false);
  };

  const displayInventory = React.useMemo(() => {
    let items = view === "listed" ? inventory.filter(i => i.status === "listed") : view === "sold" ? inventory.filter(i => i.status === "sold") : inventory;
    if (filterConsignor !== "all") items = items.filter(i => i.consignor_id === filterConsignor);
    return items;
  }, [inventory, view, filterConsignor]);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "◈" },
    { id: "listed", label: "Listed", icon: "◉", count: stats.listed },
    { id: "sold", label: "Sold", icon: "✓", count: stats.sold },
    { id: "consignors", label: "Consignors", icon: "⊕", count: consignors.length },
    { id: "upload", label: "Add Stock", icon: "+" },
  ];

  const inputStyle = { background: "#111", border: "1px solid #222", color: "#fff", padding: "10px 14px", borderRadius: 8, fontSize: 14, width: "100%", outline: "none", fontFamily: "inherit" };
  const labelStyle = { fontSize: 11, color: "#555", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 8 };

  return React.createElement("div", { style: { minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif" } },
    React.createElement("style", {}, `
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500;600&display=swap');
      * { box-sizing: border-box; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    `),

    // Sidebar
    React.createElement("div", { style: { position: "fixed", left: 0, top: 0, bottom: 0, width: 220, background: "#0d0d0d", borderRight: "1px solid #1a1a1a", display: "flex", flexDirection: "column", padding: "28px 0", zIndex: 100 } },
      React.createElement("div", { style: { padding: "0 24px 32px" } },
        React.createElement("div", { style: { fontSize: 11, color: "#555", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 4 } }, "The Good Kid"),
        React.createElement("div", { style: { fontSize: 18, fontWeight: 700 } }, "Consign")
      ),
      React.createElement("nav", { style: { flex: 1 } },
        navItems.map(item =>
          React.createElement("button", {
            key: item.id,
            onClick: () => setView(item.id),
            style: { width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 24px", background: view === item.id ? "#161616" : "transparent", border: "none", color: view === item.id ? "#fff" : "#555", cursor: "pointer", fontSize: 14, fontWeight: 500, textAlign: "left", borderLeft: view === item.id ? "2px solid #fff" : "2px solid transparent" }
          },
            React.createElement("span", { style: { width: 16, textAlign: "center" } }, item.icon),
            React.createElement("span", { style: { flex: 1 } }, item.label),
            item.count !== undefined && React.createElement("span", { style: { background: "#1a1a1a", color: "#666", fontSize: 11, padding: "2px 7px", borderRadius: 20, fontFamily: "'DM Mono', monospace" } }, item.count)
          )
        )
      ),
      React.createElement("div", { style: { padding: "0 24px", borderTop: "1px solid #1a1a1a", paddingTop: 20 } },
        React.createElement("div", { style: { fontSize: 11, color: "#444", marginBottom: 4 } }, "Default split"),
        React.createElement("div", { style: { fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: "#4ade80" } }, "80%")
      )
    ),

    // Main content
    React.createElement("div", { style: { marginLeft: 220, padding: "40px" } },

      // Error banner
      dbError && React.createElement("div", { style: { background: "#2e1a1a", border: "1px solid #5a2a2a", borderRadius: 10, padding: "14px 20px", marginBottom: 24, fontSize: 13, color: "#f87171" } },
        React.createElement("div", { style: { fontWeight: 700, marginBottom: 6 } }, "⚠️ Database error:"),
        React.createElement("div", { style: { fontFamily: "'DM Mono', monospace", fontSize: 12, background: "#1a0a0a", padding: "10px 14px", borderRadius: 6, marginBottom: 10, wordBreak: "break-all" } }, dbError),
        React.createElement("button", { onClick: loadData, style: { background: "none", border: "none", color: "#f87171", cursor: "pointer", textDecoration: "underline", fontSize: 13 } }, "Retry")
      ),

      // Dashboard
      view === "dashboard" && React.createElement("div", {},
        React.createElement("div", { style: { marginBottom: 32 } },
          React.createElement("div", { style: { fontSize: 24, fontWeight: 700, marginBottom: 6 } }, "Overview"),
          React.createElement("div", { style: { color: "#555", fontSize: 14 } }, "The Good Kid — Live Consignment Data")
        ),
        loading ? React.createElement(Spinner) : React.createElement("div", {},
          React.createElement("div", { style: { display: "flex", gap: 16, marginBottom: 32, flexWrap: "wrap" } },
            React.createElement(StatCard, { label: "Listed Items", value: stats.listed, sub: "Active inventory" }),
            React.createElement(StatCard, { label: "Items Sold", value: stats.sold, sub: "All time" }),
            React.createElement(StatCard, { label: "Listed Value", value: `$${stats.totalValue.toLocaleString()}`, sub: "At asking price" }),
            React.createElement(StatCard, { label: "Revenue", value: `$${stats.totalSold.toLocaleString()}`, sub: "Total sold" }),
            React.createElement(StatCard, { label: "Owed to Consignors", value: `$${stats.totalOwed.toLocaleString()}`, sub: "Outstanding payouts" }),
            React.createElement(StatCard, { label: "Store Margin", value: `$${stats.totalMargin.toLocaleString()}`, sub: "20% of sales" })
          ),
          React.createElement("div", { style: { background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, overflow: "hidden" } },
            React.createElement("div", { style: { padding: "20px 24px", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" } },
              React.createElement("div", { style: { fontWeight: 600, fontSize: 14 } }, "Recent Stock"),
              React.createElement("button", { onClick: () => setView("listed"), style: { background: "none", border: "1px solid #222", color: "#666", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12 } }, "View all")
            ),
            inventory.length === 0
              ? React.createElement("div", { style: { padding: "48px 20px", textAlign: "center", color: "#444", fontSize: 14 } }, "No stock yet — add your first item")
              : React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
                  React.createElement("thead", {},
                    React.createElement("tr", { style: { background: "#0d0d0d" } },
                      ["Item", "Size", "Consignor", "Price", "Status"].map(h =>
                        React.createElement("th", { key: h, style: { padding: "10px 20px", textAlign: "left", fontSize: 11, color: "#444", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" } }, h)
                      )
                    )
                  ),
                  React.createElement("tbody", {},
                    inventory.slice(0, 8).map(item =>
                      React.createElement("tr", { key: item.id, style: { borderTop: "1px solid #161616" } },
                        React.createElement("td", { style: { padding: "14px 20px" } },
                          React.createElement("div", { style: { fontWeight: 600, fontSize: 14 } }, item.name),
                          React.createElement("div", { style: { color: "#555", fontSize: 12, marginTop: 2 } }, item.brand)
                        ),
                        React.createElement("td", { style: { padding: "14px 20px", color: "#888", fontSize: 13, fontFamily: "'DM Mono', monospace" } }, item.size),
                        React.createElement("td", { style: { padding: "14px 20px", color: "#888", fontSize: 13 } }, item.consignors?.name),
                        React.createElement("td", { style: { padding: "14px 20px", fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 14 } }, `$${item.list_price}`),
                        React.createElement("td", { style: { padding: "14px 20px" } }, React.createElement(Badge, { status: item.status }))
                      )
                    )
                  )
                )
          )
        )
      ),

      // Listed / Sold
      (view === "listed" || view === "sold") && React.createElement("div", {},
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28 } },
          React.createElement("div", {},
            React.createElement("div", { style: { fontSize: 24, fontWeight: 700, marginBottom: 6 } }, view === "listed" ? "Listed Stock" : "Sold Stock"),
            React.createElement("div", { style: { color: "#555", fontSize: 14 } }, `${displayInventory.length} items`)
          ),
          React.createElement("div", { style: { display: "flex", gap: 10 } },
            React.createElement("select", { value: filterConsignor, onChange: e => setFilterConsignor(e.target.value), style: { background: "#111", border: "1px solid #222", color: "#888", padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", outline: "none" } },
              React.createElement("option", { value: "all" }, "All consignors"),
              consignors.map(c => React.createElement("option", { key: c.id, value: c.id }, c.name))
            ),
            React.createElement("button", { onClick: loadData, style: { background: "transparent", border: "1px solid #222", color: "#666", padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer" } }, "↻"),
            view === "listed" && React.createElement("button", { onClick: () => setView("upload"), style: { background: "#fff", color: "#000", border: "none", padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" } }, "+ Add Stock")
          )
        ),
        loading ? React.createElement(Spinner) : React.createElement("div", { style: { background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, overflow: "hidden" } },
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
            React.createElement("thead", {},
              React.createElement("tr", { style: { background: "#0d0d0d" } },
                ["Item", "Brand", "Size", "Cond", "Consignor", "Price", "They Get", view === "listed" ? "Added" : "Sold", ""].map((h, i) =>
                  React.createElement("th", { key: i, style: { padding: "10px 20px", textAlign: "left", fontSize: 11, color: "#444", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" } }, h)
                )
              )
            ),
            React.createElement("tbody", {},
              displayInventory.length === 0
                ? React.createElement("tr", {}, React.createElement("td", { colSpan: 9, style: { padding: "48px 20px", textAlign: "center", color: "#444", fontSize: 14 } }, "No items found"))
                : displayInventory.map(item => {
                    const split = item.consignors?.split_percent ? item.consignors.split_percent / 100 : SPLIT;
                    return React.createElement("tr", { key: item.id, style: { borderTop: "1px solid #161616" } },
                      React.createElement("td", { style: { padding: "14px 20px" } },
                        React.createElement("div", { style: { fontWeight: 600, fontSize: 14 } }, item.name),
                        item.sku && React.createElement("div", { style: { color: "#444", fontSize: 11, marginTop: 2, fontFamily: "'DM Mono', monospace" } }, item.sku)
                      ),
                      React.createElement("td", { style: { padding: "14px 20px", color: "#888", fontSize: 13 } }, item.brand),
                      React.createElement("td", { style: { padding: "14px 20px", color: "#888", fontSize: 13, fontFamily: "'DM Mono', monospace" } }, item.size),
                      React.createElement("td", { style: { padding: "14px 20px" } }, React.createElement("span", { style: { background: "#1a1a1a", color: "#888", fontSize: 11, padding: "3px 8px", borderRadius: 4, fontFamily: "'DM Mono', monospace" } }, item.condition)),
                      React.createElement("td", { style: { padding: "14px 20px", color: "#888", fontSize: 13 } }, item.consignors?.name),
                      React.createElement("td", { style: { padding: "14px 20px", fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 14 } }, `$${item.list_price}`),
                      React.createElement("td", { style: { padding: "14px 20px", fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#4ade80" } }, `$${(item.list_price * split).toFixed(0)}`),
                      React.createElement("td", { style: { padding: "14px 20px", color: "#555", fontSize: 12, fontFamily: "'DM Mono', monospace" } }, view === "listed" ? item.date_added : item.date_sold),
                      React.createElement("td", { style: { padding: "14px 20px" } },
                        view === "listed"
                          ? React.createElement("button", { onClick: () => setConfirmSell(item), style: { background: "transparent", border: "1px solid #333", color: "#888", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" } }, "Mark Sold")
                          : React.createElement(Badge, { status: "sold" })
                      )
                    );
                  })
            )
          )
        )
      ),

      // Consignors
      view === "consignors" && React.createElement("div", {},
        React.createElement("div", { style: { marginBottom: 32 } },
          React.createElement("div", { style: { fontSize: 24, fontWeight: 700, marginBottom: 6 } }, "Consignors"),
          React.createElement("div", { style: { color: "#555", fontSize: 14 } }, `${consignors.length} active consignors`)
        ),
        loading ? React.createElement(Spinner) :
        consignorStats.length === 0
          ? React.createElement("div", { style: { color: "#444", fontSize: 14, textAlign: "center", padding: 60 } }, "No consignors yet")
          : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
              consignorStats.map(c =>
                React.createElement("div", { key: c.id, style: { background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, padding: 24 } },
                  React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 } },
                    React.createElement("div", {},
                      React.createElement("div", { style: { fontWeight: 700, fontSize: 18, marginBottom: 4 } }, c.name),
                      React.createElement("div", { style: { color: "#555", fontSize: 13 } }, c.email || "No email on file")
                    ),
                    React.createElement("div", { style: { textAlign: "right" } },
                      React.createElement("div", { style: { color: "#444", fontSize: 11, textTransform: "uppercase", marginBottom: 4 } }, "Balance owed"),
                      React.createElement("div", { style: { fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 24, color: "#4ade80" } }, `$${c.balance.toFixed(0)}`)
                    )
                  ),
                  React.createElement("div", { style: { display: "flex", gap: 16 } },
                    [["Listed", c.listed.length], ["Sold", c.sold.length], ["Split", `${c.split_percent}%`], ["Value", `$${c.items.reduce((a, b) => a + b.list_price, 0).toLocaleString()}`]].map(([label, val]) =>
                      React.createElement("div", { key: label, style: { background: "#0d0d0d", borderRadius: 8, padding: "12px 20px", flex: 1, textAlign: "center" } },
                        React.createElement("div", { style: { color: "#555", fontSize: 11, marginBottom: 4, textTransform: "uppercase" } }, label),
                        React.createElement("div", { style: { fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 20 } }, val)
                      )
                    )
                  )
                )
              )
            )
      ),

      // Add Stock
      view === "upload" && React.createElement("div", { style: { maxWidth: 600 } },
        React.createElement("div", { style: { marginBottom: 32 } },
          React.createElement("div", { style: { fontSize: 24, fontWeight: 700, marginBottom: 6 } }, "Add Stock"),
          React.createElement("div", { style: { color: "#555", fontSize: 14 } }, "Saved directly to your database")
        ),
        React.createElement("div", { style: { background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, padding: 28 } },
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 } },
            React.createElement("div", {},
              React.createElement("label", { style: labelStyle }, "Brand *"),
              React.createElement("select", { value: form.brand, onChange: e => setForm({ ...form, brand: e.target.value }), style: { ...inputStyle, cursor: "pointer" } },
                React.createElement("option", { value: "" }, "Select brand"),
                BRANDS.map(b => React.createElement("option", { key: b, value: b }, b))
              )
            ),
            React.createElement("div", {},
              React.createElement("label", { style: labelStyle }, "Condition"),
              React.createElement("select", { value: form.condition, onChange: e => setForm({ ...form, condition: e.target.value }), style: { ...inputStyle, cursor: "pointer" } },
                CONDITIONS.map(c => React.createElement("option", { key: c, value: c }, c))
              )
            )
          ),
          [
            { label: "Item Name *", key: "name", placeholder: "e.g. Air Jordan 1 Retro High OG" },
            { label: "Size", key: "size", placeholder: "e.g. US 10 / M / L" },
            { label: "SKU / Style Code", key: "sku", placeholder: "e.g. 555088-134" },
          ].map(field =>
            React.createElement("div", { key: field.key, style: { marginBottom: 16 } },
              React.createElement("label", { style: labelStyle }, field.label),
              React.createElement("input", { style: inputStyle, placeholder: field.placeholder, value: form[field.key], onChange: e => setForm({ ...form, [field.key]: e.target.value }) })
            )
          ),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 } },
            React.createElement("div", {},
              React.createElement("label", { style: labelStyle }, "List Price (AUD) *"),
              React.createElement("input", { style: inputStyle, placeholder: "280", type: "number", value: form.list_price, onChange: e => setForm({ ...form, list_price: e.target.value }) })
            ),
            React.createElement("div", {},
              React.createElement("label", { style: labelStyle }, "Cost / Floor"),
              React.createElement("input", { style: inputStyle, placeholder: "220", type: "number", value: form.cost_price, onChange: e => setForm({ ...form, cost_price: e.target.value }) })
            )
          ),
          form.list_price && React.createElement("div", { style: { background: "#0d0d0d", borderRadius: 8, padding: "12px 16px", marginBottom: 20, display: "flex", justifyContent: "space-between" } },
            React.createElement("span", { style: { color: "#555", fontSize: 13 } }, "Consignor receives (80%)"),
            React.createElement("span", { style: { fontFamily: "'DM Mono', monospace", color: "#4ade80", fontWeight: 600 } }, `$${(parseFloat(form.list_price || 0) * SPLIT).toFixed(0)}`)
          ),
          React.createElement("div", { style: { borderTop: "1px solid #1a1a1a", paddingTop: 20, marginBottom: 20 } },
            React.createElement("div", { style: { fontSize: 12, color: "#555", marginBottom: 14, textTransform: "uppercase" } }, "Consignor Details"),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } },
              React.createElement("div", {},
                React.createElement("label", { style: labelStyle }, "Name *"),
                React.createElement("input", { style: inputStyle, placeholder: "Full name", value: form.consignor_name, onChange: e => setForm({ ...form, consignor_name: e.target.value }), list: "consignor-list" }),
                React.createElement("datalist", { id: "consignor-list" }, consignors.map(c => React.createElement("option", { key: c.id, value: c.name })))
              ),
              React.createElement("div", {},
                React.createElement("label", { style: labelStyle }, "Email"),
                React.createElement("input", { style: inputStyle, placeholder: "email@example.com", type: "email", value: form.consignor_email, onChange: e => setForm({ ...form, consignor_email: e.target.value }) })
              )
            )
          ),
          React.createElement("button", {
            onClick: handleUpload, disabled: saving,
            style: { width: "100%", background: saving ? "#333" : "#fff", color: saving ? "#666" : "#000", border: "none", padding: "13px", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }
          }, saving ? "Saving..." : "Add to Inventory")
        )
      )
    ),

    // Confirm Sell Modal
    confirmSell && React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }, onClick: () => setConfirmSell(null) },
      React.createElement("div", { style: { background: "#111", border: "1px solid #222", borderRadius: 16, padding: 32, maxWidth: 400, width: "90%" }, onClick: e => e.stopPropagation() },
        React.createElement("div", { style: { fontSize: 18, fontWeight: 700, marginBottom: 8 } }, "Confirm Sale"),
        React.createElement("div", { style: { color: "#666", fontSize: 14, marginBottom: 24 } }, `Mark ${confirmSell.name} (${confirmSell.size}) as sold?`),
        React.createElement("div", { style: { background: "#0d0d0d", borderRadius: 8, padding: "14px 16px", marginBottom: 24 } },
          [
            ["Sale price", `$${confirmSell.list_price}`, false],
            [`${confirmSell.consignors?.name || "Consignor"} (${confirmSell.consignors?.split_percent || 80}%)`, `$${(confirmSell.list_price * ((confirmSell.consignors?.split_percent || 80) / 100)).toFixed(0)}`, true],
            ["Store margin", `$${(confirmSell.list_price * (1 - (confirmSell.consignors?.split_percent || 80) / 100)).toFixed(0)}`, false],
          ].map(([label, val, green], i) =>
            React.createElement("div", { key: i, style: { display: "flex", justifyContent: "space-between", marginBottom: i < 2 ? 10 : 0 } },
              React.createElement("span", { style: { color: "#555", fontSize: 13 } }, label),
              React.createElement("span", { style: { fontFamily: "'DM Mono', monospace", fontWeight: 600, color: green ? "#4ade80" : "#fff" } }, val)
            )
          )
        ),
        React.createElement("div", { style: { display: "flex", gap: 10 } },
          React.createElement("button", { onClick: () => setConfirmSell(null), style: { flex: 1, background: "transparent", border: "1px solid #333", color: "#888", padding: "11px", borderRadius: 8, cursor: "pointer", fontSize: 14 } }, "Cancel"),
          React.createElement("button", { onClick: () => markSold(confirmSell), disabled: saving, style: { flex: 1, background: saving ? "#2a5a2a" : "#4ade80", color: "#000", border: "none", padding: "11px", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 700 } }, saving ? "Saving..." : "Confirm Sale")
        )
      )
    ),

    // Toast
    toast && React.createElement("div", { style: { position: "fixed", bottom: 24, right: 24, background: "#1a1a1a", border: "1px solid #333", color: "#fff", padding: "14px 20px", borderRadius: 10, fontSize: 14, zIndex: 9999, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.6)", animation: "slideUp 0.3s ease" } },
      React.createElement("span", { style: { color: "#4ade80", fontSize: 18 } }, "✓"),
      toast,
      React.createElement("button", { onClick: () => setToast(null), style: { background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16, marginLeft: 8 } }, "×")
    )
  );
}
