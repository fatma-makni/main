let PRODUCTS = [];
let PRODUCTS_LOADED = false;

const pairs = s =>
    String(s || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
    .map(x => x.split(':').map(y => y.trim()));

const fromRow = r => {
    const sz = pairs(r.sizes),
        st = r.status || 'In stock';
    return {
        ...r,
        id: String(r.id),
        price: +r.price || 0,
        colors: pairs(r.colors).map(c => ({ name: c[0], hex: c[1] || '#cbbba6' })),
        sizes: sz.map(x => x[0]),
        stock: Object.fromEntries(sz.map(x => [x[0], +x[1] || 0])),
        status: st,
        preorder: st === 'Preorder inquiry',
        images: String(r.images || '')
            .split(',')
            .map(x => x.trim())
            .filter(Boolean)
    };
};

async function boot() {
    if (CFG.API) {
        try {
            const res = await fetch(CFG.API + '?action=products');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            PRODUCTS = (data.products || []).map(fromRow);
            console.log('[CELIA] Loaded', PRODUCTS.length, 'products');
        } catch (e) {
            console.error('[CELIA] Failed to load products:', e);
            PRODUCTS = [];
        }
    }
    PRODUCTS_LOADED = true;

    // Only prune the cart if we actually know the catalog.
    if (PRODUCTS.length) cart = cart.filter(i => PRODUCTS.some(p => p.id === i.id));

    initFilters();
    renderFeatured();
    renderCartCount();
    renderCart();

    // If the collection page is already open, re-render it now that products are loaded.
    if (document.querySelector('#collectionPage')?.classList.contains('active')) {
        renderCollection();
    }
}

// Beige SVG placeholder, used when a product has no image URL.
const PLACEHOLDER =
    'data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 900 1200%22%3E%3Crect fill=%22%23E8DFD3%22 width=%22900%22 height=%221200%22/%3E%3C/svg%3E';

const fixImg = u => {
    const m = /\/d\/([\w-]+)|[?&]id=([\w-]+)/.exec(u);
    return /drive\.google/.test(u) && m
        ? `https://drive.google.com/thumbnail?id=${m[1] || m[2]}&sz=w1200`
        : u;
};

const photo = (id, w = 900) => {
    if (!id) return PLACEHOLDER;
    if (/^https?:/.test(id)) return fixImg(id);
    const slug = String(id).startsWith('photo-') ? id : 'photo-' + id;
    return `https://images.unsplash.com/${slug}?auto=format&fit=crop&w=${w}&q=82`;
};

let cart = JSON.parse(localStorage.getItem('celia-cart') || '[]'),
    activeProduct = null,
    chosenSize = null,
    chosenColor = 0,
    collectionName = 'All pieces';

function saveCart() {
    localStorage.setItem('celia-cart', JSON.stringify(cart));
    renderCartCount();
}

function renderCartCount() {
    let n = cart.reduce((s, i) => s + i.qty, 0);
    $('#bagCount').textContent = n;
    $('#drawerCount').textContent = n ? `(${n})` : '';
}

function productCard(p) {
    try {
        const img = p.images && p.images.length ? photo(p.images[0], 760) : PLACEHOLDER;
        const colors = (p.colors || [])
            .map(c => `<span class="swatch" title="${c.name}" style="background:${c.hex}"></span>`)
            .join('');
        const colorCount = (p.colors || []).length;
        return `<article class="product-card" data-product="${p.id}">
            <div class="product-photo">
                <img loading="lazy" src="${img}" alt="${p.name} — editorial placeholder photograph">
                ${p.tag ? `<span class="product-tag">${p.tag}</span>` : ''}
                <button class="quick-add" data-quick="${p.id}">${p.status === 'In stock' ? 'Quick add' : 'View details'} ↗</button>
            </div>
            <div class="product-info">
                <div>
                    <div class="product-name">${p.name}</div>
                    <div class="product-colors">${colors}<span class="color-note">${colorCount} colour${colorCount === 1 ? '' : 's'}</span></div>
                </div>
                <div class="product-price">${formatPrice(p.price)}</div>
            </div>
        </article>`;
    } catch (e) {
        console.error('[CELIA] Failed to render product', p && p.id, e);
        return '';
    }
}

function renderFeatured() {
    const el = $('#featuredProducts');
    if (!el) return;
    el.innerHTML =
        PRODUCTS.slice(0, 3).map(productCard).join('') ||
        '<p class="muted">The first edit is coming soon.</p>';
}

function renderCollection() {
    const el = $('#collectionProducts');
    if (!el) return;

    if (!PRODUCTS_LOADED) {
        el.innerHTML = '<p class="muted">Loading the edit…</p>';
        return;
    }
    if (!PRODUCTS.length) {
        el.innerHTML = '<p class="muted">No pieces are published yet. Add or unhide pieces in the Studio.</p>';
        return;
    }

    try {
        let list = [...PRODUCTS];
        const cat = $('#categoryFilter').value,
            size = $('#sizeFilter').value,
            color = $('#colorFilter').value,
            sort = $('#sortProducts').value;
        if (cat !== 'All') list = list.filter(p => p.category === cat);
        if (size !== 'All') list = list.filter(p => p.sizes.includes(size) && p.stock[size] !== 0);
        if (color !== 'All') list = list.filter(p => p.colors.some(c => c.name === color));
        if (collectionName !== 'All pieces')
            list = list.filter(p => p.collection === collectionName || p.category === collectionName);
        if (sort === 'low') list.sort((a, b) => a.price - b.price);
        if (sort === 'high') list.sort((a, b) => b.price - a.price);
        if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));

        el.innerHTML = list.length
            ? list.map(productCard).join('')
            : '<p class="muted">No pieces match these filters. Try another selection.</p>';
    } catch (e) {
        console.error('[CELIA] Collection render error:', e);
        el.innerHTML = '<p class="muted">Something went wrong rendering the collection. Please refresh.</p>';
    }
}

function openCollection(name = 'All pieces') {
    collectionName = name;
    $('#collectionTitle').textContent = name === 'All pieces' ? 'The collection' : name;
    $('#collectionDescription').textContent =
        name === 'All pieces'
        ? 'Thoughtfully considered pieces for the everyday and the in-between.'
        : `Explore CELIA's ${name.toLowerCase()} edit.`;
    $('#categoryFilter').value = 'All';
    $('#sizeFilter').value = 'All';
    $('#colorFilter').value = 'All';
    renderCollection();
    showPage('collectionPage');
}

function showPage(id) {
    $('.store-view').classList.add('hidden');
    document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
    if (id === 'home') {
        $('.store-view').classList.remove('hidden');
        window.scrollTo(0, 0);
        return;
    }
    if (id === 'shop' || id === 'collections') {
        openCollection('All pieces');
        return;
    }
    const pageMap = {
        'our-story': 'storyPage',
        story: 'storyPage',
        contact: 'contactPage',
        checkout: 'checkoutPage',
        shipping: 'policyPage',
        returns: 'policyPage',
        privacy: 'policyPage',
        terms: 'policyPage'
    };
    const target = pageMap[id] || id;
    $('#' + target)?.classList.add('active');
    if (id === 'shipping' || id === 'returns' || id === 'privacy' || id === 'terms') {
        const names = {
            shipping: 'Shipping Policy',
            returns: 'Returns & Refunds',
            privacy: 'Privacy Policy',
            terms: 'Terms & Conditions'
        };
        $('#policyTitle').textContent = names[id];
        $('#policyCopy').textContent =
            'Launch placeholder: CELIA must add a reviewed policy that accurately describes its legal business details, processing practices, delivery coverage, cancellations, returns, taxes and customer rights before launch.';
    }
    window.scrollTo(0, 0);
}

function openProduct(id) {
    activeProduct = PRODUCTS.find(p => p.id === id);
    if (!activeProduct) return;
    chosenSize = null;
    chosenColor = 0;
    $('#productBreadcrumb').textContent = activeProduct.name;
    $('#detailCategory').textContent = activeProduct.category + ' · ' + activeProduct.collection;
    $('#detailName').textContent = activeProduct.name;
    $('#detailPrice').textContent = formatPrice(activeProduct.price);
    $('#detailButtonPrice').textContent = formatPrice(activeProduct.price);
    $('#detailDescription').textContent = activeProduct.description;
    $('#detailMaterials').textContent = activeProduct.materials;
    $('#detailCare').textContent = activeProduct.care;
    $('#availabilityLabel').textContent =
        activeProduct.status === 'In stock'
        ? 'Available in selected sizes'
        : activeProduct.status === 'Preorder inquiry'
        ? 'Available by preorder inquiry — not ready for immediate dispatch'
        : 'Currently unavailable';
    $('#detailGallery').innerHTML = (activeProduct.images.length ? activeProduct.images : [null])
        .map((im, i) => `<img src="${im ? photo(im, 1000) : PLACEHOLDER}" alt="${activeProduct.name}, editorial placeholder image ${i + 1}">`)
        .join('');
    $('#detailColors').innerHTML = activeProduct.colors
        .map(
            (c, i) =>
            `<button class="color-option ${i === 0 ? 'selected' : ''}" data-color="${i}" aria-label="${c.name}"><span class="swatch" style="background:${c.hex}"></span></button>`
        )
        .join('');
    $('#chosenColorLabel').textContent = activeProduct.colors.length ? '— ' + activeProduct.colors[0].name : '';
    $('#detailSizes').innerHTML = activeProduct.sizes
        .map(
            s =>
            `<button class="size-option" data-size="${s}" ${activeProduct.stock[s] === 0 && !activeProduct.preorder ? 'disabled' : ''}>${s}</button>`
        )
        .join('');
    $('#detailAdd').textContent = activeProduct.preorder
        ? 'Request preorder'
        : 'Add to bag — ' + formatPrice(activeProduct.price);
    $('#detailAdd').innerHTML = activeProduct.preorder
        ? 'Request preorder'
        : 'Add to bag — <span id="detailButtonPrice">' + formatPrice(activeProduct.price) + '</span>';
    showPage('productPage');
}

function addToCart(p, size, color) {
    if (p.stock[size] === 0 && !p.preorder) {
        alert('That size is currently unavailable.');
        return;
    }
    let existing = cart.find(i => i.id === p.id && i.size === size && i.color === color);
    if (existing) {
        if (!p.preorder && existing.qty >= p.stock[size]) {
            alert('That is the available quantity for this size.');
            return;
        }
        existing.qty++;
    } else cart.push({ id: p.id, size, color, qty: 1 });
    saveCart();
    renderCart();
    openDrawer();
}

function renderCart() {
    if (!cart.length) {
        $('#cartItems').innerHTML =
            '<div class="empty"><h3>Your bag is taking a moment.</h3><p class="muted">Your considered edit begins here.</p><button class="btn btn-outline" id="continueShopping">Continue shopping</button></div>';
        $('#cartFoot').innerHTML = '';
        return;
    }
    $('#cartItems').innerHTML = cart
        .map((i, idx) => {
            let p = PRODUCTS.find(p => p.id === i.id);
            if (!p) return '';
            const img = p.images.length ? photo(p.images[0], 300) : PLACEHOLDER;
            return `<div class="cart-item"><img src="${img}" alt=""><div><h3>${p.name}</h3><div class="muted">${p.colors.find(c => c.name === i.color)?.name || i.color} · Size ${i.size}</div><div class="qty"><button data-qty="${idx}" data-delta="-1" aria-label="Decrease quantity">−</button><span>${i.qty}</span><button data-qty="${idx}" data-delta="1" aria-label="Increase quantity">+</button></div><button class="remove" data-remove="${idx}">Remove</button></div><div>${formatPrice(p.price * i.qty)}</div></div>`;
        })
        .join('');
    let subtotal = cart.reduce((sum, i) => {
        const p = PRODUCTS.find(p => p.id === i.id);
        return p ? sum + p.price * i.qty : sum;
    }, 0);
    $('#cartFoot').innerHTML = `<div class="total-row"><span>Subtotal</span><strong>${formatPrice(subtotal)}</strong></div><p class="notice">Shipping and taxes are not calculated yet. Final costs must be confirmed for your destination.</p><button class="btn" id="goCheckout">Continue to order request ↗</button><p class="notice">No payment is collected in this prototype.</p>`;
}

function openDrawer() {
    $('#overlay').classList.add('open');
    $('#cartDrawer').classList.add('open');
    document.body.classList.add('lock');
}

function closeDrawer() {
    $('#overlay').classList.remove('open');
    $('#cartDrawer').classList.remove('open');
    document.body.classList.remove('lock');
}

function openModal(title, html) {
    $('#modalTitle').textContent = title;
    $('#modalContent').innerHTML = html;
    $('#genericModal').classList.add('open');
}

function sizeGuide() {
    openModal(
        'Size guide',
        `<p>Measurements are a guide only. Replace this table with garment-specific measurements verified by CELIA before launch.</p><table style="width:100%;border-collapse:collapse;font-size:11px;text-align:left"><thead><tr><th style="padding:10px;border-bottom:1px solid var(--line)">Size</th><th style="padding:10px;border-bottom:1px solid var(--line)">Bust (cm)</th><th style="padding:10px;border-bottom:1px solid var(--line)">Waist (cm)</th><th style="padding:10px;border-bottom:1px solid var(--line)">Hip (cm)</th></tr></thead><tbody>${[['XS','78–82','60–64','86–90'],['S','82–86','64–68','90–94'],['M','86–92','68–74','94–100'],['L','92–98','74–80','100–106'],['XL','98–104','80–86','106–112']].map(r=>`<tr>${r.map(c=>`<td style="padding:10px;border-bottom:1px solid var(--line)">${c}</td>`).join('')}</tr>`).join('')}</tbody></table><p>These are illustrative placeholder measurements, not verified sizing for actual CELIA garments.</p>`
    );
}

function routeFrom(el) {
    let route = el.dataset.route;
    if (route === 'shop' || route === 'collections') {
        openCollection('All pieces');
    } else if (route === 'story') {
        document.querySelector('#story')?.scrollIntoView({ behavior: 'smooth' });
    } else if (route === 'home') {
        showPage('home');
    } else if (route === 'our-story') {
        showPage('our-story');
    } else showPage(route);
}

document.addEventListener('click', e => {
    let route = e.target.closest('[data-route]');
    if (route) {
        e.preventDefault();
        $('#mobileMenu').classList.remove('open');
        routeFrom(route);
        return;
    }
    let policy = e.target.closest('[data-policy]');
    if (policy) {
        e.preventDefault();
        let key = policy.dataset.policy.toLowerCase().includes('shipping')
            ? 'shipping'
            : policy.dataset.policy.toLowerCase().includes('returns')
            ? 'returns'
            : policy.dataset.policy.toLowerCase().includes('privacy')
            ? 'privacy'
            : 'terms';
        showPage(key);
        return;
    }
    let card = e.target.closest('[data-product]');
    let quick = e.target.closest('[data-quick]');
    if (quick) {
        e.stopPropagation();
        openProduct(quick.dataset.quick);
        return;
    }
    if (card) {
        openProduct(card.dataset.product);
        return;
    }
    let size = e.target.closest('[data-size]');
    if (size) {
        chosenSize = size.dataset.size;
        $('#detailSizes').querySelectorAll('.size-option').forEach(b => b.classList.toggle('selected', b === size));
        return;
    }
    let color = e.target.closest('[data-color]');
    if (color) {
        chosenColor = Number(color.dataset.color);
        $('#detailColors').querySelectorAll('.color-option').forEach(b => b.classList.toggle('selected', b === color));
        $('#chosenColorLabel').textContent = '— ' + activeProduct.colors[chosenColor].name;
        return;
    }
    let qty = e.target.closest('[data-qty]');
    if (qty) {
        let i = cart[Number(qty.dataset.qty)],
            p = PRODUCTS.find(p => p.id === i.id),
            delta = Number(qty.dataset.delta);
        if (delta > 0 && !p.preorder && i.qty >= p.stock[i.size]) {
            alert('That is the available quantity for this size.');
            return;
        }
        i.qty += delta;
        if (i.qty < 1) cart.splice(Number(qty.dataset.qty), 1);
        saveCart();
        renderCart();
        return;
    }
    let remove = e.target.closest('[data-remove]');
    if (remove) {
        cart.splice(Number(remove.dataset.remove), 1);
        saveCart();
        renderCart();
        return;
    }
    if (e.target.id === 'continueShopping') {
        closeDrawer();
        openCollection();
        return;
    }
    if (e.target.id === 'goCheckout') {
        closeDrawer();
        $('#checkoutSummary').innerHTML =
            '<p class="muted">' +
            cart
            .map(i => {
                let p = PRODUCTS.find(p => p.id === i.id);
                return p ? `${i.qty} × ${p.name} (${i.color}, ${i.size}) — ${formatPrice(p.price * i.qty)}` : '';
            })
            .join('<br>') +
            '</p><p><strong>Subtotal: ' +
            formatPrice(
                cart.reduce((s, i) => {
                    const p = PRODUCTS.find(p => p.id === i.id);
                    return p ? s + p.price * i.qty : s;
                }, 0)
            ) +
            '</strong></p>';
        showPage('checkout');
        shipSummary();
        return;
    }
});

$('#bagOpen').addEventListener('click', () => {
    renderCart();
    openDrawer();
});
$('#cartClose').addEventListener('click', closeDrawer);
$('#overlay').addEventListener('click', closeDrawer);
$('#menuOpen').addEventListener('click', () => $('#mobileMenu').classList.add('open'));
$('#menuClose').addEventListener('click', () => $('#mobileMenu').classList.remove('open'));
$('#modalClose').addEventListener('click', () => $('#genericModal').classList.remove('open'));
$('#genericModal').addEventListener('click', e => {
    if (e.target.id === 'genericModal') $('#genericModal').classList.remove('open');
});
$('#sizeGuideOpen').addEventListener('click', sizeGuide);

$('#detailAdd').addEventListener('click', () => {
    if (!activeProduct) return;
    if (!chosenSize) {
        openModal('Choose your size', '<p>Please select an available size before continuing.</p>');
        return;
    }
    if (activeProduct.preorder) {
        openModal(
            'Preorder enquiry',
            `<p><strong>${activeProduct.name}</strong> is currently available by inquiry only. No payment will be taken.</p><p>Use the order-request form to ask about ${activeProduct.colors[chosenColor].name}, size ${chosenSize}, and the estimated production window.</p><button class="btn" id="preorderContinue">Continue to request ↗</button>`
        );
        return;
    }
    addToCart(activeProduct, chosenSize, activeProduct.colors[chosenColor].name);
});

$('#searchOpen').addEventListener('click', () =>
    openModal(
        'Find your piece',
        `<form id="searchForm"><div class="form-field"><label for="searchInput">Search the CELIA edit</label><input id="searchInput" placeholder="Try blazer, trousers, dress…" autofocus></div><button class="btn" type="submit">Search ↗</button></form><div id="searchResults" style="margin-top:20px"></div>`
    )
);

document.addEventListener('submit', e => {
    if (e.target.id === 'searchForm') {
        e.preventDefault();
        let q = $('#searchInput').value.toLowerCase();
        let matches = PRODUCTS.filter(p => (p.name + ' ' + p.category + ' ' + p.collection).toLowerCase().includes(q));
        $('#searchResults').innerHTML = matches.length
            ? matches
            .map(
                p =>
                `<p><a href="#" data-search-product="${p.id}" style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)">${p.name}<span>${formatPrice(p.price)} ↗</span></a></p>`
            )
            .join('')
            : '<p class="muted">No pieces found. Try another search.</p>';
    }
    if (e.target.id === 'contactForm') {
        e.preventDefault();
        let body = encodeURIComponent($('#contactMessage').value),
            subject = encodeURIComponent('CELIA enquiry: ' + $('#contactSubject').value),
            mailto = 'mailto:hello@celia.example?subject=' + subject + '&body=' + body;
        $('#contactStatus').innerHTML =
            '<div class="status-msg">Your email app will open with your message. Replace hello@celia.example with CELIA’s real contact address.</div>';
        window.location.href = mailto;
    }
});

document.addEventListener('click', e => {
    let s = e.target.closest('[data-search-product]');
    if (s) {
        e.preventDefault();
        $('#genericModal').classList.remove('open');
        openProduct(s.dataset.searchProduct);
    }
    if (e.target.id === 'preorderContinue') {
        e.preventDefault();
        $('#genericModal').classList.remove('open');
        showPage('checkout');
    }
});

['categoryFilter', 'sizeFilter', 'colorFilter', 'sortProducts'].forEach(id =>
    $('#' + id).addEventListener('change', renderCollection)
);

$('#instagramLink').addEventListener('click', e => {
    e.preventDefault();
    openModal(
        'CELIA on Instagram',
        '<p>Add CELIA’s verified Instagram URL before launch. This placeholder does not link to a live brand profile.</p>'
    );
});

function initFilters() {
    [...new Set(PRODUCTS.map(p => p.category))].forEach(c =>
        $('#categoryFilter').insertAdjacentHTML('beforeend', `<option>${c}</option>`)
    );
    [...new Set(PRODUCTS.flatMap(p => p.colors.map(c => c.name)))].forEach(c =>
        $('#colorFilter').insertAdjacentHTML('beforeend', `<option>${c}</option>`)
    );
}

$('#year').textContent = new Date().getFullYear();

/* ---- live order, newsletter, shipping ---- */
const regionOf = c => CFG.MAP[c] || (c ? 'Rest of the world' : '');

function shipSummary() {
    const sub = cart.reduce((a, i) => {
            const p = PRODUCTS.find(p => p.id === i.id);
            return p ? a + p.price * i.qty : a;
        }, 0),
        r = regionOf($('#orderCountry').value),
        x = CFG.SHIP[r],
        sh = x ? (sub >= x[1] ? 0 : x[0]) : null;
    $('#shipSummary').innerHTML = x
        ? `Shipping to ${r}: <strong>${sh ? formatPrice(sh) : 'Free'}</strong> · about ${x[2]} business days (indicative, not a carrier quote)<br><strong>Estimated total: ${formatPrice(sub + sh)}</strong><br>Customs duties and import taxes are not included.`
        : 'Choose a destination to see shipping.';
}

$('#orderCountry').addEventListener('change', shipSummary);

document.addEventListener('submit', async e => {
    const f = e.target;
    if (f.id === 'newsletterForm') {
        e.preventDefault();
        const m = $('#newsletterMessage');
        m.textContent = 'Sending…';
        try {
            await api('subscribe', { email: $('#newsletterEmail').value });
            m.textContent = 'Thank you. You are on the list.';
            f.reset();
        } catch (x) {
            m.textContent = 'Could not sign you up: ' + x.message;
        }
    }
    if (f.id === 'orderForm') {
        e.preventDefault();
        const st = $('#orderStatus');
        if (!cart.length) {
            st.innerHTML = '<div class="status-msg">Your bag is empty.</div>';
            return;
        }
        st.innerHTML = '<div class="status-msg">Sending…</div>';
        try {
            const r = await api('order', {
                name: $('#orderName').value,
                email: $('#orderEmail').value,
                phone: $('#orderPhone').value,
                country: $('#orderCountry').value,
                address: $('#orderAddress').value,
                notes: $('#orderNotes').value,
                items: cart.map(i => ({ id: i.id, size: i.size, color: i.color, qty: i.qty }))
            });
            cart = [];
            saveCart();
            renderCart();
            f.reset();
            $('#checkoutSummary').innerHTML = '';
            $('#shipSummary').innerHTML = '';
            st.innerHTML = `<div class="status-msg">Request received: order ${r.orderId}. This is not a payment and does not guarantee stock. CELIA will contact you to confirm and arrange payment.</div>`;
        } catch (x) {
            st.textContent = 'Could not send your request: ' + x.message;
            st.className = 'status-msg';
        }
    }
});

boot();