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
    ├── plantilla.js        # Plantilla editable de impresión + constructor del documento
    ├── plantilla-editor.js # Editor visual (arrastrar/soltar) del formato de impresión
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
- **Margen aceptadas:** utilidad estimada (neto tras descuento menos costo) sumada sobre las cotizaciones `aceptada`. Su detalle muestra por cada cotización: neto, costo, margen $ y margen %.

Todo se actualiza en vivo vía `onSnapshot` sobre la colección `cotizaciones`.

Cada tarjeta es **clicable**: abre un modal con la lista de cotizaciones que la componen (folio, cliente, fecha, estado y total). Desde ahí, el botón "Abrir" lleva la cotización a su editor. El detalle usa exactamente el mismo filtro que la tarjeta, así siempre coinciden.

## Formato de impresión editable

En Configuración → "Formato de impresión de cotizaciones" se ajusta la plantilla del documento (se guarda en `configuracion/plantillaCotizacion`):

- Título del documento, prefijo y dígitos del folio, color principal.
- Mostrar u ocultar: logo, observaciones, y las columnas Código, UM y Descuento %.
- Texto de vigencia con marcadores `{dias}` y `{fecha}`.
- Nota al pie y bloque de Condiciones / términos (texto libre).
- Botón "Vista previa" que imprime el formato con datos de ejemplo.

El constructor del documento vive en `plantilla.js` y lo usan tanto la impresión real (editor de cotizaciones) como la vista previa, así siempre coinciden. Si no hay plantilla guardada, se aplican valores por defecto.

### Editor visual (arrastrar y soltar)

Con "Usar editor visual" activo y el botón "Abrir editor visual", se abre un lienzo tamaño A4 donde cada elemento del documento es un bloque que se mueve y redimensiona libremente: Logo, Datos de la empresa, Título, Folio, Fecha, Ficha del cliente, Tabla de ítems, Totales, Observaciones, Condiciones, Vigencia y bloques de Texto libre (para "espacios de detalles"). Por bloque se ajusta fuente, tamaño, color, alineación y negrita/cursiva. El diseño se guarda en `configuracion/plantillaCotizacion` bajo `layout` con la bandera `usarLayout`. La impresión (`plantilla.js`) usa ese layout cuando `usarLayout` está activo; si no, usa el formato por opciones. Todo vive en `plantilla-editor.js`, que también aporta el renderizador del layout usado al imprimir.

## Cambios recientes

- **Editor visual de la plantilla**: lienzo A4 con bloques que se arrastran, redimensionan y estilizan (fuente, tamaño, color, alineación); incluye bloques de texto libre. Se guarda como `layout` y la impresión lo respeta.
- **Formato de impresión editable**: plantilla configurable para la cotización (título, folio, color, columnas, vigencia, nota al pie y condiciones) con vista previa.
- **Estado editable**: selector de estado inline en el listado de cotizaciones (junto al botón Abrir) y también en el detalle que abre cada KPI del Resumen; el cambio se guarda al instante en Firestore.
- Buscador de ítems del editor ensanchado (ocupa el espacio disponible).
- KPI **Margen aceptadas**: utilidad total de las cotizaciones aceptadas; su detalle desglosa neto, costo, margen $ y margen % por cotización.
- Módulo **Resumen** (antes "Dashboard"): renombrado y conectado a Firestore para actualizar sus indicadores en tiempo real. Tarjetas clicables que abren el detalle de cada indicador (columnas según la métrica) y permiten saltar a cada cotización.
- Columna **UM** (unidad de medida del catálogo) en el detalle del editor de cotizaciones.
- Botón **Imprimir / PDF** con formato de cotización membretado (empresa, cliente, folio `F-000001`, detalle con UM, resumen neto/IVA/total y vigencia).
- Folio mostrado en formato `F-000001` en lista, editor e impresión.

## Próximos pasos sugeridos

- Flujo de datos completo del sistema en PDF (documentación).
