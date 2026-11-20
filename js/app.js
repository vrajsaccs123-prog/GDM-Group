(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.GDM = api;
  if (typeof document === "undefined") return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", api.start);
  } else {
    api.start();
  }
})(typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : null, function () {
  var SHEET_ID = "1j3XpKOZo06tEyxmwedajKFC8LSVe9mkZuf_z6vw8vvs";
  var PHONE_LABEL = "+91 9926778127";
  var PHONE_HREF = "tel:+919926778127";
  var MONTHS = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
  };

  var dialog = null;
  var stickyObserver = null;
  var scrollLock = "";

  function slug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function parseDate(label) {
    var match = String(label || "").trim().match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})/i);
    if (!match) return null;
    var month = MONTHS[match[2].toLowerCase()];
    if (month == null) return null;
    var day = Number(match[1]);
    var year = Number(match[3]);
    var date = new Date(Date.UTC(year, month, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
    return date.getTime();
  }

  function formatDisplay(time) {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(new Date(time));
  }

  function formatWeekday(time) {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      timeZone: "UTC"
    }).format(new Date(time));
  }

  function formatAmount(value) {
    var rounded = Math.round(Number(value) * 100) / 100;
    return rounded.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }

  function formatReadTime(date) {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).formatToParts(date);
    var hour = "";
    var minute = "";
    var period = "";
    parts.forEach(function (part) {
      if (part.type === "hour") hour = part.value;
      if (part.type === "minute") minute = part.value;
      if (part.type === "dayPeriod") period = part.value.toLowerCase();
    });
    return hour + ":" + minute + " " + period;
  }

  function cellText(cell) {
    if (!cell || cell.v == null || cell.v === "") return "";
    return String(cell.v).trim();
  }

  function cellNumber(cell) {
    if (!cell || cell.v == null || cell.v === "") return null;
    var value = typeof cell.v === "number" ? cell.v : Number(String(cell.v).replace(/,/g, ""));
    return isFinite(value) ? value : null;
  }

  function isPack(name) {
    return /^\d+(\.\d+)?\s*(kg|kgs|gm|gms|g)\b/i.test(String(name || "").trim());
  }

  function uniqueId(name, used) {
    var base = slug(name) || "rates";
    var id = base;
    var n = 2;
    while (used[id]) {
      id = base + "-" + n;
      n += 1;
    }
    used[id] = true;
    return id;
  }

  function buildCategories(rows) {
    var categories = [];
    var current = null;
    var group = null;
    var used = {};

    function ensure(name) {
      current = { name: name, id: uniqueId(name, used), items: [] };
      categories.push(current);
      group = null;
    }

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var next = rows[i + 1];
      var nextIsPack = !!(next && isPack(next.name));

      if (row.name && !row.brand && row.price == null && !isPack(row.name)) {
        if (nextIsPack && current) {
          group = { name: row.name, brand: "", packs: [] };
          current.items.push(group);
        } else {
          ensure(row.name);
        }
        continue;
      }

      if (!current) ensure("Rates");

      if (isPack(row.name) && group) {
        group.packs.push(row);
        continue;
      }

      if (row.name && row.price == null && nextIsPack) {
        group = { name: row.name, brand: row.brand, packs: [] };
        current.items.push(group);
        continue;
      }

      group = null;
      current.items.push({ name: row.name, brand: row.brand, price: row.price, packs: [] });
    }

    return categories.map(function (category) {
      var items = [];
      category.items.forEach(function (item) {
        if (item.packs && item.packs.length) {
          item.packs.forEach(function (pack) {
            var brand = pack.brand || item.brand || "";
            items.push({
              name: item.name,
              note: brand ? pack.name + " · " + brand : pack.name,
              amount: pack.price,
              extra: ""
            });
          });
          return;
        }
        items.push({
          name: item.name,
          note: item.brand || "",
          amount: item.price,
          extra: ""
        });
      });
      return { id: category.id, name: category.name, items: items };
    }).filter(function (category) {
      return category.items.length;
    });
  }

  function countRates(categories) {
    var count = 0;
    categories.forEach(function (category) {
      category.items.forEach(function (item) {
        if (item.amount != null) count += 1;
      });
    });
    return count;
  }

  function rateKey(categoryName, item) {
    return (categoryName + "\n" + item.name + "\n" + item.note).toLowerCase();
  }

  function previousMap(day) {
    var map = new Map();
    if (!day) return map;
    day.categories.forEach(function (category) {
      category.items.forEach(function (item) {
        if (item.amount != null) map.set(rateKey(category.name, item), item.amount);
      });
    });
    return map;
  }

  function parseSheet(resp) {
    var table = (resp && resp.table) || {};
    var cols = table.cols || [];
    var dateCols = [];
    for (var i = 2; i < cols.length; i++) {
      var label = cols[i] && cols[i].label ? String(cols[i].label).trim() : "";
      if (!label || /^column\s+\d+$/i.test(label)) continue;
      dateCols.push({ index: i, label: label, date: parseDate(label) });
    }
    var dated = dateCols.filter(function (col) { return col.date != null; });
    var chosen = dated.length ? dated : dateCols;
    chosen.sort(function (a, b) {
      if (a.date != null && b.date != null && a.date !== b.date) return b.date - a.date;
      return b.index - a.index;
    });

    var source = table.rows || [];
    var days = chosen.map(function (col) {
      var rows = [];
      source.forEach(function (row) {
        var cells = row.c || [];
        var name = cellText(cells[0]);
        var brand = cellText(cells[1]);
        var price = cellNumber(cells[col.index]);
        if (!name && !brand && price == null) return;
        rows.push({ name: name, brand: brand, price: price });
      });
      var categories = buildCategories(rows);
      return {
        label: col.label,
        display: col.date != null ? formatDisplay(col.date) : col.label,
        weekday: col.date != null ? formatWeekday(col.date) : "",
        slug: slug(col.label),
        date: col.date,
        categories: categories,
        rateCount: countRates(categories)
      };
    });

    return { days: days };
  }

  function pageFromLocation() {
    if (typeof window !== "undefined" && window.GDM_PAGE) return window.GDM_PAGE;
    var path = "/";
    if (typeof location !== "undefined") {
      path = location.pathname.replace(/\/index\.html$/, "");
      if (path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
      if (!path) path = "/";
    }
    if (path === "/history") return { mode: "history", slug: "" };
    if (path.indexOf("/history/") === 0) {
      return { mode: "day", slug: decodeURIComponent(path.slice("/history/".length)) };
    }
    return { mode: "today", slug: "" };
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function rateCountLabel(count) {
    return count + (count === 1 ? " rate" : " rates");
  }

  function renderRate(item, delta) {
    var rate = el("span", "rate");
    if (item.amount == null) {
      rate.appendChild(el("span", "rate-na", item.extra || "—"));
      return rate;
    }
    var value = el("span", "rate-value");
    value.appendChild(el("span", "rate-cur", "₹"));
    value.appendChild(document.createTextNode(formatAmount(item.amount)));
    rate.appendChild(value);
    if (item.extra) rate.appendChild(el("span", "rate-extra", item.extra));
    if (delta != null && delta !== 0) {
      var changed = el("span", delta > 0 ? "delta delta-up" : "delta delta-down");
      changed.textContent = (delta > 0 ? "▲ " : "▼ ") + formatAmount(Math.abs(delta));
      rate.appendChild(changed);
    }
    return rate;
  }

  function renderBoard(categories, prior) {
    var board = el("div", "board");
    board.id = "rates";
    categories.forEach(function (category, index) {
      var section = el("section", "card");
      section.id = category.id;
      var title = el("h2", "card-title");
      var button = el("button", "card-toggle");
      button.type = "button";
      button.id = category.id + "-open";
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("data-id", category.id);
      button.appendChild(el("span", "card-index", String(index + 1).padStart(2, "0")));
      button.appendChild(el("span", "card-name", category.name));
      button.appendChild(el("span", "card-more", "click for more"));
      title.appendChild(button);
      section.appendChild(title);
      board.appendChild(section);
    });
    board.addEventListener("click", function (event) {
      var button = event.target.closest(".card-toggle");
      if (!button) return;
      openDialog(button.getAttribute("data-id"), categories, prior);
    });
    return board;
  }

  function place(node, rect) {
    node.style.position = "fixed";
    node.style.top = rect.top + "px";
    node.style.left = rect.left + "px";
    node.style.width = rect.width + "px";
    node.style.height = rect.height + "px";
    node.style.margin = "0";
    node.style.maxWidth = "none";
  }

  function focusOpenButton(id) {
    var button = document.getElementById(id + "-open");
    if (button) button.focus();
  }

  function trapTab(event) {
    if (!dialog) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    var sheet = document.getElementById(dialog.id + "-dialog");
    if (!sheet) return;
    var nodes = sheet.querySelectorAll("button, a, input, select, textarea");
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    var active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !sheet.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  function finishClose() {
    if (!dialog) return;
    var id = dialog.id;
    if (dialog.node.parentNode) dialog.node.parentNode.removeChild(dialog.node);
    document.removeEventListener("keydown", trapTab);
    document.body.style.overflow = scrollLock;
    var button = document.getElementById(id + "-open");
    if (button) button.setAttribute("aria-expanded", "false");
    dialog = null;
    focusOpenButton(id);
  }

  function closeDialog() {
    if (!dialog || dialog.closing) return;
    dialog.closing = true;
    var sheet = dialog.sheet;
    var card = document.getElementById(dialog.id);
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    dialog.node.classList.remove("is-shown");
    if (sheet) sheet.classList.remove("is-shown");
    if (reduce || !sheet || !card) {
      finishClose();
      return;
    }
    place(sheet, card.getBoundingClientRect());
    var done = false;
    var timer = window.setTimeout(complete, 520);
    function complete() {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      sheet.removeEventListener("transitionend", onEnd);
      finishClose();
    }
    function onEnd(event) {
      if (event.target === sheet && event.propertyName === "height") complete();
    }
    sheet.addEventListener("transitionend", onEnd);
  }

  function openDialog(id, categories, prior) {
    if (dialog) return;
    var index = -1;
    var category = null;
    categories.forEach(function (item, itemIndex) {
      if (item.id === id) {
        category = item;
        index = itemIndex;
      }
    });
    if (!category) return;
    var card = document.getElementById(id);
    if (!card) return;
    var origin = card.getBoundingClientRect();
    var overlay = el("div", "card-overlay");
    overlay.appendChild(el("div", "card-overlay-scrim"));
    var sheet = el("section", "card card-sheet");
    sheet.id = id + "-dialog";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-labelledby", id + "-title");

    var bar = el("div", "card-sheet-bar");
    var title = el("h2", "card-sheet-title");
    title.id = id + "-title";
    title.appendChild(el("span", "card-index", String(index + 1).padStart(2, "0")));
    title.appendChild(el("span", "card-name", category.name));
    var close = el("button", "card-close");
    close.type = "button";
    close.id = id + "-close";
    close.setAttribute("aria-label", "Close " + category.name);
    close.appendChild(el("span", null, "×"));
    close.firstChild.setAttribute("aria-hidden", "true");
    bar.appendChild(title);
    bar.appendChild(close);

    var body = el("div", "card-sheet-body");
    body.id = id + "-items";
    var head = el("div", "card-head");
    head.appendChild(el("span", null, "Product / Brand"));
    head.appendChild(el("span", null, "Rate"));
    var list = el("ul", "rows");
    category.items.forEach(function (item) {
      var priorAmount = prior.get(rateKey(category.name, item));
      var delta = item.amount != null && priorAmount != null ? item.amount - priorAmount : null;
      var row = el("li", "row");
      var copy = el("div");
      copy.appendChild(el("span", "variety", item.name));
      if (item.note) copy.appendChild(el("span", "note", item.note));
      row.appendChild(copy);
      row.appendChild(renderRate(item, delta));
      list.appendChild(row);
    });
    body.appendChild(head);
    body.appendChild(list);
    sheet.appendChild(bar);
    sheet.appendChild(body);
    overlay.appendChild(sheet);
    overlay.addEventListener("click", closeDialog);
    sheet.addEventListener("click", function (event) { event.stopPropagation(); });
    close.addEventListener("click", closeDialog);

    document.body.appendChild(overlay);
    scrollLock = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", trapTab);
    var opener = document.getElementById(id + "-open");
    if (opener) opener.setAttribute("aria-expanded", "true");
    dialog = { id: id, node: overlay, sheet: sheet, closing: false };

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      overlay.classList.add("is-shown");
      sheet.classList.add("is-shown");
      close.focus();
      return;
    }

    var natural = sheet.getBoundingClientRect();
    sheet.style.transition = "none";
    place(sheet, origin);
    sheet.offsetWidth;
    window.requestAnimationFrame(function () {
      if (!dialog || dialog.id !== id) return;
      sheet.style.transition = "";
      place(sheet, natural);
      overlay.classList.add("is-shown");
      sheet.classList.add("is-shown");
      close.focus();
    });
  }

  function dateline(eyebrow, title) {
    var block = el("div", "dateline");
    block.appendChild(el("span", "eyebrow", eyebrow));
    block.appendChild(el("span", "dateline-date", title));
    return block;
  }

  function bindSticky(label) {
    var bar = document.querySelector(".stickybar");
    var text = document.getElementById("sticky-label");
    if (!bar || !text) return;
    text.textContent = label;
    if (stickyObserver) stickyObserver.disconnect();
    var line = document.querySelector(".dateline");
    if (!line) return;
    stickyObserver = new IntersectionObserver(function (entries) {
      var show = !entries[0].isIntersecting;
      bar.classList.toggle("is-shown", show);
      bar.setAttribute("aria-hidden", show ? "false" : "true");
      var height = Math.ceil(bar.getBoundingClientRect().height) || 38;
      document.documentElement.style.setProperty("--stick", show ? height + "px" : "0px");
    }, { threshold: 0 });
    stickyObserver.observe(line);
  }

  function setNav(mode) {
    document.querySelectorAll("[data-nav]").forEach(function (link) {
      var on = (mode === "today" && link.getAttribute("data-nav") === "today") ||
        (mode !== "today" && link.getAttribute("data-nav") === "history");
      link.classList.toggle("is-on", on);
      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function mount(nodes) {
    var app = document.getElementById("app");
    app.replaceChildren.apply(app, nodes);
  }

  function renderToday(day, priorDay, readAt) {
    document.title = "Ghanshyam Dal Mill — Daily Rates";
    setNav("today");
    var block = dateline("Latest rates", day.display);
    var meta = day.weekday ? day.weekday + " · Sheet read " + formatReadTime(readAt) : "Sheet read " + formatReadTime(readAt);
    block.appendChild(el("span", "dateline-meta", meta));
    var note = el("p", "dateline-note");
    note.appendChild(document.createTextNode("For more details contact - Ankush Bansal: "));
    var phone = el("a", null, PHONE_LABEL);
    phone.href = PHONE_HREF;
    note.appendChild(phone);
    block.appendChild(note);
    mount([block, renderBoard(day.categories, previousMap(priorDay))]);
    bindSticky(day.display);
  }

  function renderHistory(days) {
    document.title = "Rate History — Ghanshyam Dal Mill";
    setNav("history");
    var block = dateline("Rate history", "Previous lists");
    block.appendChild(el("span", "dateline-meta", "Each date column on the mill sheet stays available here."));
    var list = el("ul", "daylist");
    days.forEach(function (day, index) {
      var item = el("li");
      var link = document.createElement("a");
      link.href = index === 0 ? "/" : "/history/" + encodeURIComponent(day.slug);
      link.appendChild(el("span", "daylist-date", day.display));
      var meta = day.weekday || "Saved list";
      meta += index === 0 ? " · Current" : " · " + rateCountLabel(day.rateCount);
      link.appendChild(el("span", "daylist-meta", meta));
      link.appendChild(el("span", "daylist-go", "→"));
      item.appendChild(link);
      list.appendChild(item);
    });
    mount([block, list]);
    bindSticky("Previous lists");
  }

  function renderDay(day, priorDay) {
    document.title = day.display + " — Ghanshyam Dal Mill";
    setNav("history");
    var block = dateline("Previous rates", day.display);
    var meta = day.weekday ? day.weekday + " · " + rateCountLabel(day.rateCount) : rateCountLabel(day.rateCount);
    block.appendChild(el("span", "dateline-meta", meta));
    var actions = el("div", "dateline-actions");
    var back = el("a", "textlink", "All dates");
    back.href = "/history";
    actions.appendChild(back);
    block.appendChild(actions);
    mount([block, renderBoard(day.categories, previousMap(priorDay))]);
    bindSticky(day.display);
  }

  function renderMissing() {
    document.title = "Rate History — Ghanshyam Dal Mill";
    setNav("history");
    var block = dateline("Missing", "That rate list is not on the sheet");
    var actions = el("div", "dateline-actions");
    var link = el("a", "textlink", "Today's Rates");
    link.href = "/";
    actions.appendChild(link);
    block.appendChild(actions);
    mount([block]);
    bindSticky("Rate history");
  }

  function renderEmpty() {
    document.title = "Ghanshyam Dal Mill — Daily Rates";
    setNav("today");
    var block = dateline("Latest rates", "The price sheet is empty");
    block.appendChild(el("span", "dateline-meta", "Add a product column and a date column, then refresh this page."));
    mount([block]);
    bindSticky("Ghanshyam Dal Mill");
  }

  function renderError() {
    var page = pageFromLocation();
    document.title = page.mode === "today" ? "Ghanshyam Dal Mill — Daily Rates" : "Rate History — Ghanshyam Dal Mill";
    setNav(page.mode === "today" ? "today" : "history");
    var block = dateline(page.mode === "today" ? "Latest rates" : "Rate history", "The sheet could not be read");
    block.appendChild(el("span", "dateline-meta", "Refresh the page in a moment."));
    mount([block]);
    bindSticky("Ghanshyam Dal Mill");
  }

  function show(parsed, readAt) {
    var page = pageFromLocation();
    var days = parsed.days || [];
    if (!days.length) {
      if (page.mode === "day") renderMissing();
      else if (page.mode === "history") renderHistory([]);
      else renderEmpty();
      return;
    }
    if (page.mode === "history") {
      renderHistory(days);
      return;
    }
    if (page.mode === "day") {
      var index = -1;
      days.forEach(function (day, dayIndex) {
        if (day.slug === page.slug) index = dayIndex;
      });
      if (index < 0) {
        renderMissing();
        return;
      }
      if (index === 0) {
        location.replace("/");
        return;
      }
      renderDay(days[index], days[index + 1] || null);
      return;
    }
    renderToday(days[0], days[1] || null, readAt);
  }

  function loadSheet() {
    return new Promise(function (resolve, reject) {
      var callback = "gdmRates" + Date.now();
      var script = document.createElement("script");
      var timer = window.setTimeout(function () {
        cleanup();
        reject(new Error("timeout"));
      }, 15000);
      function cleanup() {
        window.clearTimeout(timer);
        try { delete window[callback]; } catch (error) { window[callback] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      window[callback] = function (resp) {
        cleanup();
        if (!resp || resp.status !== "ok") {
          reject(new Error("sheet"));
          return;
        }
        resolve(parseSheet(resp));
      };
      script.onerror = function () {
        cleanup();
        reject(new Error("network"));
      };
      script.src = "https://docs.google.com/spreadsheets/d/" + SHEET_ID +
        "/gviz/tq?headers=1&gid=0&tqx=" +
        encodeURIComponent("out:json;responseHandler:" + callback) +
        "&_=" + Date.now();
      document.head.appendChild(script);
    });
  }

  function start() {
    if (!document.getElementById("app")) return;
    loadSheet().then(function (parsed) {
      show(parsed, new Date());
    }).catch(function () {
      renderError();
    });
  }

  return {
    parseSheet: parseSheet,
    slug: slug,
    formatAmount: formatAmount,
    start: start
  };
});
