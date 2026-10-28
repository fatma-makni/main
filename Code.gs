/* CELIA backend. Setup:
 1. Create two Google Sheets: "CELIA Admin" (products) and "CELIA Sales" (orders). Copy each ID from its URL.
 2. script.google.com > New project > paste this file.
 3. Project Settings > Script properties: ADMIN_SS = <admin sheet ID>, SALES_SS = <sales sheet ID>, ADMIN_KEY = <long private passphrase>.
 4. Deploy > New deployment > Web app > Execute as: Me, Access: Anyone. Copy the URL into CFG.API in index.html.
 Tabs and headers are created automatically on first use. Edit SHIP to match CFG.SHIP in index.html. */
const P = PropertiesService.getScriptProperties();
const H = {
  Products: ['id','name','category','collection','price','tag','colors','sizes','status','images','description','materials','care','visible'],
  Sales: ['orderId','date','name','phone','email','country','address','notes','items','subtotal','shipping','total','currency','status'],
  Subscribers: ['email','date']
};
const SHIP = {'Tunisia':[10,190],'Europe':[37,370],'North America':[56,465],'Middle East':[43,465],'Africa':[43,465],'Rest of the world':[68,620]}; // TND, keep identical to config.js
const CURRENCY = 'TND';
const MAP = {'Tunisia':'Tunisia','France':'Europe','Italy':'Europe','Germany':'Europe','Spain':'Europe','United Kingdom':'Europe','United States':'North America','Canada':'North America'};
const parseSizes = s => Object.fromEntries(String(s).split(',').map(x => x.trim().split(':')).filter(a => a[0]).map(a => [a[0].trim(), +a[1] || 0]));

function sh(prop, name) {
  const ss = SpreadsheetApp.openById(P.getProperty(prop));
  const s = ss.getSheetByName(name) || ss.insertSheet(name);
  if (!s.getLastRow()) s.appendRow(H[name]);
  return s;
}
function rows(s) {
  const v = s.getDataRange().getValues(), h = v.shift();
  return v.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const isAdmin = k => k && k === P.getProperty('ADMIN_KEY');
const prodSheet = () => sh('ADMIN_SS', 'Products');
const findRow = (s, col, val) => s.getRange(1, col, s.getLastRow(), 1).getValues().findIndex(r => String(r[0]) === String(val)) + 1;

function doGet(e) {
  if (e.parameter.action === 'products')
    return out({products: rows(prodSheet()).filter(p => String(p.visible).toLowerCase() !== 'false')});
  return out({error: 'Unknown action'});
}

function doPost(e) {
  const d = JSON.parse(e.postData.contents), lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (d.action === 'order') return out(order(d));
    if (d.action === 'subscribe') {
      if (!/^\S+@\S+\.\S+$/.test(d.email || '')) return out({error: 'Invalid email address.'});
      sh('SALES_SS', 'Subscribers').appendRow([d.email, new Date()]);
      return out({ok: true});
    }
    if (!isAdmin(d.key)) return out({error: 'Wrong admin key.'});
    const ps = prodSheet(), ss = sh('SALES_SS', 'Sales');
    if (d.action === 'admin') return out({products: rows(ps), sales: rows(ss)});
    if (d.action === 'saveProduct') {
      const p = d.product; p.id = p.id || 'P' + Date.now();
      const row = H.Products.map(k => k === 'visible' ? String(p.visible) !== 'false' : (p[k] ?? ''));
      const r = findRow(ps, 1, p.id);
      r > 1 ? ps.getRange(r, 1, 1, row.length).setValues([row]) : ps.appendRow(row);
      return out({ok: true});
    }
    if (d.action === 'deleteProduct') {
      const r = findRow(ps, 1, d.id); if (r > 1) ps.deleteRow(r);
      return out({ok: true});
    }
    if (d.action === 'updateOrder') {
      const r = findRow(ss, 1, d.orderId);
      if (r > 1) ss.getRange(r, H.Sales.indexOf('status') + 1).setValue(d.status);
      return out({ok: true});
    }
    return out({error: 'Unknown action'});
  } catch (err) {
    return out({error: String(err.message || err)});
  } finally { lock.releaseLock(); }
}

// Order REQUEST (no payment). Prices, per-size stock and shipping are recomputed here; never trust the browser.
function order(d) {
  if (!d.name || !d.phone || !/^\S+@\S+\.\S+$/.test(d.email || '') || !d.address || !d.country) throw Error('Please complete all fields.');
  const region = MAP[d.country] || 'Rest of the world', sp = SHIP[region];
  if (!Array.isArray(d.items) || !d.items.length) throw Error('Your bag is empty.');
  const ps = prodSheet(), all = rows(ps), upd = {}, items = []; let sub = 0;
  d.items.forEach(i => {
    const p = all.find(x => String(x.id) === String(i.id)), q = Math.floor(+i.qty);
    if (!p || String(p.visible) === 'false' || p.status === 'Sold out' || !(q > 0)) throw Error('A piece in your bag is no longer available.');
    if (p.status === 'In stock') {
      const sz = upd[p.id] || parseSizes(p.sizes);
      if (!(sz[i.size] >= q)) throw Error('Not enough stock for ' + p.name + ' in size ' + i.size + '.');
      sz[i.size] -= q; upd[p.id] = sz;
    }
    sub += +p.price * q;
    items.push({id: p.id, name: p.name, size: i.size, color: i.color, qty: q, price: +p.price, status: p.status});
  });
  Object.keys(upd).forEach(id => ps.getRange(findRow(ps, 1, id), H.Products.indexOf('sizes') + 1)
    .setValue(Object.keys(upd[id]).map(k => k + ':' + upd[id][k]).join(', ')));
  const shipping = sub >= sp[1] ? 0 : sp[0], id = 'CEL-' + Date.now().toString(36).toUpperCase();
  sh('SALES_SS', 'Sales').appendRow([id, new Date(), d.name, d.phone, d.email, d.country, d.address, d.notes || '', JSON.stringify(items), sub, shipping, sub + shipping, CURRENCY, 'Awaiting payment']);
  return {ok: true, orderId: id};
}

// Run once from the editor (select "setup" > Run). Creates the two spreadsheets if their
// Script properties are missing, adds any missing tabs, and writes the header rows.
// Existing data and existing headers are never overwritten. See the log for the sheet links.
function setup() {
  [['ADMIN_SS', 'CELIA Admin', ['Products']], ['SALES_SS', 'CELIA Sales', ['Sales', 'Subscribers']]].forEach(([prop, title, tabs]) => {
    if (!P.getProperty(prop)) P.setProperty(prop, SpreadsheetApp.create(title).getId());
    tabs.forEach(n => { const s = sh(prop, n); s.setFrozenRows(1); s.getRange(1, 1, 1, H[n].length).setFontWeight('bold'); });
    const ss = SpreadsheetApp.openById(P.getProperty(prop)), blank = ss.getSheetByName('Sheet1');
    if (blank && ss.getSheets().length > 1 && !blank.getLastRow()) ss.deleteSheet(blank);
    Logger.log(title + ': ' + ss.getUrl());
  });
  if (!P.getProperty('ADMIN_KEY')) Logger.log('Still missing: add ADMIN_KEY in Project Settings > Script properties.');
}
