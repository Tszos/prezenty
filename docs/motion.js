// Domowy motion helpers. Plain script, no dependencies: load it once per page (or import it
// for its side effect in a bundled app). Everything does nothing under reduced motion.
//   domowyMotion.fold(el)        -> Promise: folds a list row shut; resolve, move it, then call done()
//   domowyMotion.unfold(el)      -> unfolds a row that was just inserted
//   domowyMotion.roll(el, n)     -> rolls the number inside a .d-roll element to n
//   domowyMotion.stamp(el)       -> presses a checkbox in like a rubber stamp
// Automatic: chip ink starts where the finger lands, and a .d-check stamps when ticked.
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var EASE = "cubic-bezier(.22, .8, .3, 1)";
  var SHUT = { height: "0px", minHeight: "0px", paddingTop: "0px", paddingBottom: "0px", borderBottomWidth: "0px", opacity: 0 };

  function ms(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v ? parseFloat(v) : fallback;
  }

  // Resolves with done(): call it after moving or removing the element, so the folded
  // row doesn't flash back open for a frame.
  function fold(el) {
    if (reduce.matches || !el.animate) return Promise.resolve(function () {});
    var h = el.offsetHeight;
    el.style.overflow = "hidden";
    var a = el.animate([{ height: h + "px", minHeight: "0px", opacity: 1 }, { opacity: 0, offset: 0.45 }, SHUT],
      { duration: ms("--motion-quick", 160) * 1.4, easing: EASE, fill: "forwards" });
    return a.finished.then(function () {
      return function () { a.cancel(); el.style.overflow = ""; };
    }, function () { return function () { el.style.overflow = ""; }; });
  }

  function unfold(el) {
    if (reduce.matches || !el.animate) return;
    var h = el.offsetHeight;
    el.style.overflow = "hidden";
    var a = el.animate([SHUT, { opacity: 0, offset: 0.4 }, { height: h + "px", minHeight: "0px", opacity: 1 }],
      { duration: ms("--motion-calm", 260), easing: EASE });
    var clear = function () { el.style.overflow = ""; };
    a.finished.then(clear, clear);
  }

  function roll(el, value) {
    var cur = el.lastElementChild;
    if (!cur) { el.innerHTML = "<span></span>"; cur = el.firstElementChild; cur.textContent = value; return; }
    var old = Number(cur.textContent);
    if (String(value) === cur.textContent) return;
    while (el.children.length > 1) el.firstElementChild.remove();
    var next = document.createElement("span");
    next.textContent = value;
    if (reduce.matches || isNaN(old)) { cur.remove(); el.append(next); return; }
    var dir = Number(value) > old ? "up" : "down";
    next.className = "in-" + dir;
    cur.className = "out-" + dir;
    cur.addEventListener("animationend", function () { cur.remove(); }, { once: true });
    el.append(next);
  }

  function stamp(el) {
    if (reduce.matches) return;
    el.classList.remove("d-stamp");
    void el.offsetWidth;
    el.classList.add("d-stamp");
    el.addEventListener("animationend", function () { el.classList.remove("d-stamp"); }, { once: true });
  }

  window.domowyMotion = { fold: fold, unfold: unfold, roll: roll, stamp: stamp, reduced: function () { return reduce.matches; } };

  // Chip ink spreads from the finger; keyboard taps keep the centre.
  document.addEventListener("pointerdown", function (e) {
    var chip = e.target.closest && e.target.closest(".d-chip");
    if (!chip) return;
    var r = chip.getBoundingClientRect();
    chip.style.setProperty("--x", e.clientX - r.left + "px");
    chip.style.setProperty("--y", e.clientY - r.top + "px");
  });
  document.addEventListener("keydown", function (e) {
    var chip = e.target.closest && e.target.closest(".d-chip");
    if (chip) { chip.style.removeProperty("--x"); chip.style.removeProperty("--y"); }
  });
  document.addEventListener("change", function (e) {
    if (e.target.matches && e.target.matches(".d-check") && e.target.checked) stamp(e.target);
  });
})();
