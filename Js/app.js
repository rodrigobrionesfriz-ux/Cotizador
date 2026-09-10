const navItems = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");
const viewTitle = document.getElementById("view-title");

const titles = {
  dashboard: "Dashboard",
  clientes: "Clientes",
  catalogo: "Catálogo",
  cotizaciones: "Cotizaciones",
  obras: "Obras",
  facturacion: "Facturación"
};

navItems.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.view;

    navItems.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    views.forEach((v) => v.classList.remove("active"));
    document.getElementById(`view-${target}`).classList.add("active");

    viewTitle.textContent = titles[target] || target;
  });
});
