(function () {
  var SHEET_ID = "1j3XpKOZo06tEyxmwedajKFC8LSVe9mkZuf_z6vw8vvs";

  function cellText(cell) {
    if (!cell || cell.v == null || cell.v === "") return "";
    if (typeof cell.v === "number") {
      return String(Math.round(cell.v * 100) / 100);
    }
    return String(cell.v).trim();
  }

  function isPack(name) {
    return /^\d+(\.\d+)?\s*(kg|kgs|gm|gms|g)\b/i.test(String(name || "").trim());
  }

  function slug(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function formatRate(value) {
    if (value == null || value === "") return "";
    var n = Number(String(value).replace(/,/g, ""));
    if (!isFinite(n)) return String(value);
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
  }

  function lowest(category) {
    var prices = [];
    (category.items || []).forEach(function (item) {
      if (item.price) prices.push(Number(item.price));
      (item.packs || []).forEach(function (pack) {
        if (pack.price) prices.push(Number(pack.price));
      });
    });
    prices = prices.filter(function (n) { return isFinite(n); });
    if (!prices.length) return null;
    return Math.min.apply(null, prices);
  }

  function parseSheetResponse(resp) {
    var table = (resp && resp.table) || {};
    var cols = table.cols || [];
    var date = (cols[2] && cols[2].label ? String(cols[2].label) : "").trim();
    var raw = (table.rows || []).map(function (row) {
      var c = row.c || [];
      return {
        name: cellText(c[0]),
        brand: cellText(c[1]),
        price: cellText(c[2])
      };
    }).filter(function (row) {
      return row.name || row.brand || row.price;
    });

    var categories = [];
    var current = null;
    var group = null;

    function ensure(name) {
      current = { name: name, slug: slug(name), items: [] };
      categories.push(current);
      group = null;
    }

    for (var i = 0; i < raw.length; i++) {
      var row = raw[i];
      var next = raw[i + 1];
      var nextIsPack = next && isPack(next.name);

      if (row.name && !row.brand && !row.price && !isPack(row.name)) {
        if (nextIsPack && current) {
          group = { name: row.name, brand: "", price: "", packs: [] };
          current.items.push(group);
        } else {
          ensure(row.name);
        }
        continue;
      }

      if (!current) ensure("Rates");

      if (isPack(row.name) && group) {
        group.packs.push({ size: row.name, brand: row.brand, price: row.price });
        continue;
      }

      if (row.name && !row.price && nextIsPack) {
        group = { name: row.name, brand: row.brand, price: "", packs: [] };
        current.items.push(group);
        continue;
      }

      group = null;
      current.items.push({
        name: row.name,
        brand: row.brand,
        price: row.price,
        packs: []
      });
    }

    return { date: date, categories: categories };
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function rateText(value) {
    var formatted = formatRate(value);
    return formatted ? "₹" + formatted : "—";
  }

  function renderBoard(mount, data) {
    mount.replaceChildren();
    if (!data.categories.length) {
      mount.appendChild(el("p", "rate-error", "The price sheet is empty."));
      return;
    }

    var note = el("p", "rate-note");
    note.textContent = "All rates are per quintal";
    if (data.date) note.textContent += ", as on " + data.date;
    note.textContent += ". Lines marked with GST are listed that way in the mill sheet. Pack rows such as 50 kg and 30 kg are the rate for that packing.";
    mount.appendChild(note);

    data.categories.forEach(function (category) {
      var section = el("section", "rate-block");
      section.id = category.slug;

      var head = el("div", "rate-block-head");
      head.appendChild(el("h3", null, category.name));
      var from = lowest(category);
      if (from != null) head.appendChild(el("span", null, "From ₹" + formatRate(from)));
      section.appendChild(head);

      var table = el("table", "rate-table");
      var thead = el("thead");
      var hr = el("tr");
      ["Product", "Brand", "Rate (₹ / qtl)"].forEach(function (label) {
        hr.appendChild(el("th", null, label));
      });
      thead.appendChild(hr);
      table.appendChild(thead);

      var tbody = el("tbody");
      category.items.forEach(function (item) {
        if (item.packs && item.packs.length) {
          var parent = el("tr", "rate-group");
          var nameCell = el("td", null, item.name);
          nameCell.colSpan = item.brand ? 1 : 2;
          parent.appendChild(nameCell);
          if (item.brand) parent.appendChild(el("td", null, item.brand));
          parent.appendChild(el("td", "num", ""));
          tbody.appendChild(parent);
          item.packs.forEach(function (pack) {
            var pr = el("tr", "rate-pack");
            pr.appendChild(el("td", null, pack.size));
            pr.appendChild(el("td", null, pack.brand || item.brand || ""));
            pr.appendChild(el("td", "num", rateText(pack.price)));
            tbody.appendChild(pr);
          });
          return;
        }
        var tr = el("tr");
        tr.appendChild(el("td", null, item.name));
        tr.appendChild(el("td", null, item.brand));
        tr.appendChild(el("td", "num", rateText(item.price)));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      section.appendChild(table);
      mount.appendChild(section);
    });
  }

  function renderHero(mount, data) {
    mount.replaceChildren();
    data.categories.forEach(function (category) {
      var li = el("li");
      var link = document.createElement("a");
      link.href = "downloads.html#" + category.slug;
      link.appendChild(el("span", null, category.name));
      var from = lowest(category);
      link.appendChild(el("strong", null, from == null ? "—" : "₹" + formatRate(from)));
      li.appendChild(link);
      mount.appendChild(li);
    });
  }

  function renderCards(mount, data) {
    mount.replaceChildren();
    data.categories.forEach(function (category) {
      var card = el("a", "rate-card");
      card.href = "downloads.html#" + category.slug;
      card.appendChild(el("h3", null, category.name));
      var count = 0;
      category.items.forEach(function (item) {
        count += item.packs && item.packs.length ? item.packs.length : 1;
      });
      card.appendChild(el("p", null, count + (count === 1 ? " rate" : " rates")));
      var from = lowest(category);
      card.appendChild(el("strong", null, from == null ? "Rate on request" : "From ₹" + formatRate(from)));
      mount.appendChild(card);
    });
  }

  function paint(data) {
    document.querySelectorAll("[data-rate-date]").forEach(function (node) {
      node.textContent = data.date || "Latest sheet";
    });
    var board = document.getElementById("rate-board");
    if (board) renderBoard(board, data);
    var hero = document.getElementById("hero-rates-list");
    if (hero) renderHero(hero, data);
    var cards = document.getElementById("rate-cards");
    if (cards) renderCards(cards, data);
  }

  function fail(message) {
    document.querySelectorAll("[data-rates]").forEach(function (node) {
      node.replaceChildren(el("p", "rate-error", message));
    });
  }

  function loadRates() {
    return new Promise(function (resolve, reject) {
      var cb = "gdmRates" + Date.now();
      var script = document.createElement("script");
      window[cb] = function (resp) {
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        script.remove();
        if (!resp || resp.status !== "ok") {
          reject(new Error("The price sheet did not respond."));
          return;
        }
        resolve(parseSheetResponse(resp));
      };
      script.onerror = function () {
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        reject(new Error("The price sheet could not be reached."));
      };
      script.src = "https://docs.google.com/spreadsheets/d/" + SHEET_ID +
        "/gviz/tq?headers=1&gid=0&tqx=" +
        encodeURIComponent("out:json;responseHandler:" + cb) +
        "&_=" + Date.now();
      document.head.appendChild(script);
    });
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      if (!document.querySelector("[data-rates], [data-rate-date]")) return;
      loadRates().then(paint).catch(function () {
        fail("Today's rates could not be loaded. Refresh the page in a moment.");
      });
    });
  }

  var api = {
    parseSheetResponse: parseSheetResponse,
    formatRate: formatRate,
    slug: slug
  };
  if (typeof window !== "undefined") window.GDMRates = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
