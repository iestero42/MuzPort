# 🎵 MUZPORT

Una aplicación de escritorio retro-moderna para escanear tu biblioteca de música local y crear playlists de Spotify filtradas y curadas.

---

## 🚀 Descarga (Para Usuarios)

¡No necesitas instalar nada! Puedes descargar la última versión instalable (para Windows, macOS, o Linux) directamente desde la sección de **Releases** de este repositorio.

### [➡️ **Descarga la última versión desde GitHub Releases** ⬅️](https://github.com/iestero42/MUZPORT/releases/latest)

---

## ✨ Características Principales

MUZPORT es una herramienta de "curación" de música que te da control total sobre tu biblioteca local antes de subirla a la nube.

* **Escaner de Biblioteca:** Escanea miles de archivos de música (`.mp3`, `.flac`, `.m4a`) en segundos.
* **Lectura de Metadatos:** Lee los tags ID3 (Artista, Título, Género, Año) de cada archivo.
* **Filtrado Potente:** Filtra tu colección al instante por artista, género o año.
* **Curación Manual Completa:**
    * **▶️ Previsualizar:** Escucha cualquier canción directamente (usando el reproductor nativo de tu SO) para identificarla.
    * **✏️ Editar:** ¿La app se equivocó? Corrige el título y el artista en un modal antes de enviarlo a Spotify.
    * **❌ Eliminar:** Quita las canciones que no quieres en tu playlist.
* **Interfaz Optimizada:** La lista de canciones usa **virtualización** (`react-window`) para manejar miles de canciones de forma fluida y sin lag.
* **Estética Retro-Moderna:** Un tema Synthwave personalizado con barras de scroll de neón.
* **Integración Segura con Spotify:** Se conecta a tu cuenta usando el flujo OAuth 2.0.

---

## 🛠️ Stack Tecnológico

* **Framework de Escritorio:** **Electron**
* **Interfaz (UI):** **React** (con Hooks y TypeScript)
* **Lógica Principal (Backend Local):** **Node.js**
* **Comunicación (Puente):** **Electron IPC** (ipcMain / ipcRenderer)
* **API Externa:** **Spotify Web API** (con `spotify-web-api-node`)
* **Optimización de UI:** `react-window` para listas virtualizadas.
* **Estilos:** CSS puro (con variables)

---

## 👨‍💻 Para Desarrolladores (Ejecutar desde el Código Fuente)

Si quieres contribuir o ejecutar la app en modo de desarrollo:

### 1. Clona el Repositorio
```bash
git clone [https://github.com/TU_USUARIO/MUZPORT.git](https://github.com/TU_USUARIO/MUZPORT.git)
cd MUZPORT