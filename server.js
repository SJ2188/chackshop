const express = require('express');
const path = require('path');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { MongoClient, ObjectId } = require('mongodb');
const fileUpload = require('express-fileupload');

const app = express();
const PORT = process.env.PORT || 3002;

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'chackshop';

let db;
let productsCol, usersCol, ordersCol, settingsCol;

// ============ MongoDB Connect ============
async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    db = client.db(DB_NAME);
    productsCol = db.collection('products');
    usersCol = db.collection('users');
    ordersCol = db.collection('orders');
    settingsCol = db.collection('settings');

    // Ensure indexes
    await productsCol.createIndex({ id: 1 }, { unique: true });
    await ordersCol.createIndex({ id: 1 }, { unique: true });
    await usersCol.createIndex({ email: 1 }, { unique: true });

    // Seed default data if empty
    await seedDefaultData();

    console.log(`[MongoDB] Connected to ${DB_NAME}`);
  } catch (err) {
    console.error('[MongoDB] Connection failed:', err.message);
    console.log('[MongoDB] Starting with in-memory fallback...');
  }
}

async function seedDefaultData() {
  const productCount = await productsCol.countDocuments();
  if (productCount === 0) {
    console.log('[DB] Seeding default products...');
    const defaultProducts = require('./products-seed');
    if (defaultProducts && defaultProducts.length > 0) {
      const toInsert = defaultProducts.map((p, i) => ({ ...p, id: p.id || (1001 + i) }));
      await productsCol.insertMany(toInsert);
      console.log(`[DB] Inserted ${toInsert.length} products`);
    }
  }

  const userCount = await usersCol.countDocuments();
  if (userCount === 0) {
    await usersCol.insertMany([
      { id: 1, name: 'พี่ต้น', email: 'ton@email.com', password: '123456', phone: '0861234567', isAdmin: true },
      { id: 2, name: 'ลูกค้าทดสอบ', email: 'test@email.com', password: '123456', phone: '0899999999', isAdmin: false },
      { id: 3, name: 'Admin', email: 'admin@shopthai.com', password: 'admin123', phone: '0918533947', isAdmin: true },
    ]);
  }

  const settings = await settingsCol.findOne({});
  if (!settings) {
    await settingsCol.insertOne({
      codFeePercent: 10,
      transferFeePercent: 3,
      qrFeePercent: 3,
      bankName: 'ธนาคารกรุงไทย',
      bankAccount: '854-3-10966-3',
      bankAccountName: 'บริษัท สุขใจไอที จำกัด',
      qrCodeUrl: '/qr-payment.png',
    });
  }
}

// ============ Helper: Get next ID ============
async function getNextId(collection) {
  const maxDoc = await collection.findOne({}, { sort: { id: -1 } });
  return maxDoc ? (maxDoc.id || 0) + 1 : 1;
}

// ============ Line Notify ============
const LINE_NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN || '';

function sendLineNotify(message) {
  if (!LINE_NOTIFY_TOKEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams({ message });
    const options = {
      hostname: 'notify-api.line.me', path: '/api/notify',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LINE_NOTIFY_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': data.toString().length }
    };
    const req = https.request(options, (res) => {
      let body = ''; res.on('data', c => body += c); res.on('end', () => resolve());
    });
    req.on('error', reject);
    req.write(data.toString()); req.end();
  });
}

// ============ Line Pay ============
const LINE_PAY_CHANNEL_ID = process.env.LINE_PAY_CHANNEL_ID || '';
const LINE_PAY_CHANNEL_SECRET = process.env.LINE_PAY_CHANNEL_SECRET || '';

function linePayConfirm(transactionId, amount) {
  if (!LINE_PAY_CHANNEL_ID || !LINE_PAY_CHANNEL_SECRET) return Promise.resolve({ success: false });
  const body = JSON.stringify({ amount, currency: 'THB', orderId: `ORDER_${transactionId}` });
  const nonce = Date.now().toString();
  const crypto = require('crypto');
  const signature = crypto.createHmac('sha256', LINE_PAY_CHANNEL_SECRET).update(LINE_PAY_CHANNEL_SECRET + '/v2/payments/confirm' + body + nonce).digest('base64');
  return new Promise((resolve) => {
    const options = {
      hostname: 'sandbox-api.line.me', path: '/v2/payments/confirm', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LINE-ChannelId': LINE_PAY_CHANNEL_ID, 'X-LINE-Authorization': signature, 'X-LINE-Nonce': nonce }
    };
    const req = https.request(options, (res) => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.on('error', () => resolve({}));
    req.write(body); req.end();
  });
}

// ============ Express Middleware ============
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(fileUpload({ limits: { fileSize: 5 * 1024 * 1024 } }));

// ============ Auth Middleware ============
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = JSON.parse(Buffer.from(auth.slice(7), 'base64').toString());
    req.user = payload;
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ============ Auth API ============
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
  usersCol.findOne({ email, password }).then(user => {
    if (!user) return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    const token = Buffer.from(JSON.stringify({ id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin })).toString('base64');
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin } });
  });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
  
  // Check if email already exists
  const existing = await usersCol.findOne({ email });
  if (existing) return res.status(400).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
  
  const id = await getNextId(usersCol);
  const user = { id, name, email, password, phone: phone || '', isAdmin: false };
  await usersCol.insertOne(user);
  
  const token = Buffer.from(JSON.stringify({ id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin })).toString('base64');
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => res.json(req.user));

// ============ Products API ============
app.get('/api/products', async (req, res) => {
  try {
    const products = await productsCol.find({}).toArray();
    res.json(products);
  } catch { res.json([]); }
});

app.get('/api/products/:id', async (req, res) => {
  const product = await productsCol.findOne({ id: parseInt(req.params.id) });
  product ? res.json(product) : res.status(404).json({ error: 'Not found' });
});

app.put('/api/products/:id', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  const { id } = req.params;
  delete req.body._id;
  const result = await productsCol.updateOne({ id: parseInt(id) }, { $set: req.body });
  const updated = await productsCol.findOne({ id: parseInt(id) });
  res.json(updated);
});

app.post('/api/products', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  const id = await getNextId(productsCol);
  const product = { ...req.body, id };
  await productsCol.insertOne(product);
  res.json(product);
});

app.delete('/api/products/:id', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  await productsCol.deleteOne({ id: parseInt(req.params.id) });
  res.json({ success: true });
});

// ============ Orders API ============
app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    const orders = await ordersCol.find({}).sort({ id: -1 }).toArray();
    res.json(orders);
  } catch { res.json([]); }
});

app.get('/api/orders/:id', authMiddleware, async (req, res) => {
  const order = await ordersCol.findOne({ id: parseInt(req.params.id) });
  order ? res.json(order) : res.status(404).json({ error: 'Not found' });
});

app.put('/api/orders/:id/status', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  const { status } = req.body;
  await ordersCol.updateOne({ id: parseInt(req.params.id) }, { $set: { status } });
  res.json({ success: true });
});

// ============ Guest Order (external) ============
app.post('/api/guest-order', async (req, res) => {
  const { items, subtotal, feeAmount, total, paymentMethod, deliveryMethod, address, customerName, customerEmail, customerPhone } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'ไม่มีสินค้า' });
  if (!customerName || !customerEmail) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });

  const id = await getNextId(ordersCol);

  // Deduct stock
  for (const item of items) {
    await productsCol.updateOne({ id: item.productId }, { $inc: { stock: -(item.qty || 1) } });
  }

  const order = {
    id, userId: null, userName: customerName, userEmail: customerEmail, userPhone: customerPhone || '',
    items, subtotal: subtotal || total, feeAmount: feeAmount || 0, total,
    paymentMethod: paymentMethod || 'cod', deliveryMethod: deliveryMethod || 'pickup',
    address: address || '', status: 'pending', isGuest: true, createdAt: new Date().toISOString()
  };
  await ordersCol.insertOne(order);
  console.log('[Guest Order]', `Order #${id}`, customerName, `฿${total}`);
  res.json({ success: true, orderId: id });
});

// ============ Authenticated Order ============
app.post('/api/orders', authMiddleware, async (req, res) => {
  const { items, subtotal, feeAmount, total, paymentMethod, deliveryMethod, address } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'ไม่มีสินค้าในคำสั่งซื้อ' });

  const id = await getNextId(ordersCol);
  const stockUpdates = [];

  for (const item of items) {
    const product = await productsCol.findOne({ id: item.productId });
    if (product) {
      const newStock = Math.max(0, product.stock - item.qty);
      stockUpdates.push({ id: product.id, name: product.name, oldStock: product.stock, newStock, qty: item.qty });
      await productsCol.updateOne({ id: item.productId }, { $set: { stock: newStock } });
    }
  }

  const order = {
    id, userId: req.user.id, userName: req.user.name, userEmail: req.user.email,
    items, subtotal: subtotal || total, feeAmount: feeAmount || 0, total,
    paymentMethod: paymentMethod || 'cod', deliveryMethod: deliveryMethod || 'pickup',
    address: address || '', status: 'pending', createdAt: new Date().toISOString()
  };
  await ordersCol.insertOne(order);

  const itemList = items.slice(0, 5).map(i => `• ${i.name} x${i.qty}`).join('\n');
  const more = items.length > 5 ? `\n...และอีก ${items.length - 5} รายการ` : '';
  const deliveryLabel = deliveryMethod === 'pickup' ? '🏪 รับเองที่ร้าน' : `📍 จัดส่ง: ${address}`;
  const feeLine = feeAmount > 0 ? `\n💰 ค่าธรรมเนียม: ฿${feeAmount.toLocaleString()}` : '';
  const message = [
    `🛒 มีออเดอร์ใหม่!`, `────────────────`, `📋 Order #${id}`, `👤 ${req.user.name}`, `📱 ${req.user.email}`,
    `────────────────`, `${itemList}${more}`, `────────────────`,
    `🛍️ ราคาสินค้า: ฿${(subtotal || total).toLocaleString()}${feeLine}`, `💰 รวม: ฿${total.toLocaleString()}`,
    `💳 ชำระ: ${paymentMethod === 'cod' ? 'COD' : paymentMethod === 'qrcode' ? 'QR Code' : 'โอน'}`,
    `${deliveryLabel}`, `────────────────`,
    `📦 สต็อกอัปเดต: ${stockUpdates.map(s => `${s.name}: ${s.oldStock}→${s.newStock}`).join(', ')}`
  ].join('\n');

  try { await sendLineNotify(message); } catch (e) { console.log('[Line] Notify failed:', e.message); }
  console.log('[Order Created]', `Order #${id}`, req.user.name, `Total: ฿${total}`);

  res.json(order);
});

// ============ Users API ============
app.get('/api/users', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  const users = await usersCol.find({}, { projection: { password: 0 } }).toArray();
  res.json(users);
});

app.put('/api/users/:id', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  const { name, email, phone, password } = req.body;
  const update = {};
  if (name) update.name = name;
  if (email) update.email = email;
  if (phone !== undefined) update.phone = phone;
  if (password) update.password = password;
  await usersCol.updateOne({ id: parseInt(req.params.id) }, { $set: update });
  const updated = await usersCol.findOne({ id: parseInt(req.params.id) }, { projection: { password: 0 } });
  res.json(updated);
});

app.delete('/api/users/:id', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  await usersCol.deleteOne({ id: parseInt(req.params.id) });
  res.json({ success: true });
});

// ============ Stats API ============
app.get('/api/stats', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  try {
    const [totalProducts, totalOrders, totalUsers, orders] = await Promise.all([
      productsCol.countDocuments(),
      ordersCol.countDocuments(),
      usersCol.countDocuments(),
      ordersCol.find({}).toArray()
    ]);
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    res.json({ totalProducts, totalOrders, totalUsers, totalRevenue });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ Settings API ============
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await settingsCol.findOne({}) || {};
    res.json(settings);
  } catch { res.json({}); }
});

app.put('/api/settings', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  const { codFeePercent, transferFeePercent, qrFeePercent, bankName, bankAccount, bankAccountName, qrCodeUrl } = req.body;
  await settingsCol.updateOne({}, {
    $set: {
      ...(codFeePercent !== undefined && { codFeePercent: parseFloat(codFeePercent) }),
      ...(transferFeePercent !== undefined && { transferFeePercent: parseFloat(transferFeePercent) }),
      ...(qrFeePercent !== undefined && { qrFeePercent: parseFloat(qrFeePercent) }),
      ...(bankName && { bankName }), ...(bankAccount && { bankAccount }),
      ...(bankAccountName && { bankAccountName }), ...(qrCodeUrl && { qrCodeUrl }),
    }
  }, { upsert: true });
  const updated = await settingsCol.findOne({});
  res.json(updated);
});

// ============ Image Upload ============
const fs = require('fs');
const imagesDir = path.join(__dirname, 'public', 'images');
if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

app.post('/api/upload', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  if (!req.files || !req.files.image) return res.status(400).json({ error: 'ไม่พบไฟล์' });
  const file = req.files.image;
  const ext = path.extname(file.name).toLowerCase();
  const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  if (!allowed.includes(ext)) return res.status(400).json({ error: 'รองรับเฉพาะไฟล์รูปภาพ' });
  const filename = `product_${Date.now()}${ext}`;
  const filepath = path.join(imagesDir, filename);
  await file.mv(filepath);
  res.json({ url: `/images/${filename}` });
});

// ============ Config ============
app.get('/api/config', (req, res) => {
  res.json({
    linePayAvailable: !!(LINE_PAY_CHANNEL_ID && LINE_PAY_CHANNEL_SECRET),
    lineNotifyConfigured: !!LINE_NOTIFY_TOKEN
  });
});

// ============ Static Files ============
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin.html', (req, res) => res.redirect('/admin'));
app.get('/order/:token', (req, res) => res.sendFile(path.join(__dirname, 'public', 'external-order.html')));
app.get('/external-order.html', (req, res) => res.redirect('/order/none'));

// ============ Start Server ============
connectDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Running on port ${PORT}`);
    console.log(`[Server] Admin: http://localhost:${PORT}/admin`);
  });
});
