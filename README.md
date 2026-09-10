# Cotizaciones · Electricidad y Obras Civiles

App web para gestionar clientes, catálogo, cotizaciones y facturación.
Fase 1: estructura base + módulo de **Clientes** funcional (CRUD en tiempo real con Firestore).

## 1. Crear el proyecto en Firebase

1. Ve a https://console.firebase.google.com y crea un proyecto nuevo.
2. En **Compilación → Authentication**, habilita el proveedor **Correo electrónico/Contraseña** y crea tu primer usuario (tú mismo) manualmente desde la pestaña "Users".
3. En **Compilación → Firestore Database**, crea la base de datos (modo producción).
4. En **Reglas** de Firestore, usa esto para partir (usuarios autenticados pueden leer/escribir todo; el documento de datos de la empresa además se puede leer sin sesión iniciada, para que el logo y el nombre se vean en la pantalla de login):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /configuracion/{docId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

5. En **Configuración del proyecto → General → Tus apps**, agrega una app web y copia el objeto `firebaseConfig`.

## 2. Configurar la app

Abre `js/firebase-config.js` y reemplaza los valores de `firebaseConfig` con los que copiaste de Firebase.

## 3. Probar en local

No necesitas servidor especial, pero los módulos de JavaScript (`type="module"`) requieren que el archivo se sirva por HTTP, no abrirlo directo con doble clic. La forma más simple:

```
cd app-cotizaciones
python3 -m http.server 8000
```

Luego abre `http://localhost:8000` en el navegador.

## 4. Publicar en GitHub Pages

1. Crea un repositorio en GitHub y sube todo el contenido de esta carpeta.
2. En el repositorio: **Settings → Pages → Source**, selecciona la rama `main` y carpeta `/root`.
3. GitHub te entrega una URL tipo `https://tu-usuario.github.io/tu-repo/`.

## Qué incluye esta fase

- Login con Firebase Authentication (correo/contraseña).
- Navegación entre módulos (Dashboard, Clientes, Catálogo, Cotizaciones, Obras, Facturación, Configuración), con menú deslizable en mobile.
- Módulo **Clientes** completo: crear, editar, buscar por nombre/RUT, marcar activo/inactivo.
- Módulo **Catálogo** completo: crear, editar, buscar por código/descripción, categoría, costo y precio neto, afecto a IVA, activo/inactivo.
- Módulo **Cotizaciones** completo: lista, editor con cliente, obra (registrada u opcional en texto libre), ítems del catálogo, descuento global, cálculo de neto/IVA/total/margen, folio correlativo automático, y estados.
- Módulo **Obras** completo: código, nombre, dirección, responsable, fecha de inicio, activa/cerrada. Se puede asociar a una cotización desde el editor.
- Módulo **Facturación**: lista de cotizaciones aceptadas. Botón para generar una **proforma** (documento interno con folio propio, para enviar al contador y solicitar la emisión de la factura o boleta real) que se abre lista para imprimir/guardar como PDF desde el navegador. Una vez que el contador emite el documento tributario, se registra aquí (tipo, folio, fecha, neto, IVA, total y estado de pago).
- Módulo **Configuración**:
  - Datos de la empresa (nombre, RUT, giro, teléfono, email, dirección) y logo, que aparece en la proforma impresa. El logo se guarda como imagen redimensionada dentro del mismo documento de Firestore (sin necesidad de configurar Firebase Storage aparte).
  - Importación masiva desde Excel para **Clientes** y **Catálogo**: sube un archivo .xlsx/.xls/.csv con encabezados razonablemente parecidos a los campos (el sistema reconoce variaciones comunes, ej. "Razón Social" o "Nombre", "RUT", "Costo" o "Costo Neto", etc.) y crea los registros en Firestore. Filas sin el dato mínimo requerido (razón social, o código+descripción) se omiten y se informa cuántas.
- Dashboard sigue como placeholder, a la espera de indicadores reales.

## La proforma no es un documento tributario

El botón "Generar proforma" crea un documento interno (con su propio folio correlativo) pensado para enviarlo al contador externo y que él emita la factura o boleta real en el SII. La proforma se abre para imprimir/guardar como PDF usando la función nativa del navegador (no requiere librerías adicionales). El documento incluye una nota aclarando que no es válido ante el SII.

## Simplificación actual de Cotizaciones (a revisar en fase futura)

- El IVA 19% se calcula sobre el neto total (después del descuento global), sin diferenciar ítems afectos/exentos individualmente.
- No hay todavía versionado de cotizaciones aceptadas (se puede editar en cualquier estado).
- No hay historial de auditoría por cambio de estado todavía.

## Próximas fases sugeridas

1. Dashboard con indicadores reales (conversión, pendientes, facturado, por cobrar) usando los datos de Cotizaciones y Facturación.
2. PDF con diseño propio para la cotización (no solo la proforma).
3. Historial de auditoría (quién y cuándo cambió cada estado).
4. Permisos por rol (administrador, vendedor, supervisor, consulta).
