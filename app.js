// Database Setup
const db = new Dexie('BalajiSugandhalayDB');
db.version(1).stores({
  products: '++id, barcode, name, price, stock',
  sales: '++id, invoiceNumber, date, total, payMode',
  saleItems: '++id, saleId, productId, name, qty, price, subtotal'
});

db.on('ready', async () => {
  const count = await db.products.count();
  if (count === 0) {
    await db.products.bulkAdd([
      { barcode: '101', name: 'Balaji Chandan Agarbatti 250g', price: 130, stock: 45 },
      { barcode: '102', name: 'Zed Black Rose Agarbatti 120g', price: 70, stock: 60 },
      { barcode: '103', name: 'Pure Sandalwood Attar 10ml', price: 320, stock: 15 },
      { barcode: '104', name: 'Shahi Gulab Dhoop Cones (30 pcs)', price: 90, stock: 35 },
      { barcode: '105', name: 'Mangaldeep Camphor Tablets 100g', price: 85, stock: 50 }
    ]);
  }
});

let cart = [];
let currentView = 'billing';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const target = e.currentTarget;
    target.classList.add('active');
    currentView = target.dataset.view;
    renderCurrentView();
  });
});

function renderCurrentView() {
  if (currentView === 'billing') renderBilling();
  else if (currentView === 'inventory') renderInventory();
  else if (currentView === 'sales') renderSales();
  else if (currentView === 'backup') renderBackup();
}

function renderBilling() {
  const container = document.getElementById('view-container');
  container.innerHTML = `
    <div class="pos-screen">
      <div class="pos-left">
        <div class="barcode-box">
          <input type="text" id="barcode-input" class="barcode-input" placeholder="Scan Barcode (101, 102...) or Type Product Name + Enter" autofocus>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th width="80">Qty</th>
                <th width="100">Price (₹)</th>
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
          <h3>Bill Summary</h3>
          <div class="summary-line"><span>Total Items:</span><strong id="sum-items">0</strong></div>
          <div class="summary-line"><span>Payment Mode:</span>
            <select id="pay-mode" style="padding:4px 8px; border-radius:4px; border:1px solid #ccc;">
              <option value="CASH">Cash</option>
              <option value="UPI">UPI / QR</option>
              <option value="CARD">Card</option>
            </select>
          </div>
          <div class="summary-line total-line"><span>Net Payable:</span><strong id="sum-total">₹0.00</strong></div>
          <button id="btn-checkout" class="btn-primary" onclick="checkout()" disabled>Print & Complete Sale</button>
        </div>
      </div>
    </div>
  `;

  const input = document.getElementById('barcode-input');
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && input.value.trim() !== '') {
      await addItem(input.value.trim());
      input.value = '';
    }
  });

  updateCartUI();
}

async function addItem(query) {
  const q = query.toLowerCase();
  let p = await db.products.where('barcode').equals(query).first();
  if (!p) {
    p = await db.products.filter(item => item.name.toLowerCase().includes(q)).first();
  }

  if (!p) {
    alert('Product not found: ' + query);
    return;
  }

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
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888; padding:30px;">Cart is empty. Scan barcode or search to add items.</td></tr>`;
  } else {
    tbody.innerHTML = cart.map((i, idx) => `
      <tr>
        <td><strong>${i.name}</strong></td>
        <td><input type="number" min="1" value="${i.qty}" style="width:50px; padding:4px; text-align:center;" onchange="updateQty(${idx}, this.value)"></td>
        <td>₹${i.price.toFixed(2)}</td>
        <td>₹${(i.price * i.qty).toFixed(2)}</td>
        <td><button class="btn-sm btn-danger" onclick="removeItem(${idx})">×</button></td>
      </tr>
    `).join('');
  }

  const total = cart.reduce((s, i) => s + (i.price * i.qty), 0);
  const items = cart.reduce((s, i) => s + i.qty, 0);

  document.getElementById('sum-items').textContent = items;
  document.getElementById('sum-total').textContent = '₹' + total.toFixed(2);
  document.getElementById('btn-checkout').disabled = cart.length === 0;
}

window.updateQty = (idx, val) => {
  cart[idx].qty = Math.max(1, parseInt(val, 10) || 1);
  updateCartUI();
};

window.removeItem = (idx) => {
  cart.splice(idx, 1);
  updateCartUI();
};

async function checkout() {
  if (cart.length === 0) return;
  const total = cart.reduce((s, i) => s + (i.price * i.qty), 0);
  const invNum = 'BS-' + Date.now().toString().slice(-6);
  const payMode = document.getElementById('pay-mode').value;

  await db.transaction('rw', db.sales, db.saleItems, db.products, async () => {
    const saleId = await db.sales.add({
      invoiceNumber: invNum,
      date: new Date().toISOString(),
      total,
      payMode
    });

    for (const item of cart) {
      await db.saleItems.add({
        saleId,
        productId: item.id,
        name: item.name,
        qty: item.qty,
        price: item.price,
        subtotal: item.price * item.qty
      });

      const p = await db.products.get(item.id);
      if (p) {
        await db.products.update(item.id, { stock: Math.max(0, (p.stock || 0) - item.qty) });
      }
    }
  });

  const printArea = document.getElementById('print-area');
  printArea.innerHTML = `
    <div style="text-align:center; margin-bottom:8px;">
      <h3 style="margin:0;">BALAJI SUGANDHALAY</h3>
      <p style="margin:2px 0; font-size:11px;">Pooja Samagri • Attar • Agarbatti</p>
      <hr style="border:none; border-top:1px dashed #000; margin:6px 0;">
      <div style="text-align:left; font-size:11px;">
        <div>Inv: ${invNum}</div>
        <div>Date: ${new Date().toLocaleString()}</div>
        <div>Mode: ${payMode}</div>
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
  cart = [];
  updateCartUI();
}

async function renderInventory() {
  const products = await db.products.toArray();
  const container = document.getElementById('view-container');
  container.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
        <h2>Product Inventory</h2>
        <button class="btn-primary" style="width:auto;" onclick="addProduct()">+ Add Item</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Barcode</th>
            <th>Name</th>
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
              <td>₹${p.price.toFixed(2)}</td>
              <td><strong>${p.stock}</strong></td>
              <td><button class="btn-sm btn-secondary" onclick="editStock(${p.id})">Adjust Stock</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

window.addProduct = async () => {
  const name = prompt('Product Name:');
  if (!name) return;
  const barcode = prompt('Barcode:') || Date.now().toString().slice(-6);
  const price = parseFloat(prompt('Selling Price (₹):') || '0');
  const stock = parseInt(prompt('Stock Quantity:') || '0', 10);
  await db.products.add({ barcode, name, price, stock });
  renderInventory();
};

window.editStock = async (id) => {
  const p = await db.products.get(id);
  const n = prompt(`New stock for ${p.name}:`, p.stock);
  if (n !== null) {
    await db.products.update(id, { stock: parseInt(n, 10) || 0 });
    renderInventory();
  }
};

async function renderSales() {
  const sales = (await db.sales.toArray()).reverse();
  const totalRev = sales.reduce((s, i) => s + i.total, 0);

  const container = document.getElementById('view-container');
  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-box">
        <div class="title">Total Revenue</div>
        <div class="val">₹${totalRev.toFixed(2)}</div>
      </div>
      <div class="stat-box">
        <div class="title">Total Bills</div>
        <div class="val">${sales.length}</div>
      </div>
    </div>
    <div class="card">
      <h3>Recent Sales</h3>
      <table>
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Date</th>
            <th>Mode</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${sales.map(s => `
            <tr>
              <td><strong>${s.invoiceNumber}</strong></td>
              <td>${new Date(s.date).toLocaleString()}</td>
              <td>${s.payMode}</td>
              <td>₹${s.total.toFixed(2)}</td>
            </tr>
          `).join('') || '<tr><td colspan="4">No sales recorded yet.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function renderBackup() {
  const container = document.getElementById('view-container');
  container.innerHTML = `
    <div class="card">
      <h2>Backup & Data Management</h2>
      <p style="margin:10px 0; color:#666;">Export all your products and sales history as a JSON backup file to keep your local data safe.</p>
      <button class="btn-primary" style="width:auto;" onclick="downloadBackup()">Download JSON Backup</button>
    </div>
  `;
}

window.downloadBackup = async () => {
  const data = {
    products: await db.products.toArray(),
    sales: await db.sales.toArray(),
    saleItems: await db.saleItems.toArray()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `BalajiSugandhalay_Backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
};

renderBilling();

// PWA Custom In-App Install Prompt Handler
let deferredPrompt = null;
const installBtn = document.getElementById('btn-install');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) {
    installBtn.style.display = 'block';
  }
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('[PWA] User choice outcome:', outcome);
    deferredPrompt = null;
    installBtn.style.display = 'none';
  });
}

window.addEventListener('appinstalled', () => {
  console.log('[PWA] App successfully installed on device.');
  if (installBtn) installBtn.style.display = 'none';
});
