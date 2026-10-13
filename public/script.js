(() => {
  "use strict";
  const products = (window.AYE_NOOR_PRODUCTS || []).filter(p => p.status === "Active");
  const categories = [...new Set(products.map(p => p.category))];
  const $ = id => document.getElementById(id);
  const cart = new Map();
  const styles = {
    "Flower Candles": {bg:"#e8c9c0",glyph:"#b77970",mark:"✿"},
    "Bear Candles": {bg:"#dfc8b1",glyph:"#a47c5e",mark:"♡"},
    "Scented Candles": {bg:"#d7d8c7",glyph:"#79806a",mark:"◉"},
    "Gift Sets": {bg:"#e5c6ba",glyph:"#b67e72",mark:"✧"},
    "Custom Candles": {bg:"#ddd0bd",glyph:"#9c8366",mark:"A"}
  };
  const visual = category => styles[category] || {bg:"#e8d9ca",glyph:"#a98d73",mark:"✳"};
  const money = value => `Rs. ${Number(value).toLocaleString("en-PK")}`;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const scrollBehavior = () => (reducedMotion.matches ? "auto" : "smooth");
  let toastTimer;
  let lastFocused = null;

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  /* ---------- Categories & products ---------- */
  function renderCategories() {
    categories.forEach(category => {
      const v = visual(category);
      const button = document.createElement("button");
      button.className = "category-card";
      button.type = "button";
      button.style.setProperty("--catbg", v.bg);
      button.innerHTML = `<span class="category-art" aria-hidden="true">${v.mark}</span><span class="category-name">${escapeHTML(category)}</span>`;
      button.addEventListener("click", () => {
        $("categoryFilter").value = category;
        renderProducts();
        $("shop").scrollIntoView({behavior: scrollBehavior()});
      });
      $("categoryGrid").appendChild(button);
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      $("categoryFilter").appendChild(option);
    });
  }

  function renderProducts() {
    const term = $("searchInput").value.trim().toLowerCase();
    const category = $("categoryFilter").value;
    let list = products.filter(p => {
      const text = [p.name,p.category,p.description,p.scent,p.sku].join(" ").toLowerCase();
      return (category === "all" || p.category === category) && text.includes(term);
    });
    if ($("sortSelect").value === "low-high") list.sort((a,b) => a.salePrice-b.salePrice);
    if ($("sortSelect").value === "high-low") list.sort((a,b) => b.salePrice-a.salePrice);
    if ($("sortSelect").value === "name") list.sort((a,b) => a.name.localeCompare(b.name));
    $("productGrid").innerHTML = "";
    list.forEach(p => {
      const v = visual(p.category);
      const onSale = p.salePrice < p.price;
      const card = document.createElement("article");
      card.className = "product-card";
      card.innerHTML = `<div class="product-visual" style="--productbg:${v.bg};--glyph:${v.glyph}">
        ${onSale ? '<span class="product-badge">Sale</span>' : ''}
        <span class="product-glyph" aria-hidden="true">${v.mark}</span></div>
        <div class="product-info"><span class="product-category">${escapeHTML(p.category)}</span>
        <h3>${escapeHTML(p.name)}</h3><p class="product-description">${escapeHTML(p.description)}</p>
        <div class="price-row"><span class="price">${money(p.salePrice)}</span>${onSale ? `<span class="old-price"><span class="sr-only">Regular price </span>${money(p.price)}</span>` : ''}</div>
        <button class="add-button" type="button" aria-label="${p.stock > 0 ? "Add " + escapeHTML(p.name) + " to cart" : escapeHTML(p.name) + " is out of stock"}">${p.stock > 0 ? "Add to Cart" : "Out of stock"}</button></div>`;
      const addButton = card.querySelector("button");
      addButton.disabled = p.stock < 1;
      addButton.addEventListener("click", () => addToCart(p.sku));
      $("productGrid").appendChild(card);
    });
    $("emptyState").classList.toggle("hidden", list.length > 0);
  }

  /* ---------- Cart ---------- */
  function addToCart(sku) {
    const p = products.find(item => item.sku === sku);
    if (!p || p.stock < 1) return;
    const quantity = cart.get(sku) || 0;
    if (quantity >= p.stock) return showToast("You've reached the sample stock limit.");
    cart.set(sku, quantity + 1);
    renderCart();
    showToast(`${p.name} added to your cart.`);
  }

  function changeQuantity(sku, delta) {
    const p = products.find(item => item.sku === sku);
    if (!p) return;
    const quantity = (cart.get(sku) || 0) + delta;
    if (quantity <= 0) cart.delete(sku);
    else if (quantity <= p.stock) cart.set(sku, quantity);
    else showToast("You've reached the sample stock limit.");
    renderCart();
  }

  function renderCart() {
    let count = 0, subtotal = 0;
    $("cartItems").innerHTML = "";
    cart.forEach((quantity, sku) => {
      const p = products.find(item => item.sku === sku);
      if (!p) return;
      const v = visual(p.category);
      const name = escapeHTML(p.name);
      count += quantity; subtotal += p.salePrice * quantity;
      const row = document.createElement("div");
      row.className = "cart-line";
      row.innerHTML = `<div class="cart-line-art" style="--productbg:${v.bg};--glyph:${v.glyph}" aria-hidden="true">${v.mark}</div>
       <div><h4>${name}</h4><small>${money(p.salePrice)} each</small>
       <div class="qty-control"><button type="button" aria-label="Decrease quantity of ${name}">−</button><span aria-label="Quantity">${quantity}</span><button type="button" aria-label="Increase quantity of ${name}">+</button></div>
       <button type="button" class="remove-line" aria-label="Remove ${name} from cart">Remove</button></div><div class="cart-line-total">${money(p.salePrice * quantity)}</div>`;
      const controls = row.querySelectorAll(".qty-control button");
      controls[0].addEventListener("click", () => changeQuantity(sku,-1));
      controls[1].addEventListener("click", () => changeQuantity(sku,1));
      row.querySelector(".remove-line").addEventListener("click", () => {cart.delete(sku);renderCart();});
      $("cartItems").appendChild(row);
    });
    $("cartCount").textContent = count;
    $("cartSubtotal").textContent = money(subtotal);
    $("cartEmpty").classList.toggle("hidden", count > 0);
    $("cartItems").classList.toggle("hidden", count === 0);
  }

  /* ---------- Cart drawer (accessible dialog) ---------- */
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

  // Keep Tab inside the open cart so keyboard users don't wander behind it
  function trapFocus(event) {
    if (event.key !== "Tab" || !isCartOpen()) return;
    const focusable = [...$("cartDrawer").querySelectorAll("button:not([disabled]), [href], input, select, [tabindex]:not([tabindex='-1'])")]
      .filter(el => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  /* ---------- Mobile menu ---------- */
  function setMenu(open) {
    $("mainNav").classList.toggle("open", open);
    $("menuButton").setAttribute("aria-expanded", String(open));
    $("menuButton").setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }
  function isMenuOpen() { return $("mainNav").classList.contains("open"); }

  /* ---------- Toast ---------- */
  function showToast(message) {
    $("toast").textContent = message;
    $("toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2400);
  }

  /* ---------- Search (desktop box and mobile-menu box stay in sync) ---------- */
  const searchInputs = [$("searchInput"), $("searchInputMobile")];
  searchInputs.forEach(input => {
    input.addEventListener("input", () => {
      searchInputs.forEach(other => { if (other !== input) other.value = input.value; });
      renderProducts();
    });
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        setMenu(false);
        $("shop").scrollIntoView({behavior: scrollBehavior()});
      }
    });
  });

  /* ---------- Wiring ---------- */
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
  $("categoryFilter").addEventListener("change", renderProducts);
  $("sortSelect").addEventListener("change", renderProducts);
  $("checkoutDemo").addEventListener("click", () => showToast("Checkout will be added after the secure backend is built."));
  $("year").textContent = new Date().getFullYear();
  renderCategories(); renderProducts(); renderCart();
})();
