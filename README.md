# 🐼 Tinify Watcher

Un script ligero en Node.js que vigila automáticamente una carpeta (por defecto, tus Descargas) y optimiza cualquier imagen nueva usando la [API de TinyPNG](https://tinypng.com/developers). Además de comprimir las imágenes para reducir drásticamente su peso, puede convertirlas automáticamente al formato **WebP**.

## ✨ Características

- 👁️ **Vigilancia en tiempo real**: Usa `chokidar` para detectar imágenes nuevas al instante.
- 🗜️ **Compresión inteligente**: Reduce el tamaño de los archivos visualmente sin pérdida gracias a TinyPNG.
- 🔄 **Conversión a WebP**: Por defecto, convierte las imágenes (PNG, JPG, JPEG) a formato WebP para una mayor optimización web.
- ⚡ **Sin dependencias pesadas**: Realiza las llamadas a la API de TinyPNG utilizando el módulo `https` nativo de Node.js.
- 🕒 **Debounce integrado**: Espera a que la imagen se descargue o copie por completo antes de procesarla.

## 🚀 Instalación

1. Clona este repositorio:
   ```bash
   git clone https://github.com/TU_USUARIO/tinify-watcher.git
   cd tinify-watcher
   ```
2. Instala las dependencias:
   ```bash
   npm install
   ```

## ⚙️ Configuración

Antes de ejecutar el script, necesitas una **API Key** gratuita de TinyPNG.
Consíguela en: [https://tinypng.com/developers](https://tinypng.com/developers)

### 1. Crear el archivo `.env`

En la raíz del proyecto, crea un archivo llamado `.env` y agrega tu API key:

```bash
TINYPNG_API_KEY=tu_api_key_aqui
```

> El script usa el flag nativo `--env-file` de Node.js (requiere **Node 20.6+**), por lo que las variables del `.env` se cargan automáticamente al ejecutar `npm start`. No necesitas instalar `dotenv`.

### 2. (Opcional) Ajustes adicionales

Si quieres personalizar carpetas u otras opciones, puedes editar el objeto `CONFIG` en `index.js`:

```javascript
const CONFIG = {
  API_KEY: process.env.TINYPNG_API_KEY || "TU_API_KEY_AQUI",
  WATCH_DIR: path.join(require("os").homedir(), "Downloads"), // Carpeta a vigilar
  OUTPUT_DIR: path.join(require("os").homedir(), "Downloads", "optimized"), // Donde se guardan
  CONVERT_TO_WEBP: true, // Cambia a false si prefieres mantener la extensión original
  DELETE_ORIGINAL: true // Elimina el archivo original tras comprimirlo
};
```

## 💻 Uso

Para arrancar el "watcher", simplemente ejecuta:

```bash
npm start
```

El script se quedará ejecutándose en la consola. A partir de ese momento, cualquier imagen (`.png`, `.jpg`, `.jpeg`, `.webp`) que caiga en tu carpeta de descargas será procesada automáticamente, y el resultado comprimido aparecerá en la subcarpeta `optimized`.

Para detenerlo, presiona `Ctrl + C` en tu terminal.
