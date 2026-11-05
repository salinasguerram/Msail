/*
 * Panel de MSAIL: la barra lateral recuerda si la dejaste abierta o cerrada.
 *
 * Unfold solo lo recuerda en pantallas de más de 1280 px; por debajo la cierra en cada página.
 * Acá se baja ese límite a 768 px (notebooks y tablets). En celulares sigue como un menú que se abre encima.
 */
(function () {
  var DESKTOP_MIN = 768;
  var KEY = "sidebarOpen";

  function isDesktop() {
    return window.innerWidth >= DESKTOP_MIN;
  }

  function savedOpen() {
    return localStorage.getItem(KEY) !== "0"; // abierta por defecto
  }

  document.addEventListener("alpine:init", function () {
    var original = window.theme;
    if (typeof original !== "function") return;

    window.theme = function (defaultTheme) {
      var state = original(defaultTheme);

      state.sidebarOpen = isDesktop() ? savedOpen() : false;

      state.sidebarToggle = function () {
        this.sidebarOpen = !this.sidebarOpen;
        if (isDesktop()) localStorage.setItem(KEY, this.sidebarOpen ? "1" : "0");
      };

      state.themeBindings["x-resize.window"] = function () {
        this.sidebarOpen = isDesktop() ? savedOpen() : false;
      };

      return state;
    };
  });
})();
