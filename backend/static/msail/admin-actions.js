/*
 * Panel de MSAIL: menú de acciones de las listas (Eliminar, Exportar, Sumar al equipo...).
 *
 * El navegador dibuja la lista desplegable nativa con sus propios colores (gris sobre gris en modo oscuro) y no se
 * puede estilizar del todo. Acá se reemplaza por un menú con los colores del panel. El <select> original sigue en
 * el formulario: al elegir una opción se le cambia el valor, así Unfold muestra «Ejecutar» y envía la acción igual.
 */
(function () {
  function label(option) {
    return option.textContent.trim();
  }

  function enhance(select) {
    if (select.dataset.msailMenu) return;
    select.dataset.msailMenu = "1";

    // El menú va al lado del <select>, sin moverlo: así Unfold (Alpine) no pierde su conexión con él.
    var wrapper = document.createElement("div");
    wrapper.className = "msail-actions";
    select.insertAdjacentElement("afterend", wrapper);
    select.classList.add("msail-actions-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    var button = document.createElement("button");
    button.type = "button";
    button.className = "msail-actions-button";
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML =
      '<span class="material-symbols-outlined msail-actions-icon" aria-hidden="true">bolt</span>' +
      '<span class="msail-actions-label"></span>' +
      '<span class="material-symbols-outlined msail-actions-chevron" aria-hidden="true">expand_less</span>';
    wrapper.appendChild(button);

    var menu = document.createElement("div");
    menu.className = "msail-actions-menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;
    wrapper.appendChild(menu);

    var title = document.createElement("div");
    title.className = "msail-actions-title";
    title.textContent = "Acciones para los seleccionados";
    menu.appendChild(title);

    Array.prototype.forEach.call(select.options, function (option) {
      if (!option.value) return; // «Elegí una acción»
      var item = document.createElement("button");
      item.type = "button";
      item.className = "msail-actions-item";
      item.setAttribute("role", "option");
      item.dataset.value = option.value;
      item.textContent = label(option);
      if (/^(delete_selected|.*(remove|cancel|deactivate).*)$/.test(option.value)) item.classList.add("is-danger");
      item.addEventListener("click", function () {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        // Por las dudas, también se avisa directo a Alpine (muestra el botón «Ejecutar»).
        if (window.Alpine && window.Alpine.$data) {
          try {
            window.Alpine.$data(select).action = option.value;
          } catch (e) {
            /* sin Alpine: alcanza con el evento */
          }
        }
        close();
        sync();
        button.focus();
      });
      menu.appendChild(item);
    });

    function sync() {
      var current = select.options[select.selectedIndex];
      wrapper.querySelector(".msail-actions-label").textContent = current ? label(current) : "";
      button.classList.toggle("has-value", !!select.value);
      Array.prototype.forEach.call(menu.querySelectorAll(".msail-actions-item"), function (item) {
        var selected = item.dataset.value === select.value;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-selected", selected ? "true" : "false");
      });
    }

    function open() {
      menu.hidden = false;
      button.setAttribute("aria-expanded", "true");
      // Que no se salga de la pantalla por la derecha (con la barra lateral abierta y la ventana angosta).
      menu.style.left = "0px";
      var overflow = menu.getBoundingClientRect().right - (window.innerWidth - 16);
      if (overflow > 0) menu.style.left = -overflow + "px";
      var first = menu.querySelector(".is-selected") || menu.querySelector(".msail-actions-item");
      if (first) first.focus();
    }

    function close() {
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }

    button.addEventListener("click", function () {
      if (menu.hidden) open();
      else close();
    });

    // Teclado: flechas para moverse, Escape para cerrar.
    menu.addEventListener("keydown", function (event) {
      var items = Array.prototype.slice.call(menu.querySelectorAll(".msail-actions-item"));
      var index = items.indexOf(document.activeElement);
      if (event.key === "ArrowDown") {
        items[(index + 1) % items.length].focus();
        event.preventDefault();
      } else if (event.key === "ArrowUp") {
        items[(index - 1 + items.length) % items.length].focus();
        event.preventDefault();
      } else if (event.key === "Escape") {
        close();
        button.focus();
      }
    });

    document.addEventListener("click", function (event) {
      if (!wrapper.contains(event.target)) close();
    });

    select.addEventListener("change", sync);
    sync();
  }

  function init() {
    document.querySelectorAll('#changelist-actions select[name="action"]').forEach(enhance);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
