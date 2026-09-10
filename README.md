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
- Navegación entre módulos (Dashboard, Clientes, Catálogo, Cotizaciones, Obras, Facturación).
- Módulo **Clientes** completo: crear, editar, buscar por nombre/RUT, marcar activo/inactivo (no se elimina, se preserva historial según la regla de negocio del documento base).
- Dashboard, Catálogo, Cotizaciones, Obras y Facturación quedan como vistas placeholder, listas para construirse en las siguientes fases.

## Próximas fases sugeridas

1. Catálogo de productos y servicios (con activar/desactivar).
2. Cotizaciones: selección de cliente + obra opcional, ítems, cálculo de descuento/IVA/margen, estados y folio.
3. Generación de PDF de la cotización.
4. Facturación asociada a cotización aceptada + control de pago.
5. Dashboard con indicadores reales (conversión, pendientes, facturado, por cobrar).
