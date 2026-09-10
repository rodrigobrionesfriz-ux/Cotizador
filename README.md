# Cotizaciones · Electricidad y Obras Civiles

App web para gestionar clientes, catálogo, cotizaciones y facturación.
Fase 1: estructura base + módulo de **Clientes** funcional (CRUD en tiempo real con Firestore).

## 1. Crear el proyecto en Firebase

1. Ve a https://console.firebase.google.com y crea un proyecto nuevo.
2. En **Compilación → Authentication**, habilita el proveedor **Correo electrónico/Contraseña** y crea tu primer usuario (tú mismo) manualmente desde la pestaña "Users".
3. En **Compilación → Firestore Database**, crea la base de datos (modo producción).
4. En **Reglas** de Firestore, usa esto para partir (solo usuarios autenticados pueden leer/escribir):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
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
- Navegación entre módulos (Dashboard, Clientes, Catálogo, Cotizaciones, Obras, Facturación), con menú deslizable en mobile.
- Módulo **Clientes** completo: crear, editar, buscar por nombre/RUT, marcar activo/inactivo (no se elimina, se preserva historial según la regla de negocio del documento base).
- Módulo **Catálogo** completo: crear, editar, buscar por código/descripción, categoría (material, equipo, mano de obra, servicio), costo y precio neto, afecto a IVA, y activo/inactivo (mismo criterio de no eliminar).
- Módulo **Cotizaciones** completo: lista con búsqueda por folio/cliente, editor con selección de cliente y referencia de obra opcional, ítems tomados del catálogo (cantidad, precio y descuento editables por línea), descuento global, cálculo automático de neto, IVA 19%, total, costo total y margen estimado, folio correlativo automático (asignado de forma atómica), y estados (borrador, enviada, en revisión, aceptada, no aceptada con motivo, vencida, anulada).
- Dashboard, Obras y Facturación quedan como vistas placeholder, listas para construirse en las siguientes fases.

## Simplificación actual de Cotizaciones (a revisar en fase futura)

- El IVA 19% se calcula sobre el neto total (después del descuento global), sin diferenciar ítems afectos/exentos individualmente. Si en la práctica manejas ítems exentos junto con afectos en la misma cotización, este cálculo se debe ajustar.
- No hay todavía versionado de cotizaciones aceptadas (la regla de negocio del documento base indica que una cotización aceptada no debería modificarse libremente); por ahora se puede editar en cualquier estado.
- No hay generación de PDF ni historial de auditoría por cambio de estado todavía.

## Próximas fases sugeridas

1. Generación de PDF de la cotización con el formato del documento base.
2. Facturación asociada a cotización aceptada + control de pago.
3. Dashboard con indicadores reales (conversión, pendientes, facturado, por cobrar).
4. Historial de auditoría (quién y cuándo cambió cada estado).
