(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var page = document.body.getAttribute("data-page");
    document.querySelectorAll("[data-nav-id]").forEach(function (link) {
      if (link.getAttribute("data-nav-id") === page) link.classList.add("is-active");
    });

    var year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());

    var toggle = document.querySelector(".nav-toggle");
    var nav = document.querySelector(".main-nav");
    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        var open = nav.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      });
    }

    var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
    if (slides.length) {
      var index = 0;
      var timer = null;
      function show(next) {
        index = (next + slides.length) % slides.length;
        slides.forEach(function (slide, i) {
          slide.classList.toggle("is-active", i === index);
        });
      }
      function restart() {
        if (timer) clearInterval(timer);
        timer = setInterval(function () { show(index + 1); }, 6500);
      }
      var nextBtn = document.querySelector("[data-slide-next]");
      var prevBtn = document.querySelector("[data-slide-prev]");
      if (nextBtn) nextBtn.addEventListener("click", function () { show(index + 1); restart(); });
      if (prevBtn) prevBtn.addEventListener("click", function () { show(index - 1); restart(); });
      show(0);
      restart();
    }

    var quotes = Array.prototype.slice.call(document.querySelectorAll(".quote"));
    if (quotes.length) {
      var qIndex = 0;
      function showQuote(next) {
        qIndex = (next + quotes.length) % quotes.length;
        quotes.forEach(function (quote, i) {
          quote.classList.toggle("is-active", i === qIndex);
        });
      }
      var qNext = document.querySelector("[data-quote-next]");
      var qPrev = document.querySelector("[data-quote-prev]");
      if (qNext) qNext.addEventListener("click", function () { showQuote(qIndex + 1); });
      if (qPrev) qPrev.addEventListener("click", function () { showQuote(qIndex - 1); });
      setInterval(function () { showQuote(qIndex + 1); }, 7000);
    }

    var form = document.getElementById("enquiry-form");
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var data = new FormData(form);
        var body = [
          "Name: " + (data.get("name") || ""),
          "Phone: " + (data.get("phone") || ""),
          "Email: " + (data.get("email") || ""),
          "",
          String(data.get("message") || "")
        ].join("\n");
        var status = document.getElementById("form-status");
        if (status) status.textContent = "Your email app should open with this enquiry.";
        window.location.href = "mailto:contact@ghanshyamdallmill.com?subject=" +
          encodeURIComponent("Enquiry from the website") +
          "&body=" + encodeURIComponent(body);
      });
    }
  });
})();
