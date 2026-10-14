(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const CART_STORAGE_KEY = "ayeNoorCart_v1";
  const cart = new Map();

  const money = value => `Rs. ${Number(value || 0).toLocaleString("en-PK")}`;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const scrollBehavior = () => (reducedMotion.matches ? "auto" : "smooth");
  let toastTimer;
  let lastFocused = null;
  let quoteRequestId = 0;

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function loadCartFromStorage() {
    cart.clear();
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved)) return;
      saved.forEach(entry => {
        if (!entry || typeof entry.sku !== "string") return;
        const sku = entry.sku.trim();
        const qty = Math.floor(Number(entry.qty));
        if (sku && Number.isInteger(qty) && qty > 0) {
          cart.set(sku, qty);
        }
      });
    } catch {}
  }

  function saveCartToStorage() {
    try {
      const payload = [...cart.entries()].map(([sku, qty]) => ({ sku, qty }));
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }

  async function syncCartWithServer(toastMessage) {
    const reqId = ++quoteRequestId;
    const rawItems = [...cart.entries()].map(([sku, qty]) => ({ sku, qty }));

    try {
      const response = await fetch("/api/cart/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: rawItems })
      });
      if (!response.ok) throw new Error("Failed to fetch cart quote");
      const quote = await response.json();
      if (reqId !== quoteRequestId) return;

      cart.clear();
      quote.items.forEach(item => cart.set(item.sku, item.qty));
      saveCartToStorage();

      renderDrawerQuote(quote);
      renderCartPageQuote(quote);
      renderCheckoutQuote(quote);

      if (quote.adjustments && quote.adjustments.length > 0) {
        showToast(quote.adjustments[0]);
      } else if (toastMessage) {
        showToast(toastMessage);
      }
    } catch {
      if (toastMessage) showToast(toastMessage);
    }
  }

  function addToCart(sku, requestedQty = 1) {
    if (!sku) return;
    const addAmount = Math.max(1, Math.floor(Number(requestedQty) || 1));
    const current = cart.get(sku) || 0;
    cart.set(sku, current + addAmount);
    saveCartToStorage();
    syncCartWithServer("Added to your cart.");
  }

  function changeQuantity(sku, delta) {
    if (!cart.has(sku)) return;
    const nextQty = (cart.get(sku) || 0) + delta;
    if (nextQty <= 0) cart.delete(sku);
    else cart.set(sku, nextQty);
    saveCartToStorage();
    syncCartWithServer();
  }

  function removeFromCart(sku) {
    cart.delete(sku);
    saveCartToStorage();
    syncCartWithServer("Item removed from cart.");
  }

  function clearCart() {
    cart.clear();
    saveCartToStorage();
    syncCartWithServer("Cart cleared.");
  }

  function renderDrawerQuote(quote) {
    const cartItemsEl = $("cartItems");
    if (!cartItemsEl) return;
    cartItemsEl.innerHTML = "";

    quote.items.forEach(item => {
      const v = item.visual || { bg: "#e8d9ca", glyph: "#a98d73", mark: "✳" };
      const name = escapeHTML(item.name);
      const href = `/product/${encodeURIComponent(item.slug)}`;

      const row = document.createElement("div");
      row.className = "cart-line";
      row.innerHTML = `<a href="${href}" class="cart-line-art" style="--productbg:${v.bg};--glyph:${v.glyph}" aria-hidden="true" tabindex="-1">${v.mark}</a>
        <div><h4><a href="${href}" class="product-title-link">${name}</a></h4><small>${money(item.salePrice)} each</small>
        <div class="qty-control"><button type="button" aria-label="Decrease quantity of ${name}">−</button><span aria-label="Quantity">${item.qty}</span><button type="button" aria-label="Increase quantity of ${name}">+</button></div>
        <button type="button" class="remove-line" aria-label="Remove ${name} from cart">Remove</button></div><div class="cart-line-total">${money(item.lineTotal)}</div>`;

      const controls = row.querySelectorAll(".qty-control button");
      controls[0].addEventListener("click", () => changeQuantity(item.sku, -1));
      controls[1].addEventListener("click", () => changeQuantity(item.sku, 1));
      row.querySelector(".remove-line").addEventListener("click", () => removeFromCart(item.sku));
      cartItemsEl.appendChild(row);
    });

    if ($("cartCount")) $("cartCount").textContent = quote.itemCount;
    if ($("cartSubtotal")) $("cartSubtotal").textContent = money(quote.subtotal);
    if ($("cartDrawerShipping")) {
      $("cartDrawerShipping").textContent = quote.itemCount === 0
        ? "—"
        : (quote.shippingFee === 0 ? "Free" : money(quote.shippingFee));
    }
    if ($("drawerShippingNote")) {
      if (quote.itemCount === 0) {
        $("drawerShippingNote").textContent = `Free shipping on orders from ${money(quote.freeShippingThreshold)}.`;
      } else if (quote.amountForFreeShipping === 0) {
        $("drawerShippingNote").textContent = "✦ You've unlocked free shipping on this order!";
      } else {
        $("drawerShippingNote").textContent = `Add ${money(quote.amountForFreeShipping)} more for free shipping.`;
      }
    }

    $("cartEmpty").classList.toggle("hidden", quote.itemCount > 0);
    cartItemsEl.classList.toggle("hidden", quote.itemCount === 0);
    if ($("drawerCheckoutLink")) {
      $("drawerCheckoutLink").classList.toggle("disabled-link", quote.itemCount === 0);
      $("drawerCheckoutLink").setAttribute("aria-disabled", quote.itemCount === 0 ? "true" : "false");
    }
  }

  function renderCheckoutQuote(quote) {
    const emptyEl = $("checkoutEmpty");
    const contentEl = $("checkoutContent");
    const itemsEl = $("checkoutSummaryItems");
    if (!emptyEl || !contentEl || !itemsEl) return;

    emptyEl.classList.toggle("hidden", quote.itemCount > 0);
    contentEl.classList.toggle("hidden", quote.itemCount === 0);
    itemsEl.innerHTML = "";

    if (quote.itemCount === 0) return;

    quote.items.forEach(item => {
      const v = item.visual || { bg: "#e8d9ca", glyph: "#a98d73", mark: "✳" };
      const name = escapeHTML(item.name);
      const row = document.createElement("div");
      row.className = "checkout-mini-item";
      row.innerHTML = `
        <div class="checkout-mini-art" style="--productbg:${v.bg};--glyph:${v.glyph}" aria-hidden="true">${v.mark}</div>
        <div class="checkout-mini-info">
          <h4>${name}</h4>
          <small>Qty: ${item.qty} × ${money(item.salePrice)}</small>
        </div>
        <div class="checkout-mini-total">${money(item.lineTotal)}</div>
      `;
      itemsEl.appendChild(row);
    });

    if ($("checkoutItemCount")) $("checkoutItemCount").textContent = quote.itemCount;
    if ($("checkoutSubtotal")) $("checkoutSubtotal").textContent = money(quote.subtotal);
    if ($("checkoutSavingsRow") && $("checkoutSavings")) {
      $("checkoutSavingsRow").classList.toggle("hidden", quote.savings <= 0);
      $("checkoutSavings").textContent = `− ${money(quote.savings)}`;
    }
    if ($("checkoutShipping")) {
      $("checkoutShipping").textContent = quote.shippingFee === 0 ? "Free" : money(quote.shippingFee);
    }
    if ($("checkoutShippingNote")) {
      $("checkoutShippingNote").textContent = quote.shippingFee === 0 ? "Free threshold met" : "Standard";
    }
    if ($("checkoutTotal")) $("checkoutTotal").textContent = money(quote.total);
  }

  function renderCartPageQuote(quote) {
    const emptyEl = $("cartPageEmpty");
    const contentEl = $("cartPageContent");
    const rowsEl = $("cartPageRows");
    if (!emptyEl || !contentEl || !rowsEl) return;

    emptyEl.classList.toggle("hidden", quote.itemCount > 0);
    contentEl.classList.toggle("hidden", quote.itemCount === 0);
    rowsEl.innerHTML = "";

    if (quote.itemCount === 0) return;

    quote.items.forEach(item => {
      const v = item.visual || { bg: "#e8d9ca", glyph: "#a98d73", mark: "✳" };
      const name = escapeHTML(item.name);
      const href = `/product/${encodeURIComponent(item.slug)}`;
      const meta = [item.category, item.scent, item.size].filter(Boolean).map(escapeHTML).join(" · ");

      const row = document.createElement("article");
      row.className = "cart-page-row";
      row.innerHTML = `
        <div class="cart-page-product">
          <a href="${href}" class="cart-page-thumb" style="--productbg:${v.bg};--glyph:${v.glyph}" aria-hidden="true" tabindex="-1">${v.mark}</a>
          <div>
            <h3><a href="${href}" class="product-title-link">${name}</a></h3>
            <p class="cart-page-meta">${meta}</p>
            <button type="button" class="remove-line" aria-label="Remove ${name} from cart">Remove</button>
          </div>
        </div>
        <div class="cart-page-unit">
          <span class="price">${money(item.salePrice)}</span>
          ${item.onSale ? `<span class="old-price">${money(item.price)}</span>` : ""}
        </div>
        <div class="cart-page-qty">
          <div class="qty-control">
            <button type="button" aria-label="Decrease quantity of ${name}">−</button>
            <span aria-label="Quantity">${item.qty}</span>
            <button type="button" aria-label="Increase quantity of ${name}">+</button>
          </div>
          <small class="stock-hint">${item.stock} in stock</small>
        </div>
        <div class="cart-page-line-total">${money(item.lineTotal)}</div>
      `;

      const controls = row.querySelectorAll(".qty-control button");
      controls[0].addEventListener("click", () => changeQuantity(item.sku, -1));
      controls[1].addEventListener("click", () => changeQuantity(item.sku, 1));
      row.querySelector(".remove-line").addEventListener("click", () => removeFromCart(item.sku));
      rowsEl.appendChild(row);
    });

    if ($("summaryItemCount")) $("summaryItemCount").textContent = quote.itemCount;
    if ($("summarySubtotal")) $("summarySubtotal").textContent = money(quote.subtotal);
    if ($("summarySavingsRow") && $("summarySavings")) {
      $("summarySavingsRow").classList.toggle("hidden", quote.savings <= 0);
      $("summarySavings").textContent = `− ${money(quote.savings)}`;
    }
    if ($("summaryShipping")) {
      $("summaryShipping").textContent = quote.shippingFee === 0 ? "Free" : money(quote.shippingFee);
    }
    if ($("summaryTotal")) $("summaryTotal").textContent = money(quote.total);

    if ($("cartPageShippingText")) {
      $("cartPageShippingText").textContent = quote.amountForFreeShipping === 0
        ? "✦ Your order qualifies for free delivery!"
        : `Add ${money(quote.amountForFreeShipping)} more to unlock free delivery (from ${money(quote.freeShippingThreshold)}).`;
    }
    if ($("cartPageShippingBar")) {
      $("cartPageShippingBar").style.width = `${quote.freeShippingProgress}%`;
    }
  }

  const productGrid = $("productGrid");
  const initialCards = productGrid ? [...productGrid.querySelectorAll(".product-card")] : [];

  // On the /shop page the SERVER does the filtering and searching (so every collection stays reachable).
  // On the home page all cards are already shown, so the browser filters them instantly.
  const serverFiltered = Boolean($("shopFilterForm"));

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
      if (productGrid && !serverFiltered) filterAndSortCards();
    });
    const form = input.closest("form");
    if (form) {
      form.addEventListener("submit", event => {
        if (productGrid && $("shop") && !serverFiltered) {
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

  /* ---------- Contact Form Wiring (Step 6) ---------- */
  const contactForm = $("contactForm");
  if (contactForm) {
    contactForm.addEventListener("submit", async event => {
      event.preventDefault();
      const feedback = $("contactFeedback");
      const submitBtn = $("contactSubmitBtn");
      const payload = {
        name: $("contactName").value.trim(),
        contact: $("contactInfo").value.trim(),
        topic: $("contactTopic").value,
        message: $("contactMessage").value.trim()
      };

      submitBtn.disabled = true;
      feedback.className = "form-feedback";
      feedback.textContent = "Sending your message…";

      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          feedback.className = "form-feedback error";
          feedback.textContent = data.error || "Please check your form details and try again.";
        } else {
          feedback.className = "form-feedback success";
          feedback.textContent = data.message;
          contactForm.reset();
        }
      } catch {
        feedback.className = "form-feedback error";
        feedback.textContent = "Could not reach the server. Please try again.";
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  const onFilterChange = () => {
    if (serverFiltered) $("shopFilterForm").requestSubmit();
    else filterAndSortCards();
  };
  if ($("categoryFilter")) $("categoryFilter").addEventListener("change", onFilterChange);
  if ($("sortSelect")) $("sortSelect").addEventListener("change", onFilterChange);
  if ($("clearCartBtn")) $("clearCartBtn").addEventListener("click", clearCart);

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

  if ($("drawerCheckoutLink")) {
    $("drawerCheckoutLink").addEventListener("click", event => {
      if ($("drawerCheckoutLink").classList.contains("disabled-link")) {
        event.preventDefault();
        showToast("Your cart is empty. Add a candle first.");
      }
    });
  }

  /* ---------- Checkout Form Submission (Step 7) ---------- */
  const checkoutForm = $("checkoutForm");
  if (checkoutForm) {
    const phoneInput = $("checkoutPhone");
    const phoneHint = $("phoneHint");
    if (phoneInput && phoneHint) {
      phoneInput.addEventListener("input", () => {
        const compact = phoneInput.value.replace(/[\s\-().]/g, "");
        if (!compact) {
          phoneHint.textContent = "Format: 03XX-XXXXXXX (11 digits) or +92 3XX XXXXXXX";
          phoneHint.style.color = "";
          return;
        }
        const m = compact.match(/^(?:\+92|0092|92)?0?(3\d{2})(\d{7})$/);
        if (m) {
          phoneHint.textContent = `✓ Valid 11-digit mobile number recognized`;
          phoneHint.style.color = "var(--sage)";
        } else {
          const digitsOnly = compact.replace(/\D/g, "");
          phoneHint.textContent = `Currently ${digitsOnly.length} digits — Pakistani mobile numbers need 11 digits (03XX-XXXXXXX).`;
          phoneHint.style.color = "var(--accent-text)";
        }
      });
    }
    checkoutForm.addEventListener("submit", async event => {
      event.preventDefault();
      const feedback = $("checkoutFeedback");
      const previewBox = $("checkoutPreviewBox");
      const submitBtn = $("checkoutSubmitBtn");

      const items = [...cart.entries()].map(([sku, qty]) => ({ sku, qty }));
      const selectedPayment = checkoutForm.querySelector("input[name='paymentMethod']:checked");

      const payload = {
        items,
        fullName: $("checkoutName").value.trim(),
        phone: $("checkoutPhone").value.trim(),
        email: $("checkoutEmail").value.trim(),
        address: $("checkoutAddress").value.trim(),
        area: $("checkoutArea").value.trim(),
        city: $("checkoutCity").value.trim(),
        province: $("checkoutProvince").value,
        notes: $("checkoutNotes").value.trim(),
        paymentMethod: selectedPayment ? selectedPayment.value : "cod",
        whatsappOptIn: $("checkoutWhatsappOptIn").checked
      };

      submitBtn.disabled = true;
      previewBox.classList.add("hidden");
      feedback.className = "form-feedback";
      feedback.textContent = "Verifying your address, phone number, and cart prices on the server…";

      try {
        const res = await fetch("/api/checkout/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!res.ok) {
          feedback.className = "form-feedback error";
          feedback.textContent = data.error || "Please check your checkout details and try again.";
          if (data.field) {
            const fieldMap = {
              fullName: "checkoutName",
              phone: "checkoutPhone",
              email: "checkoutEmail",
              address: "checkoutAddress",
              area: "checkoutArea",
              city: "checkoutCity",
              province: "checkoutProvince",
              notes: "checkoutNotes"
            };
            const targetEl = $(fieldMap[data.field]);
            if (targetEl) targetEl.focus();
          }
          return;
        }

        feedback.className = "form-feedback success";
        feedback.textContent = `✓ Checkout details verified by the server (${data.previewNumber}).`;

        const c = data.customer;
        const q = data.quote;
        previewBox.innerHTML = `
          <h3>Server-Verified Order Payload (${escapeHTML(data.previewNumber)})</h3>
          <p class="preview-sub">This payload passed all server validations and is ready for PostgreSQL order creation in Step 10:</p>
          <dl class="preview-dl">
            <div><dt>Customer</dt><dd>${escapeHTML(c.fullName)}</dd></div>
            <div><dt>WhatsApp / Mobile</dt><dd>${escapeHTML(c.phoneLocal)} <code>(${escapeHTML(c.phoneE164)})</code></dd></div>
            <div><dt>Delivery Address</dt><dd>${escapeHTML(c.address)}${c.area ? ", " + escapeHTML(c.area) : ""}, ${escapeHTML(c.city)}, ${escapeHTML(c.province)}</dd></div>
            <div><dt>Payment Method</dt><dd>${escapeHTML(c.paymentMethod)}</dd></div>
            <div><dt>WhatsApp Alerts</dt><dd>${c.whatsappOptIn ? "Opted in for customer WhatsApp confirmation" : "Owner alert only"}</dd></div>
            <div><dt>Verified Total</dt><dd><strong>${money(q.total)}</strong> (${q.itemCount} items, shipping: ${q.shippingFee === 0 ? "Free" : money(q.shippingFee)})</dd></div>
          </dl>
        `;
        previewBox.classList.remove("hidden");
        previewBox.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
      } catch {
        feedback.className = "form-feedback error";
        feedback.textContent = "Could not reach the server. Please check your connection and try again.";
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  window.addEventListener("storage", event => {
    if (event.key === CART_STORAGE_KEY) {
      loadCartFromStorage();
      syncCartWithServer();
    }
  });

  loadCartFromStorage();
  syncCartWithServer();
})();
