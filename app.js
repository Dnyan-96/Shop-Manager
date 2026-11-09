const StorageDB = {
  getProducts() {
    const data = localStorage.getItem('bs_products');
    if (!data) {
      const defaults = [
        { id: 1, barcode: '101', name: 'Balaji Chandan Agarbatti 250g', category: 'Agarbatti', price: 130, stock: 45 },
        { id: 2, barcode: '102', name: 'Zed Black Rose Agarbatti 120g', category: 'Agarbatti', price: 70, stock: 60 },
        { id: 3, barcode: '103', name: 'Pure Sandalwood Attar 10ml', category: 'Attar', price: 320, stock: 15 },
        { id: 4, barcode: '104', name: 'Shahi Gulab Dhoop Cones (30 pcs)', category: 'Dhoop', price: 90, stock: 35 },
        { id: 5, barcode: '105', name: 'Mangaldeep Camphor Tablets 100g', category: 'Camphor', price: 85, stock: 50 },
        { id: 6, barcode: '106', name: 'Pure Cow Ghee Diya Wicks (Pack of 50)', category: 'Pooja', price: 160, stock: 30 }
      ];
      localStorage.setItem('bs_products', JSON.stringify(defaults));
      return defaults;
    }
    return JSON.parse(data);
  },
  saveProducts(products) {
    localStorage.setItem('bs_products', JSON.stringify(products));
  },
  getSales() {
    const data = localStorage.getItem('bs_sales');
    return data ? JSON.parse(data) : [];
  },
  saveSales(sales) {
    localStorage.setItem('bs_sales', JSON.stringify(sales));
  },
  getCustomers() {
    const data = localStorage.getItem('bs_customers');
    return data ? JSON.parse(data) : [];
  },
  saveCustomers(customers) {
    localStorage.setItem('bs_customers', JSON.stringify(customers));
  }
};

let cart = [];
let currentView = 'billing';
let selectedPayMode = 'CASH';
let html5QrScanner = null;
let deferredPrompt = null;
let activeScanTarget = null;

// Auto-hide sidebar toggle on mobile
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar && overlay) {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
  }
}

function navigateView(viewName) {
  currentView = viewName;
  renderCurrentView();
  // Auto-hide sidebar on mobile after clicking navigation
  if (window.innerWidth <= 860) {
    toggleSidebar();
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('btn-install');
  if (btn) btn.style.display = 'flex';
});

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-install');
  if (btn) {
    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        btn.style.display = 'none';
      }
      deferredPrompt = null;
    });
  }

  renderBilling();
});

function renderCurrentView() {
  document.querySelectorAll('.nav-btn').forEach(b => {
    if (b.dataset.view === currentView) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  if (currentView === 'billing') renderBilling();
  else if (currentView === 'inventory') renderInventory();
  else if (currentView === 'analytics') renderAnalytics();
  else if (currentView === 'customers') renderCustomers();
  else if (currentView === 'backup') renderBackup();
}

// BILLING VIEW
function renderBilling() {
  const container = document.getElementById('view-container');
  container.innerHTML = `
    <div class="pos-screen">
      <div class="pos-left">
        <div class="search-bar-row">
          <input type="text" id="barcode-input" class="search-input" placeholder="Type name or scan barcode..." autofocus>
          <button class="btn-scan" onclick="openScanner('pos')">📷 Scan</button>
        </div>
        <div class="category-pills">
          <button class="pill-btn active" onclick="filterItems('ALL', this)">All</button>
          <button class="pill-btn" onclick="filterItems('Agarbatti', this)">Agarbatti</button>
          <button class="pill-btn" onclick="filterItems('Attar', this)">Attar</button>
          <button class="pill-btn" onclick="filterItems('Dhoop', this)">Dhoop</button>
          <button class="pill-btn" onclick="filterItems('Camphor', this)">Camphor</button>
          <button class="pill-btn" onclick="filterItems('Pooja', this)">Pooja Items</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th width="90">Qty</th>
                <th width="100">Rate (₹)</th>
                <th width="100">Total (₹)</th>
                <th width="60"></th>
              </tr>
            </thead>
            <tbody id="cart-rows"></tbody>
          </table>
        </div>
      </div>

      <div class="pos-right">
        <div class="summary-card">
          <h3>Invoice Summary</h3>
          <div class="summary-line"><span>Total Items:</span><strong id="sum-items">0</strong></div>
          <div class="pay-modes-grid">
            <button class="pay-mode-btn active" onclick="setPayMode('CASH', this)">Cash</button>
            <button class="pay-mode-btn" onclick="setPayMode('UPI', this)">UPI / QR</button>
            <button class="pay-mode-btn" onclick="setPayMode('UDHAAR', this)">Udhaar</button>
          </div>
          
          <div id="udhaar-box" style="display:none; margin: 5px 0;">
            <input type="text" id="cust-name-input" class="search-input" style="padding:8px; font-size:0.9rem;" placeholder="Customer Name & Phone...">
          </div>

          <div class="summary-line total-line"><span>Net Payable:</span><strong id="sum-total">₹0.00</strong></div>
          
          <button id="btn-checkout" class="btn-primary" onclick="proceedCheckout()" disabled>Complete Sale & Print</button>
          <button id="btn-upi-show" class="btn-upi" onclick="showUpiQr()" style="display:none;">📱 Show Customer UPI QR</button>
        </div>
      </div>
    </div>
  `;

  const input = document.getElementById('barcode-input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim() !== '') {
      addItemByQuery(input.value.trim());
      input.value = '';
    }
  });

  updateCartUI();
}

function setPayMode(mode, el) {
  selectedPayMode = mode;
  document.querySelectorAll('.pay-mode-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');

  const upiBtn = document.getElementById('btn-upi-show');
  const udhaarBox = document.getElementById('udhaar-box');
  
  if (upiBtn) upiBtn.style.display = mode === 'UPI' && cart.length > 0 ? 'flex' : 'none';
  if (udhaarBox) udhaarBox.style.display = mode === 'UDHAAR' ? 'block' : 'none';
}

function filterItems(cat, el) {
  document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  const products = StorageDB.getProducts();
  const items = cat === 'ALL' ? products : products.filter(p => p.category === cat);
  
  const rows = document.getElementById('cart-rows');
  if (items.length > 0 && cart.length === 0) {
    rows.innerHTML = items.map(p => `
      <tr style="cursor:pointer;" onclick="addItemById(${p.id})">
        <td><strong>+ ${p.name}</strong> <span class="badge ${p.stock <= 10 ? 'badge-danger':'badge-success'}">${p.stock} in stock</span></td>
        <td>1</td>
        <td>₹${p.price.toFixed(2)}</td>
        <td>₹${p.price.toFixed(2)}</td>
        <td><button class="pill-btn">+ Add</button></td>
      </tr>
    `).join('');
  }
}

function addItemById(id) {
  const products = StorageDB.getProducts();
  const p = products.find(item => item.id === id);
  if (p) addToCart(p);
}

function addItemByQuery(query) {
  const q = query.toLowerCase();
  const products = StorageDB.getProducts();
  let p = products.find(item => item.barcode === query);
  if (!p) {
    p = products.find(item => item.name.toLowerCase().includes(q) || item.barcode.includes(q));
  }

  if (p) {
    addToCart(p);
  } else {
    alert('Product not found: ' + query);
  }
}

function addToCart(p) {
  const existing = cart.find(i => i.id === p.id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id: p.id, name: p.name, price: p.price, qty: 1 });
  }
  updateCartUI();
}

function updateCartUI() {
  const tbody = document.getElementById('cart-rows');
  if (!tbody) return;

  if (cart.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:35px;">Scan camera barcode or type product name to add.</td></tr>`;
  } else {
    tbody.innerHTML = cart.map((i, idx) => `
      <tr>
        <td><strong>${i.name}</strong></td>
        <td><input type="number" min="1" value="${i.qty}" style="width:55px; padding:6px; border:1px solid #cbd5e1; border-radius:6px; text-align:center;" onchange="updateCartQty(${idx}, this.value)"></td>
        <td>₹${i.price.toFixed(2)}</td>
        <td>₹${(i.price * i.qty).toFixed(2)}</td>
        <td><button class="pill-btn" style="background:#fee2e2; color:#dc2626; border:none;" onclick="removeCartItem(${idx})">×</button></td>
      </tr>
    `).join('');
  }

  const total = cart.reduce((s, i) => s + (i.price * i.qty), 0);
  const items = cart.reduce((s, i) => s + i.qty, 0);

  document.getElementById('sum-items').textContent = items;
  document.getElementById('sum-total').textContent = '₹' + total.toFixed(2);
  document.getElementById('btn-checkout').disabled = cart.length === 0;

  const upiBtn = document.getElementById('btn-upi-show');
  if (upiBtn) upiBtn.style.display = selectedPayMode === 'UPI' && cart.length > 0 ? 'flex' : 'none';
}

window.updateCartQty = (idx, val) => {
  cart[idx].qty = Math.max(1, parseInt(val, 10) || 1);
  updateCartUI();
};

window.removeCartItem = (idx) => {
  cart.splice(idx, 1);
  updateCartUI();
};

// CAMERA SCANNER
window.openScanner = (target = 'pos') => {
  activeScanTarget = target;
  const modal = document.getElementById('scanner-modal');
  modal.classList.add('active');

  html5QrScanner = new Html5Qrcode("reader");
  html5QrScanner.start(
    { facingMode: "environment" },
    { fps: 15, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      closeScanner();
      if (activeScanTarget === 'inventory') {
        const barcodeField = document.getElementById('new-prod-barcode');
        if (barcodeField) barcodeField.value = decodedText;
      } else {
        addItemByQuery(decodedText);
      }
    },
    (err) => {}
  ).catch(err => {
    alert("Camera permission denied or camera not found: " + err);
    closeScanner();
  });
};

window.closeScanner = () => {
  if (html5QrScanner) {
    html5QrScanner.stop().catch(() => {}).then(() => {
      html5QrScanner = null;
    });
  }
  document.getElementById('scanner-modal').classList.remove('active');
};

// UPI QR GENERATOR
window.showUpiQr = () => {
  const total = cart.reduce((s, i) => s + (i.price * i.qty), 0);
  if (total <= 0) return;

  const modal = document.getElementById('upi-modal');
  document.getElementById('upi-modal-amount').textContent = '₹' + total.toFixed(2);
  
  const container = document.getElementById('upi-qrcode-container');
  container.innerHTML = '';
  
  const upiId = "balajisugandhalay@upi";
  const upiUrl = `upi://pay?pa=${upiId}&pn=Balaji%20Sugandhalay&am=${total.toFixed(2)}&cu=INR&tn=StorePurchase`;

  new QRCode(container, {
    text: upiUrl,
    width: 200,
    height: 200,
    colorDark : "#141821",
    colorLight : "#ffffff",
    correctLevel : QRCode.CorrectLevel.M
  });

  modal.classList.add('active');
};

window.closeUpiModal = () => {
  document.getElementById('upi-modal').classList.remove('active');
};

window.confirmUpiPayment = () => {
  closeUpiModal();
  proceedCheckout();
};

function proceedCheckout() {
  if (cart.length === 0) return;
  const total = cart.reduce((s, i) => s + (i.price * i.qty), 0);
  const invNum = 'BS-' + Date.now().toString().slice(-6);
  const custName = document.getElementById('cust-name-input')?.value.trim() || 'Walk-in Retail';

  const products = StorageDB.getProducts();
  const sales = StorageDB.getSales();
  const customers = StorageDB.getCustomers();

  const newSale = {
    id: Date.now(),
    invoiceNumber: invNum,
    date: new Date().toISOString(),
    total,
    payMode: selectedPayMode,
    customerName: custName,
    items: [...cart]
  };

  sales.push(newSale);
  StorageDB.saveSales(sales);

  cart.forEach(item => {
    const p = products.find(prod => prod.id === item.id);
    if (p) {
      p.stock = Math.max(0, p.stock - item.qty);
    }
  });
  StorageDB.saveProducts(products);

  if (selectedPayMode === 'UDHAAR') {
    customers.push({ id: Date.now(), name: custName, phone: '', balance: total });
    StorageDB.saveCustomers(customers);
  }

  printReceipt(invNum, total, selectedPayMode);
  cart = [];
  updateCartUI();
}

function printReceipt(invNum, total, payMode) {
  const printArea = document.getElementById('print-area');
  printArea.innerHTML = `
    <div style="text-align:center; margin-bottom:8px;">
      <h3 style="margin:0; font-size:15px;">BALAJI SUGANDHALAY</h3>
      <p style="margin:2px 0; font-size:11px;">Pooja Samagri • Attar • Agarbatti</p>
      <hr style="border:none; border-top:1px dashed #000; margin:6px 0;">
      <div style="text-align:left; font-size:11px;">
        <div>Inv: ${invNum}</div>
        <div>Date: ${new Date().toLocaleString()}</div>
        <div>Pay Mode: ${payMode}</div>
      </div>
      <hr style="border:none; border-top:1px dashed #000; margin:6px 0;">
    </div>
    <table style="width:100%; font-size:11px;">
      ${cart.map(i => `<tr><td>${i.name}<br><small>${i.qty} x ₹${i.price}</small></td><td style="text-align:right;">₹${(i.qty * i.price).toFixed(2)}</td></tr>`).join('')}
    </table>
    <hr style="border:none; border-top:1px dashed #000; margin:6px 0;">
    <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:13px;">
      <span>TOTAL:</span><span>₹${total.toFixed(2)}</span>
    </div>
    <div style="text-align:center; font-size:10px; margin-top:8px;">Thank You! Visit Again</div>
  `;

  window.print();
}

// INVENTORY VIEW WITH SCAN & ADD OPTION
function renderInventory() {
  const products = StorageDB.getProducts();
  const container = document.getElementById('view-container');
  container.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:10px;">
        <h2>Product Catalog & Stock</h2>
        <button class="btn-primary" style="width:auto; padding:10px 18px;" onclick="showAddProductModal()">+ Scan & Add Product</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Barcode</th>
              <th>Item Name</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${products.map(p => `
              <tr>
                <td><code>${p.barcode}</code></td>
                <td><strong>${p.name}</strong></td>
                <td>${p.category || 'General'}</td>
                <td>₹${p.price.toFixed(2)}</td>
                <td><span class="badge ${p.stock <= 10 ? 'badge-danger':'badge-success'}">${p.stock} units</span></td>
                <td><button class="pill-btn" onclick="adjustProductStock(${p.id})">Stock</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add Product Modal with Barcode Scan Support -->
    <div id="add-product-modal" class="modal">
      <div class="modal-card">
        <div class="modal-header">
          <h3>📦 Add New Product</h3>
          <button class="modal-close" onclick="closeAddProductModal()">×</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div>
            <label style="font-size:0.85rem; font-weight:600; color:#718096;">Barcode / QR Code</label>
            <div style="display:flex; gap:8px; margin-top:4px;">
              <input type="text" id="new-prod-barcode" class="search-input" style="padding:10px;" placeholder="Scan or type barcode...">
              <button class="btn-scan" onclick="openScanner('inventory')" style="padding:0 12px; font-size:0.85rem;">📷 Scan</button>
            </div>
          </div>
          <div>
            <label style="font-size:0.85rem; font-weight:600; color:#718096;">Product Name</label>
            <input type="text" id="new-prod-name" class="search-input" style="padding:10px; margin-top:4px;" placeholder="e.g. Special Loban Dwood">
          </div>
          <div>
            <label style="font-size:0.85rem; font-weight:600; color:#718096;">Category</label>
            <select id="new-prod-category" class="search-input" style="padding:10px; margin-top:4px; width:100%;">
              <option value="Agarbatti">Agarbatti</option>
              <option value="Attar">Attar</option>
              <option value="Dhoop">Dhoop</option>
              <option value="Camphor">Camphor</option>
              <option value="Pooja">Pooja Items</option>
            </select>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div>
              <label style="font-size:0.85rem; font-weight:600; color:#718096;">Price (₹)</label>
              <input type="number" id="new-prod-price" class="search-input" style="padding:10px; margin-top:4px;" placeholder="100">
            </div>
            <div>
              <label style="font-size:0.85rem; font-weight:600; color:#718096;">Initial Stock</label>
              <input type="number" id="new-prod-stock" class="search-input" style="padding:10px; margin-top:4px;" placeholder="50">
            </div>
          </div>
          <button class="btn-primary" style="margin-top:8px;" onclick="saveNewProduct()">Save Product to Database</button>
        </div>
      </div>
    </div>
  `;
}

window.showAddProductModal = () => {
  document.getElementById('add-product-modal').classList.add('active');
  document.getElementById('new-prod-barcode').value = 'BS-' + Date.now().toString().slice(-5);
};

window.closeAddProductModal = () => {
  document.getElementById('add-product-modal').classList.remove('active');
};

window.saveNewProduct = () => {
  const barcode = document.getElementById('new-prod-barcode').value.trim();
  const name = document.getElementById('new-prod-name').value.trim();
  const category = document.getElementById('new-prod-category').value;
  const price = parseFloat(document.getElementById('new-prod-price').value) || 0;
  const stock = parseInt(document.getElementById('new-prod-stock').value, 10) || 0;

  if (!name) {
    alert('Please enter a product name.');
    return;
  }

  const products = StorageDB.getProducts();
  products.push({ id: Date.now(), barcode, name, category, price, stock });
  StorageDB.saveProducts(products);
  closeAddProductModal();
  renderInventory();
};

window.adjustProductStock = (id) => {
  const products = StorageDB.getProducts();
  const p = products.find(item => item.id === id);
  if (!p) return;
  const n = prompt(`Update stock quantity for ${p.name}:`, p.stock);
  if (n !== null) {
    p.stock = parseInt(n, 10) || 0;
    StorageDB.saveProducts(products);
    renderInventory();
  }
};

// ANALYTICS VIEW
function renderAnalytics() {
  const sales = StorageDB.getSales().reverse();
  const totalRev = sales.reduce((s, i) => s + (i.total || 0), 0);
  const products = StorageDB.getProducts();
  const lowStock = products.filter(p => p.stock <= 10);

  const container = document.getElementById('view-container');
  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-box">
        <div class="title">Total Revenue</div>
        <div class="val">₹${totalRev.toFixed(2)}</div>
      </div>
      <div class="stat-box">
        <div class="title">Total Invoices</div>
        <div class="val">${sales.length}</div>
      </div>
      <div class="stat-box">
        <div class="title">Low Stock Alerts</div>
        <div class="val" style="color:var(--danger);">${lowStock.length}</div>
      </div>
    </div>

    <div class="card">
      <h3>Recent Completed Invoices</h3>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date & Time</th>
              <th>Customer</th>
              <th>Payment</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${sales.map(s => `
              <tr>
                <td><strong>${s.invoiceNumber}</strong></td>
                <td>${new Date(s.date).toLocaleString()}</td>
                <td>${s.customerName || 'Walk-in'}</td>
                <td><span class="badge ${s.payMode==='UPI'?'badge-success':'badge-danger'}">${s.payMode}</span></td>
                <td>₹${s.total.toFixed(2)}</td>
              </tr>
            `).join('') || '<tr><td colspan="5">No completed sales yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// UDHAAR LEDGER VIEW
function renderCustomers() {
  const custs = StorageDB.getCustomers();
  const container = document.getElementById('view-container');
  container.innerHTML = `
    <div class="card">
      <h2>Udhaar (Store Credit) Ledger</h2>
      <p class="text-muted" style="margin-bottom:15px;">Track pending payments from regular customers.</p>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Customer Name</th>
              <th>Outstanding Balance</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${custs.map((c, idx) => `
              <tr>
                <td><strong>${c.name}</strong></td>
                <td style="color:var(--danger); font-weight:700;">₹${c.balance.toFixed(2)}</td>
                <td><button class="pill-btn" onclick="clearUdhaar(${c.id})">Clear Balance</button></td>
              </tr>
            `).join('') || '<tr><td colspan="3">No pending credit accounts.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.clearUdhaar = (id) => {
  if (confirm('Mark this customer balance as cleared / received?')) {
    let custs = StorageDB.getCustomers();
    custs = custs.filter(c => c.id !== id);
    StorageDB.saveCustomers(custs);
    renderCustomers();
  }
};

// BACKUP VIEW
function renderBackup() {
  const container = document.getElementById('view-container');
  container.innerHTML = `
    <div class="card">
      <h2>Backup & Data Management</h2>
      <p style="margin:10px 0; color:var(--muted);">Download your entire local store database (products, sales, customers) as a JSON file to prevent data loss.</p>
      <button class="btn-primary" style="width:auto; padding:10px 20px;" onclick="downloadBackup()">Download JSON Backup</button>
    </div>
  `;
}

window.downloadBackup = () => {
  const data = {
    products: StorageDB.getProducts(),
    sales: StorageDB.getSales(),
    customers: StorageDB.getCustomers()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `BalajiSugandhalay_Backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
};
