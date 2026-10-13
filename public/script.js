(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const catalogEl = $("catalogData");
  const catalog = catalogEl ? JSON.parse(catalogEl.textContent || "[]") : [];
  const productMap = new Map(catalog.map(p => [p.sku, p]));

  const CART_STORAGE_KEY = "ayeNoorCart_v1";
  const cart = new Map();

  const money = value => `Rs. ${Number(value).toLocaleString("en-PK")}`;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const scrollBehavior = () => (reducedMotion.matches ? "auto" : "smooth");
  let toastTimer;
  let lastFocused = null;

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved)) return;
      saved.forEach(entry => {
        if (!entry || typeof entry.sku !== "string") return;
        const p = productMap.get(entry.sku);
        const qty = Number(entry.qty);
        if (p && Number.isInteger(qty) && qty > 0) {
          cart.set(entry.sku, Math.min(qty, p.stock));
        }
      });
    } catch {}
  }

  function saveCart() {
    try {
      const payload = [...cart.entries()].map(([sku, qty]) => ({ sku, qty }));
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }

  const productGrid = $("productGrid");
  const initialCards = productGrid ? [...productGrid.querySelectorAll(".product-card")] : [];

  function filterAndSortCards() {
    if (!productGrid) return;
    const searchInput = $("searchInput");
    const term = searchInput ? searchInput.value.trim().toLowerCase() : "";
    const category = $("categoryFilter") ? $("categoryFilter").value : "all";
    const sort = $("sortSelect") ? $("sortSelect").value : "featured";

    const matching = initialCards.filter(card => {
      const cardCat = card.dataset.category || "";
      const cardSearch = card.dataset.search || "";
      const catMatch = category === "all" || cardCat === category;
      const termMatch = !term || cardSearch.includes(term);
      return catMatch && termMatch;
    });

    if (sort === "low-high") {
      matching.sort((a, b) => Number(a.dataset.price) - Number(b.dataset.price));
    } else if (sort === "high-low") {
      matching.sort((a, b) => Number(b.dataset.price) - Number(a.dataset.price));
    } else if (sort === "name") {
      matching.sort((a, b) => (a.dataset.name || "").localeCompare(b.dataset.name || ""));
    }

    productGrid.innerHTML = "";
    matching.forEach(card => productGrid.appendChild(card));

    const emptyState = $("emptyState");
    if (emptyState) emptyState.classList.toggle("hidden", matching.length > 0);
  }

  function addToCart(sku, requestedQty = 1) {
    const p = productMap.get(sku);
    if (!p || p.stock < 1) return;
    const addAmount = Math.max(1, Math.floor(Number(requestedQty) || 1));
    const current = cart.get(sku) || 0;
    if (current >= p.stock) return showToast("You've reached the sample stock limit.");
    const nextQty = Math.min(p.stock, current + addAmount);
    const added = nextQty - current;
    cart.set(sku, nextQty);
    saveCart();
    renderCart();
    if (nextQty === p.stock && added < addAmount) {
      showToast(`Added ${added} (${p.name} is at the sample stock limit).`);
    } else {
      showToast(`${added > 1 ? added + " × " : ""}${p.name} added to your cart.`);
    }
  }

  function changeQuantity(sku, delta) {
    const p = productMap.get(sku);
    if (!p) return;
    const quantity = (cart.get(sku) || 0) + delta;
    if (quantity <= 0) cart.delete(sku);
    else if (quantity <= p.stock) cart.set(sku, quantity);
    else showToast("You've reached the sample stock limit.");
    saveCart();
    renderCart();
  }

  function renderCart() {
    let count = 0;
    let subtotal = 0;
    const cartItemsEl = $("cartItems");
    if (!cartItemsEl) return;
    cartItemsEl.innerHTML = "";

    cart.forEach((quantity, sku) => {
      const p = productMap.get(sku);
      if (!p) return;
      const v = p.visual || { bg: "#e8d9ca", glyph: "#a98d73", mark: "✳" };
      const name = escapeHTML(p.name);
      const href = p.slug ? `/product/${encodeURIComponent(p.slug)}` : "/shop";
      count += quantity;
      subtotal += p.salePrice * quantity;

      const row = document.createElement("div");
      row.className = "cart-line";
      row.innerHTML = `<a href="${href}" class="cart-line-art" style="--productbg:${v.bg};--glyph:${v.glyph}" aria-hidden="true" tabindex="-1">${v.mark}</a>
        <div><h4><a href="${href}" class="product-title-link">${name}</a></h4><small>${money(p.salePrice)} each</small>
        <div class="qty-control"><button type="button" aria-label="Decrease quantity of ${name}">−</button><span aria-label="Quantity">${quantity}</span><button type="button" aria-label="Increase quantity of ${name}">+</button></div>
        <button type="button" class="remove-line" aria-label="Remove ${name} from cart">Remove</button></div><div class="cart-line-total">${money(p.salePrice * quantity)}</div>`;

      const controls = row.querySelectorAll(".qty-control button");
      controls[0].addEventListener("click", () => changeQuantity(sku, -1));
      controls[1].addEventListener("click", () => changeQuantity(sku, 1));
      row.querySelector(".remove-line").addEventListener("click", () => {
        cart.delete(sku);
        saveCart();
        renderCart();
      });
      cartItemsEl.appendChild(row);
    });

    $("cartCount").textContent = count;
    $("cartSubtotal").textContent = money(subtotal);
    $("cartEmpty").classList.toggle("hidden", count > 0);
    cartItemsEl.classList.toggle("hidden", count === 0);
  }

  function isCartOpen() { return $("cartDrawer").classList.contains("open"); }

  function openCart() {
    lastFocused = document.activeElement;
    setMenu(false);
    const drawer = $("cartDrawer");
    drawer.inert = false;
    drawer.setAttribute("aria-hidden", "false");
    drawer.classList.add("open");
    $("cartOverlay").classList.remove("hidden");
    document.body.style.overflow = "hidden";
    $("closeCart").focus();
  }

  function closeCart() {
    const drawer = $("cartDrawer");
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    drawer.inert = true;
    $("cartOverlay").classList.add("hidden");
    document.body.style.overflow = "";
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  }

  function trapFocus(event) {
    if (event.key !== "Tab" || !isCartOpen()) return;
    const focusable = [...$("cartDrawer").querySelectorAll("button:not([disabled]), [href], input, select, [tabindex]:not([tabindex='-1'])")]
      .filter(el => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function setMenu(open) {
    $("mainNav").classList.toggle("open", open);
    $("menuButton").setAttribute("aria-expanded", String(open));
    $("menuButton").setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }
  function isMenuOpen() { return $("mainNav").classList.contains("open"); }

  function showToast(message) {
    $("toast").textContent = message;
    $("toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2400);
  }

  const searchInputs = [$("searchInput"), $("searchInputMobile")].filter(Boolean);
  searchInputs.forEach(input => {
    input.addEventListener("input", () => {
      searchInputs.forEach(other => { if (other !== input) other.value = input.value; });
      if (productGrid) filterAndSortCards();
    });
    const form = input.closest("form");
    if (form) {
      form.addEventListener("submit", event => {
        if (productGrid && $("shop")) {
          event.preventDefault();
          setMenu(false);
          filterAndSortCards();
          $("shop").scrollIntoView({ behavior: scrollBehavior() });
        }
      });
    }
  });

  document.querySelectorAll("[data-category-select]").forEach(card => {
    card.addEventListener("click", event => {
      const filterEl = $("categoryFilter");
      const shopSection = $("shop");
      if (filterEl && shopSection) {
        event.preventDefault();
        filterEl.value = card.getAttribute("data-category-select");
        filterAndSortCards();
        shopSection.scrollIntoView({ behavior: scrollBehavior() });
      }
    });
  });

  document.addEventListener("click", event => {
    const addBtn = event.target.closest("[data-add-sku]");
    if (addBtn) addToCart(addBtn.getAttribute("data-add-sku"), 1);
  });

  /* ---------- Product Detail Page Wiring ---------- */
  const purchaseBox = document.querySelector("[data-detail-purchase]");
  if (purchaseBox) {
    const detailSku = purchaseBox.getAttribute("data-sku");
    const maxStock = Math.max(1, Number(purchaseBox.getAttribute("data-max")) || 1);
    const qtyInput = $("detailQtyInput");
    const decBtn = $("detailQtyDec");
    const incBtn = $("detailQtyInc");
    const addBtn = $("detailAddBtn");

    const clampQty = () => {
      let val = Math.floor(Number(qtyInput.value) || 1);
      if (val < 1) val = 1;
      if (val > maxStock) {
        val = maxStock;
        showToast("You've reached the sample stock limit.");
      }
      qtyInput.value = String(val);
      return val;
    };

    if (decBtn) decBtn.addEventListener("click", () => { qtyInput.value = String(Math.max(1, clampQty() - 1)); });
    if (incBtn) incBtn.addEventListener("click", () => {
      const current = clampQty();
      if (current >= maxStock) showToast("You've reached the sample stock limit.");
      else qtyInput.value = String(current + 1);
    });
    if (qtyInput) qtyInput.addEventListener("change", clampQty);
    if (addBtn) addBtn.addEventListener("click", () => addToCart(detailSku, clampQty()));
  }

  const thumbs = [...document.querySelectorAll("[data-thumb-glyph]")];
  thumbs.forEach(btn => {
    btn.addEventListener("click", () => {
      thumbs.forEach(other => {
        other.classList.toggle("active", other === btn);
        other.setAttribute("aria-pressed", other === btn ? "true" : "false");
      });
      if ($("stageGlyph")) $("stageGlyph").textContent = btn.getAttribute("data-thumb-glyph");
      if ($("stageCaption")) $("stageCaption").textContent = btn.getAttribute("data-thumb-label");
    });
  });

  if ($("categoryFilter")) $("categoryFilter").addEventListener("change", filterAndSortCards);
  if ($("sortSelect")) $("sortSelect").addEventListener("change", filterAndSortCards);

  $("menuButton").addEventListener("click", () => setMenu(!isMenuOpen()));
  $("mainNav").querySelectorAll("a").forEach(link => link.addEventListener("click", () => setMenu(false)));
  window.matchMedia("(min-width: 861px)").addEventListener("change", event => { if (event.matches) setMenu(false); });
  $("openCart").addEventListener("click", openCart);
  $("closeCart").addEventListener("click", closeCart);
  $("cartOverlay").addEventListener("click", closeCart);
  $("cartDrawer").addEventListener("keydown", trapFocus);
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (isCartOpen()) closeCart();
    else if (isMenuOpen()) { setMenu(false); $("menuButton").focus(); }
  });
  $("checkoutDemo").addEventListener("click", () => showToast("Checkout will be added after the secure backend is built."));

  loadCart();
  renderCart();
})();
