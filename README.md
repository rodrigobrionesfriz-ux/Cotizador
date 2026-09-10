# Sistema de Cotizaciones — Electricidad y Obras Civiles

Aplicación web para **Sociedad Agrícola y Forestal La Cabaña Ltda.** que centraliza clientes, catálogo de productos/servicios, cotizaciones, obras y facturación para el área de electricidad y obras civiles.

- **Hosting:** GitHub Pages → https://rodrigobrionesfriz-ux.github.io/Cotizador/
- **Backend:** Firebase (Authentication + Firestore)
- **Proyecto Firebase:** `cotizadoe-9c0d8` (app web "Cotizadorelec")

---

## Estructura del proyecto

```
Cotizador/
├── index.html              # Estructura de la app (login, sidebar, vistas, modales)
├── css/
│   └── styles.css          # Estilos + reglas de impresión (@media print)
└── js/
    ├── firebase-config.js  # Inicialización de Firebase (auth + db)
    ├── auth.js             # Login / logout / estado de sesión
    ├── app.js              # Navegación entre módulos y menú móvil
    ├── resumen.js          # Indicadores del Resumen en tiempo real
    ├── clientes.js         # CRUD de clientes
    ├── catalogo.js         # CRUD de productos/servicios (incluye calculadora de costo HH)
    ├── cotizaciones.js     # Editor de cotizaciones, folio correlativo e impresión/PDF
    ├── obras.js            # CRUD de obras
    ├── facturacion.js      # Proforma para el contador + registro de factura/boleta
    └── configuracion.js    # Datos de la empresa, logo e importación desde Excel
```

Cada módulo JS se carga como `type="module"` y se suscribe en tiempo real a su colección de Firestore mediante `onSnapshot`.

---

## Módulos

| Módulo | Estado | Descripción |
|---|---|---|
| **Resumen** | Completo | Cuatro tarjetas alimentadas en tiempo real desde Firestore: cotizaciones activas, pendientes de respuesta, aceptadas del mes y monto por cobrar. |
| **Clientes** | Completo | Alta/edición, búsqueda por nombre o RUT, importación desde Excel. |
| **Catálogo** | Completo | Material, equipo, mano de obra y servicio. Unidad de medida (UM), costo, precio, afecto a IVA. Calculadora de costo HH para mano de obra. Importación desde Excel. |
| **Cotizaciones** | Completo | Editor con selector de cliente e ítems buscables, descuento por ítem y global, cálculo de neto/IVA/total y margen estimado. Folio correlativo único. Impresión / PDF. |
| **Obras** | Completo | Registro de obras asociables a cotizaciones. |
| **Facturación** | Completo | Lista de cotizaciones aceptadas, generación de proforma (uso interno) y registro de la factura/boleta real con estado de pago. |
| **Configuración** | Completo | Datos de la empresa emisora, logo (se guarda en base64), plantillas e importación de clientes y catálogo desde Excel. |

---

## Colecciones en Firestore

- `clientes` — fichas de clientes.
- `catalogo` — productos y servicios (campo `unidad` = UM).
- `cotizaciones` — cotizaciones completas (incluye `items`, totales, estado, `folio`, y `factura`/`proformaFolio` cuando aplica).
- `obras` — obras registradas.
- `configuracion/empresa` — datos y logo de la empresa emisora.
- `contadores/cotizaciones` y `contadores/proformas` — contadores atómicos de folio (transacción).

---

## Folio de cotización

- Se asigna al **guardar** una cotización nueva, mediante una transacción sobre `contadores/cotizaciones` (`ultimoFolio + 1`), lo que garantiza que sea **correlativo y único**.
- Se muestra en formato **`F-000001`** en la lista, en el título del editor y en el documento impreso.
- Una cotización en estado borrador aún **no tiene folio** hasta que se guarda; si se imprime antes, aparece como `BORRADOR (sin folio)`.

---

## Impresión / PDF de la cotización

Botón **"Imprimir / PDF"** en el editor de cotizaciones. Genera un documento con:

- **Encabezado izquierdo:** datos de la empresa emisora (logo, nombre, RUT, giro, dirección, teléfono/email) desde `configuracion/empresa`.
- **Encabezado derecho:** título **COTIZACIÓN**, folio `F-000001` y fecha.
- **Ficha del cliente:** razón social, RUT, giro, dirección, comuna/región, contacto, teléfono, email (y obra/referencia si existen).
- **Detalle:** Código · Descripción · UM · Cantidad · Precio unitario · Total neto.
- **Resumen:** Neto, Descuento (si aplica), IVA (19 %) y Total.
- **Pie:** frase de vigencia ("Cotización válida por N días, hasta DD-MM-YYYY…").

Usa el diálogo de impresión del navegador, donde se puede elegir impresora o **"Guardar como PDF"**. La proforma (módulo Facturación) usa su propia área de impresión; ambas nunca se imprimen a la vez.

---

## Resumen — cómo se calcula cada tarjeta

- **Cotizaciones activas:** estado `borrador`, `enviada` o `en_revision`.
- **Pendientes de respuesta:** estado `enviada` o `en_revision`.
- **Aceptadas del mes:** estado `aceptada` cuya `fecha` cae en el mes calendario actual.
- **Por cobrar:** suma del `total` de las cotizaciones `aceptada` cuya factura aún no está pagada (incluye aceptadas sin factura registrada).

Todo se actualiza en vivo vía `onSnapshot` sobre la colección `cotizaciones`.

## Cambios recientes

- Módulo **Resumen** (antes "Dashboard"): renombrado y conectado a Firestore para actualizar sus indicadores en tiempo real.
- Columna **UM** (unidad de medida del catálogo) en el detalle del editor de cotizaciones.
- Botón **Imprimir / PDF** con formato de cotización membretado (empresa, cliente, folio `F-000001`, detalle con UM, resumen neto/IVA/total y vigencia).
- Folio mostrado en formato `F-000001` en lista, editor e impresión.

## Próximos pasos sugeridos

- Flujo de datos completo del sistema en PDF (documentación).
