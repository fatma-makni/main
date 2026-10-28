/* ─────────────────────────────────────────────────────────────
   CELIA Studio — dashboard
   Tabs: Overview · Pieces · Orders
   ───────────────────────────────────────────────────────────── */
const E = s =>
    String(s ?? '').replace(
        /[&<>"']/g,
        c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    )

let A = null
let TAB = 'overview'
const OK = ['Paid', 'Processing', 'Shipped', 'Delivered']
const ST = ['Awaiting payment', ...OK, 'Cancelled', 'Refunded']
const KEY = () => sessionStorage.getItem('ck')

// Filter state — persisted across re-renders
const PF = { q: '', cat: '', status: '' }
const OF = { q: '', status: '', expanded: null }

// ── small helpers ──────────────────────────────────────────────
const ts = s => {
    const t = new Date(s).getTime()
    return isNaN(t) ? 0 : t
}
const dayOf = s => {
    const d = new Date(s)
    return isNaN(d) ? '' : d.toISOString().slice(0, 10)
}
const parseSizes = s =>
    Object.fromEntries(
        String(s || '')
        .split(',')
        .map(x => x.trim().split(':'))
        .filter(a => a[0])
        .map(a => [a[0].trim(), +a[1] || 0])
    )
const formatDate = d => {
    if (!d) return '—'
    const x = new Date(d)
    if (isNaN(x)) return String(d).slice(0, 10)
    return x.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: '2-digit' })
}
const statusPill = s => {
    if (s === 'Delivered' || s === 'Paid' || s === 'Shipped' || s === 'Processing') return 'ok'
    if (s === 'Awaiting payment') return 'warn'
    if (s === 'Cancelled' || s === 'Refunded') return 'bad'
    return ''
}

// ── init ───────────────────────────────────────────────────────
async function adminInit() {
    if (!A && KEY() && CFG.API) {
        try {
            A = await api('admin', { key: KEY() })
        } catch (e) {}
    }
    adminRender()
}

// ── render pipeline ────────────────────────────────────────────
function adminRender() {
    const b = $('#adminBody')
    if (!b) return
    if (!A) {
        b.innerHTML = loginHTML()
        return
    }
    b.innerHTML = `<div class="dash">
        <aside class="dash-nav">${navHTML()}</aside>
        <div class="dash-main"><div id="dashContent"></div></div>
    </div>${productModalHTML()}`
    renderTab()
}

function renderTab() {
    const c = $('#dashContent')
    if (!c) return
    if (TAB === 'overview') c.innerHTML = overviewHTML()
    else if (TAB === 'pieces') {
        c.innerHTML = piecesHTML()
        renderPieceList()
    } else if (TAB === 'orders') {
        c.innerHTML = ordersHTML()
        renderOrderList()
    }
}

function navHTML() {
    const items = [
        ['overview', 'Overview'],
        ['pieces', 'Pieces'],
        ['orders', 'Orders']
    ]
    return `
        <div class="dash-brand">Studio</div>
        ${items.map(([k, l]) => `<button data-tab="${k}" class="${TAB === k ? 'active' : ''}">${l}</button>`).join('')}
        <div class="dash-nav-foot"><button data-out>Sign out</button></div>
    `
}

// ── login ──────────────────────────────────────────────────────
function loginHTML() {
    return `
        <div class="dash-head">
            <div>
                <div class="kicker">CELIA studio</div>
                <h2>Sign in</h2>
                <p>Enter your admin key to manage the store.</p>
            </div>
        </div>
        <div class="panel" style="max-width:440px">
            <form id="adminLogin">
                <div class="form-field">
                    <label for="ak">Admin key</label>
                    <input id="ak" type="password" required autocomplete="current-password">
                </div>
                <button class="btn" type="submit" style="width:100%;margin-top:16px">Sign in</button>
                <div id="adminMsg" class="muted" aria-live="polite" style="margin-top:12px">${CFG.API ? '' : 'Set CFG.API in config.js first.'}</div>
            </form>
        </div>
    `
}

// ── OVERVIEW ───────────────────────────────────────────────────
function overviewHTML() {
    const S = A.sales
    const rev = S.filter(o => OK.includes(o.status))
    const tot = rev.reduce((a, o) => a + (+o.total || 0), 0)
    const avg = rev.length ? tot / rev.length : 0
    const awaiting = S.filter(o => o.status === 'Awaiting payment').length
    const hidden = A.products.filter(p => String(p.visible) === 'false').length
    const soldOut = A.products.filter(p => p.status === 'Sold out').length

    // Top pieces
    const q = {}
    S.forEach(o => {
        try {
            JSON.parse(o.items).forEach(i => (q[i.name] = (q[i.name] || 0) + (+i.qty || 0)))
        } catch (e) {}
    })
    const top = Object.entries(q).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const topMax = Math.max(1, ...top.map(t => t[1]))

    // Low stock
    const low = A.products
        .filter(p => {
            if (String(p.visible) === 'false') return false
            if (p.status !== 'In stock') return false
            return Object.values(parseSizes(p.sizes)).some(v => v < 2)
        })
        .slice(0, 5)

    // Recent orders
    const recent = [...S].sort((a, b) => ts(b.date) - ts(a.date)).slice(0, 5)

    // 14-day chart
    const days = [...Array(14)].map((_, i) => {
        const d = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10)
        const todays = rev.filter(o => dayOf(o.date) === d)
        return {
            d,
            label: d.slice(5).replace('-', '/'),
            rev: todays.reduce((a, o) => a + (+o.total || 0), 0),
            count: todays.length
        }
    })
    const mx = Math.max(1, ...days.map(d => d.rev))

    return `
        <div class="dash-head">
            <div>
                <h2>Overview</h2>
                <p>Welcome back — here's how the studio is doing.</p>
            </div>
            <button class="btn" data-new-prod>+ New piece</button>
        </div>

        <div class="kpi-grid">
            <div class="kpi">
                <div class="kpi-label">Confirmed revenue</div>
                <div class="kpi-value">${formatPrice(tot)}</div>
                <div class="kpi-delta">${rev.length} confirmed order${rev.length === 1 ? '' : 's'}</div>
            </div>
            <div class="kpi">
                <div class="kpi-label">Total orders</div>
                <div class="kpi-value">${S.length}</div>
                <div class="kpi-delta">${awaiting ? awaiting + ' awaiting payment' : 'All caught up'}</div>
            </div>
            <div class="kpi">
                <div class="kpi-label">Average order</div>
                <div class="kpi-value">${formatPrice(avg)}</div>
                <div class="kpi-delta">across confirmed orders</div>
            </div>
            <div class="kpi">
                <div class="kpi-label">Pieces</div>
                <div class="kpi-value">${A.products.length}</div>
                <div class="kpi-delta">${hidden} hidden · ${soldOut} sold out</div>
            </div>
        </div>

        <div class="chart-card">
            <div class="chart-head">
                <h3>Revenue — last 14 days</h3>
                <span class="muted">Peak ${formatPrice(mx)}</span>
            </div>
            <div class="chart-bars" role="img" aria-label="Revenue chart, last 14 days">
                ${days
                    .map(
                        d => `<div class="chart-bar" title="${d.d} — ${formatPrice(d.rev)} · ${d.count} order${d.count === 1 ? '' : 's'}">
                        <div class="chart-bar-fill ${d.rev > 0 ? '' : 'zero'}" style="height:${Math.max(2, (d.rev / mx) * 100)}%"></div>
                    </div>`
                    )
                    .join('')}
            </div>
            <div class="chart-labels">
                ${days
                    .map((d, i) => `<span>${i % 2 === 0 || i === days.length - 1 ? d.label : ''}</span>`)
                    .join('')}
            </div>
        </div>

        <div class="split">
            <div class="panel">
                <h3>Top pieces</h3>
                ${
                    top.length
                        ? `<div class="rank-list">
                            ${top
                                .map(
                                    ([name, n], i) => `
                                <div class="rank-row">
                                    <span class="rank-num">${i + 1}</span>
                                    <div>
                                        <div>${E(name)}</div>
                                        <div class="rank-bar"><span style="width:${(n / topMax) * 100}%"></span></div>
                                    </div>
                                    <span class="muted">×${n}</span>
                                </div>`
                                )
                                .join('')}
                        </div>`
                        : '<p class="muted">No sales yet.</p>'
                }
            </div>
            <div class="panel">
                <h3>Low stock</h3>
                ${
                    low.length
                        ? `<div class="rank-list">
                            ${low
                                .map(p => {
                                    const sizes = parseSizes(p.sizes)
                                    const lowSizes = Object.entries(sizes).filter(([, v]) => v < 2)
                                    return `<div class="rank-row">
                                        <span class="rank-num">!</span>
                                        <div>
                                            <div>${E(p.name)}</div>
                                            <div class="muted">${lowSizes.map(([s, v]) => `${s}: ${v}`).join(' · ')}</div>
                                        </div>
                                        <button class="text-link" data-ed="${E(p.id)}">Edit</button>
                                    </div>`
                                })
                                .join('')}
                        </div>`
                        : '<p class="muted">All pieces are well stocked.</p>'
                }
            </div>
        </div>

        <div class="panel">
            <h3>Recent orders</h3>
            ${
                recent.length
                    ? `<table class="tbl">
                        <thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
                        <tbody>
                            ${recent
                                .map(
                                    o => `<tr>
                                    <td><strong>${E(o.orderId)}</strong></td>
                                    <td>${formatDate(o.date)}</td>
                                    <td>${E(o.name)}<div class="muted">${E(o.country)}</div></td>
                                    <td>${formatPrice(+o.total)}</td>
                                    <td><span class="pill ${statusPill(o.status)}">${E(o.status)}</span></td>
                                </tr>`
                                )
                                .join('')}
                        </tbody>
                    </table>`
                    : '<p class="muted">No orders yet.</p>'
            }
        </div>
    `
}

// ── PIECES ─────────────────────────────────────────────────────
function piecesHTML() {
    const cats = [...new Set(A.products.map(p => p.category).filter(Boolean))].sort()
    return `
        <div class="dash-head">
            <div>
                <h2>Pieces</h2>
                <p>Manage the collection shown on the storefront.</p>
            </div>
            <button class="btn" data-new-prod>+ New piece</button>
        </div>
        <div class="toolbar">
            <input id="pieceSearch" placeholder="Search by name, id, category…" value="${E(PF.q)}">
            <select id="pieceCat" aria-label="Filter by category">
                <option value="">All categories</option>
                ${cats.map(c => `<option value="${E(c)}" ${PF.cat === c ? 'selected' : ''}>${E(c)}</option>`).join('')}
            </select>
            <select id="pieceStatus" aria-label="Filter by status">
                <option value="">All statuses</option>
                <option ${PF.status === 'In stock' ? 'selected' : ''}>In stock</option>
                <option ${PF.status === 'Preorder inquiry' ? 'selected' : ''}>Preorder inquiry</option>
                <option ${PF.status === 'Sold out' ? 'selected' : ''}>Sold out</option>
                <option value="hidden" ${PF.status === 'hidden' ? 'selected' : ''}>Hidden</option>
            </select>
            <span class="spacer"></span>
            <span class="muted" id="pieceCount"></span>
        </div>
        <div class="table-wrap">
            <table class="tbl">
                <thead>
                    <tr><th></th><th>Piece</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr>
                </thead>
                <tbody id="pieceList"></tbody>
            </table>
        </div>
    `
}

function renderPieceList() {
    const list = $('#pieceList')
    if (!list) return
    const q = PF.q.trim().toLowerCase()
    const filtered = A.products.filter(p => {
        const hay = `${p.name || ''} ${p.id || ''} ${p.category || ''} ${p.collection || ''}`.toLowerCase()
        if (q && !hay.includes(q)) return false
        if (PF.cat && p.category !== PF.cat) return false
        if (PF.status === 'hidden') return String(p.visible) === 'false'
        if (PF.status && p.status !== PF.status) return false
        return true
    })

    const count = $('#pieceCount')
    if (count) count.textContent = `${filtered.length} / ${A.products.length}`

    if (!filtered.length) {
        list.innerHTML = `<tr><td colspan="7" class="empty-row">No pieces match your filters.</td></tr>`
        return
    }

    list.innerHTML = filtered
        .map(p => {
            const total = Object.values(parseSizes(p.sizes)).reduce((a, v) => a + v, 0)
            const hidden = String(p.visible) === 'false'
            const img = (p.images || '').split(',')[0].trim()
            const pill =
                p.status === 'In stock' ? 'ok' : p.status === 'Sold out' ? 'bad' : 'warn'
            return `<tr>
                <td>${img ? `<img class="thumb" src="${E(img)}" alt="">` : `<div class="thumb"></div>`}</td>
                <td>
                    <strong>${E(p.name)}</strong>
                    <div class="muted">${E(p.id)}${p.collection ? ' · ' + E(p.collection) : ''}${hidden ? ' · hidden' : ''}</div>
                </td>
                <td>${E(p.category || '—')}</td>
                <td>${formatPrice(+p.price)}</td>
                <td>${p.status === 'In stock' ? total : '—'}</td>
                <td><span class="pill ${pill}">${E(p.status || '—')}</span></td>
                <td>
                    <div class="row-actions">
                        <button data-ed="${E(p.id)}">Edit</button>
                        <button class="danger" data-del="${E(p.id)}">Delete</button>
                    </div>
                </td>
            </tr>`
        })
        .join('')
}

// ── ORDERS ─────────────────────────────────────────────────────
function ordersHTML() {
    return `
        <div class="dash-head">
            <div>
                <h2>Orders</h2>
                <p>Track and update every order.</p>
            </div>
        </div>
        <div class="toolbar">
            <input id="orderSearch" placeholder="Search order id, name, email…" value="${E(OF.q)}">
            <select id="orderStatus" aria-label="Filter by status">
                <option value="">All statuses</option>
                ${ST.map(s => `<option ${OF.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
            <span class="spacer"></span>
            <span class="muted" id="orderCount"></span>
        </div>
        <div class="table-wrap">
            <table class="tbl">
                <thead>
                    <tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th></th></tr>
                </thead>
                <tbody id="orderList"></tbody>
            </table>
        </div>
    `
}

function renderOrderList() {
    const list = $('#orderList')
    if (!list) return
    const q = OF.q.trim().toLowerCase()
    const filtered = [...A.sales]
        .filter(o => {
            if (q) {
                const hay = `${o.orderId || ''} ${o.name || ''} ${o.email || ''}`.toLowerCase()
                if (!hay.includes(q)) return false
            }
            if (OF.status && o.status !== OF.status) return false
            return true
        })
        .sort((a, b) => ts(b.date) - ts(a.date))

    const count = $('#orderCount')
    if (count) count.textContent = `${filtered.length} / ${A.sales.length}`

    if (!filtered.length) {
        list.innerHTML = `<tr><td colspan="7" class="empty-row">No orders match your filters.</td></tr>`
        return
    }

    list.innerHTML = filtered
        .map(o => {
            let items = []
            try {
                items = JSON.parse(o.items)
            } catch (e) {}
            const summary = items.map(i => `${i.name} ×${i.qty}`).join(', ')
            const expanded = OF.expanded === o.orderId
            const detail = expanded
                ? `<tr><td colspan="7" style="padding:0">
                    <div class="order-details">
                        <div class="line"><strong>Ship to:</strong> ${E(o.address || '—')}, ${E(o.country || '—')}</div>
                        <div class="line"><strong>Contact:</strong> ${E(o.phone || '—')} · ${E(o.email || '—')}</div>
                        ${o.notes ? `<div class="line"><strong>Notes:</strong> ${E(o.notes)}</div>` : ''}
                        <div class="items"><strong>Items:</strong>
                            <ul>
                                ${items
                                    .map(
                                        i =>
                                            `<li>${E(i.name)} — ${E(i.color || '—')} / ${E(i.size || '—')} ×${i.qty} @ ${formatPrice(+i.price)}</li>`
                                    )
                                    .join('')}
                            </ul>
                        </div>
                        <div class="line">
                            <strong>Subtotal:</strong> ${formatPrice(+o.subtotal)} ·
                            <strong>Shipping:</strong> ${formatPrice(+o.shipping)} ·
                            <strong>Total:</strong> ${formatPrice(+o.total)}
                        </div>
                    </div>
                </td></tr>`
                : ''
            return `<tr>
                <td><strong>${E(o.orderId)}</strong></td>
                <td>${formatDate(o.date)}</td>
                <td>${E(o.name)}<div class="muted">${E(o.country)}</div></td>
                <td class="muted" style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${E(summary)}">${E(summary) || '—'}</td>
                <td>${formatPrice(+o.total)}</td>
                <td>
                    <select data-ord="${E(o.orderId)}" aria-label="Order status" style="padding:6px 8px;border:1px solid var(--line);background:var(--white);font-size:11px">
                        ${ST.map(x => `<option ${x === o.status ? 'selected' : ''}>${x}</option>`).join('')}
                    </select>
                </td>
                <td><button class="text-link" data-expand="${E(o.orderId)}">${expanded ? 'Hide' : 'View'}</button></td>
            </tr>${detail}`
        })
        .join('')
}

// ── PRODUCT MODAL ──────────────────────────────────────────────
function productModalHTML() {
    return `
        <div class="modal product-modal" id="prodModal" role="dialog" aria-modal="true" aria-labelledby="prodModalTitle">
            <div class="modal-card">
                <button class="close" type="button" data-close-modal aria-label="Close">×</button>
                <h2 id="prodModalTitle">New piece</h2>
                <p class="muted">Saved directly to the Products sheet.</p>
                <form id="prodForm">
                    <input type="hidden" name="id">
                    <div class="form-grid">
                        <div class="form-field"><label>Name</label><input name="name" required></div>
                        <div class="form-field"><label>Price (TND)</label><input name="price" type="number" step="0.01" min="0" required></div>
                        <div class="form-field"><label>Category</label><input name="category"></div>
                        <div class="form-field"><label>Collection</label><input name="collection"></div>
                        <div class="form-field"><label>Tag</label><input name="tag"></div>
                        <div class="form-field"><label>Colors — Name:#hex</label><input name="colors" placeholder="Ivory:#f5f0e8, Black:#111"></div>
                        <div class="form-field"><label>Status</label>
                            <select name="status">
                                <option>In stock</option>
                                <option>Preorder inquiry</option>
                                <option>Sold out</option>
                            </select>
                        </div>
                        <div class="form-field"><label>Visible</label>
                            <select name="visible">
                                <option value="true">Yes</option>
                                <option value="false">Hidden</option>
                            </select>
                        </div>
                        <div class="form-field full"><label>Sizes & stock — XS:2, S:4, M:0</label><input name="sizes"></div>
                        <div class="form-field full"><label>Image URLs (comma separated, first is main)</label><textarea name="images"></textarea></div>
                        <div class="form-field full"><label>Description</label><textarea name="description"></textarea></div>
                        <div class="form-field full"><label>Materials</label><input name="materials"></div>
                        <div class="form-field full"><label>Care</label><input name="care"></div>
                    </div>
                    <div style="display:flex;gap:10px;align-items:center;margin-top:18px;flex-wrap:wrap">
                        <button class="btn" type="submit">Save piece</button>
                        <button class="btn btn-outline" type="button" data-close-modal>Cancel</button>
                        <span id="prodMsg" class="muted" aria-live="polite"></span>
                    </div>
                </form>
            </div>
        </div>
    `
}

function openProdModal(p) {
    const m = $('#prodModal')
    if (!m) return
    $('#prodModalTitle').textContent = p ? 'Edit piece' : 'New piece'
    const form = m.querySelector('form')
    form.reset()
    form.querySelectorAll('[name]').forEach(el => {
        if (el.name === 'status') el.value = 'In stock'
        else if (el.name === 'visible') el.value = 'true'
        else el.value = ''
    })
    if (p) {
        Object.entries(p).forEach(([k, v]) => {
            const el = form.querySelector(`[name="${k}"]`)
            if (el) el.value = v ?? ''
        })
        form.querySelector('[name="visible"]').value = String(p.visible) === 'false' ? 'false' : 'true'
    }
    m.classList.add('open')
    document.body.classList.add('lock')
    setTimeout(() => form.querySelector('[name="name"]')?.focus(), 40)
}

function closeProdModal() {
    const m = $('#prodModal')
    if (m) m.classList.remove('open')
    document.body.classList.remove('lock')
}

// ── events ─────────────────────────────────────────────────────
document.addEventListener('click', async e => {
    const nav = e.target.closest('[data-tab]')
    if (nav) {
        TAB = nav.dataset.tab
        adminRender()
        return
    }

    if (e.target.closest('[data-out]')) {
        sessionStorage.removeItem('ck')
        A = null
        TAB = 'overview'
        adminRender()
        return
    }

    if (e.target.closest('[data-new-prod]')) {
        openProdModal(null)
        return
    }

    const ed = e.target.closest('[data-ed]')
    if (ed) {
        const p = A.products.find(x => String(x.id) === ed.dataset.ed)
        if (p) openProdModal(p)
        return
    }

    const del = e.target.closest('[data-del]')
    if (del && confirm('Delete this piece?')) {
        try {
            await api('deleteProduct', { key: KEY(), id: del.dataset.del })
            A = await api('admin', { key: KEY() })
            adminRender()
        } catch (x) {
            alert(x.message)
        }
        return
    }

    const ex = e.target.closest('[data-expand]')
    if (ex) {
        OF.expanded = OF.expanded === ex.dataset.expand ? null : ex.dataset.expand
        renderOrderList()
        return
    }

    if (e.target.closest('[data-close-modal]') || e.target.id === 'prodModal') {
        closeProdModal()
    }
})

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#prodModal')?.classList.contains('open')) closeProdModal()
})

document.addEventListener('input', e => {
    if (e.target.id === 'pieceSearch') {
        PF.q = e.target.value
        renderPieceList()
    }
    if (e.target.id === 'orderSearch') {
        OF.q = e.target.value
        renderOrderList()
    }
})

document.addEventListener('change', async e => {
    if (e.target.id === 'pieceCat') {
        PF.cat = e.target.value
        renderPieceList()
        return
    }
    if (e.target.id === 'pieceStatus') {
        PF.status = e.target.value
        renderPieceList()
        return
    }
    if (e.target.id === 'orderStatus') {
        OF.status = e.target.value
        renderOrderList()
        return
    }

    const ord = e.target.dataset?.ord
    if (ord) {
        try {
            await api('updateOrder', { key: KEY(), orderId: ord, status: e.target.value })
            const o = A.sales.find(x => x.orderId === ord)
            if (o) o.status = e.target.value
            adminRender()
        } catch (x) {
            alert(x.message)
        }
    }
})

document.addEventListener('submit', async e => {
    const f = e.target
    if (f.id === 'adminLogin') {
        e.preventDefault()
        try {
            const k = $('#ak').value
            A = await api('admin', { key: k })
            sessionStorage.setItem('ck', k)
            adminRender()
        } catch (x) {
            $('#adminMsg').textContent = x.message
        }
    }
    if (f.id === 'prodForm') {
        e.preventDefault()
        const msg = $('#prodMsg')
        msg.textContent = 'Saving…'
        try {
            await api('saveProduct', { key: KEY(), product: Object.fromEntries(new FormData(f)) })
            A = await api('admin', { key: KEY() })
            closeProdModal()
            adminRender()
        } catch (x) {
            msg.textContent = x.message
        }
    }
})

adminInit()