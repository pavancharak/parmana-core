// Parmana developer docs: search, copy buttons, the mobile navigation and the "On this page" highlight.
// Everything here is progressive: the pages read fully without it.
(function () {
  "use strict";

  var root = document.documentElement.getAttribute("data-root") || "";
  var index = (window.PORTAL_INDEX || []).slice();

  // ---- search ----
  var input = document.getElementById("search");
  var box = document.getElementById("results");

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function score(entry, terms) {
    var title = entry.t.toLowerCase();
    var heads = entry.h.join(" ").toLowerCase();
    var body = (entry.x + " " + entry.g).toLowerCase();
    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (title.indexOf(t) >= 0) total += 10;
      else if (heads.indexOf(t) >= 0) total += 4;
      else if (body.indexOf(t) >= 0) total += 1;
      else return 0;
    }
    return total;
  }

  function render(q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    var hits = index
      .map(function (e) { return { e: e, s: score(e, terms) }; })
      .filter(function (h) { return h.s > 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, 10);
    if (hits.length === 0) {
      box.innerHTML = '<div class="none">No pages match “' + esc(q) + "”.</div>";
    } else {
      box.innerHTML = hits
        .map(function (h, i) {
          return (
            '<a href="' + root + esc(h.e.p) + '" role="option"' + (i === 0 ? ' class="on"' : "") + ">" +
            '<div class="r-g">' + esc(h.e.g) + "</div>" +
            '<div class="r-t">' + esc(h.e.t) + "</div>" +
            '<div class="r-x">' + esc(h.e.x.slice(0, 120)) + "…</div></a>"
          );
        })
        .join("");
    }
    box.hidden = false;
  }

  if (input && box) {
    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { input.value = ""; render(""); input.blur(); }
      if (ev.key === "Enter") {
        var first = box.querySelector("a");
        if (first) window.location.href = first.getAttribute("href");
      }
    });
    input.addEventListener("focus", function () { if (input.value) render(input.value); });
    document.addEventListener("click", function (ev) {
      if (!box.contains(ev.target) && ev.target !== input) box.hidden = true;
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "/" && document.activeElement !== input &&
          !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
        ev.preventDefault();
        input.focus();
      }
    });
  }

  // ---- copy buttons ----
  document.querySelectorAll(".copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var code = btn.closest(".code").querySelector("code");
      var text = code ? code.innerText : "";
      var done = function () {
        btn.textContent = "Copied";
        setTimeout(function () { btn.textContent = "Copy"; }, 1400);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {});
      }
    });
  });

  // ---- mobile navigation ----
  var toggle = document.querySelector(".menu-toggle");
  var sidebar = document.getElementById("sidebar");
  if (toggle && sidebar) {
    toggle.addEventListener("click", function () {
      var open = sidebar.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // ---- highlight the section in view in "On this page" ----
  var links = Array.prototype.slice.call(document.querySelectorAll(".toc a"));
  if (links.length && "IntersectionObserver" in window) {
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && byId[en.target.id]) {
          links.forEach(function (a) { a.classList.remove("on"); });
          byId[en.target.id].classList.add("on");
        }
      });
    }, { rootMargin: "0px 0px -70% 0px" });
    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }
})();
