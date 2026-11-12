// Domowy theme switch. Follows the phone's light/dark setting until someone taps a
// [data-theme-toggle] button; that choice is then remembered on this device only.
// Load it in <head> (before the CSS paints) so a saved night theme doesn't flash white.
(function () {
  var KEY = "domowy-theme";
  var root = document.documentElement;
  var dark = window.matchMedia("(prefers-color-scheme: dark)");

  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function current() {
    return root.dataset.theme || (dark.matches ? "dark" : "light");
  }
  function label() {
    var night = current() === "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      b.setAttribute("aria-label", night ? "Przełącz na motyw dzienny" : "Przełącz na motyw nocny");
    });
  }

  var s = saved();
  if (s === "light" || s === "dark") root.dataset.theme = s;

  window.domowyTheme = {
    toggle: function () {
      var next = current() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem(KEY, next); } catch (e) {}
      label();
    },
    // Back to following the phone.
    reset: function () {
      delete root.dataset.theme;
      try { localStorage.removeItem(KEY); } catch (e) {}
      label();
    },
    current: current,
  };

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-theme-toggle]");
    if (b) window.domowyTheme.toggle();
  });
  dark.addEventListener("change", label);
  document.addEventListener("DOMContentLoaded", label);
})();
