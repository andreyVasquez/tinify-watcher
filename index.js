#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const https = require("https");
const chokidar = require("chokidar");

// ============================================================
// CONFIGURACIÓN
// ============================================================
const CONFIG = {
  // Tu API key de TinyPNG (https://tinypng.com/developers)
  API_KEY: process.env.TINYPNG_API_KEY || "TU_API_KEY_AQUI",

  // Carpeta a vigilar (ajusta según tu OS)
  WATCH_DIR:
    process.env.WATCH_DIR || path.join(require("os").homedir(), "Downloads"),

  // Carpeta de salida para los archivos optimizados
  OUTPUT_DIR:
    process.env.OUTPUT_DIR ||
    path.join(require("os").homedir(), "Downloads", "optimized"),

  // Extensiones que se procesan
  EXTENSIONS: [".png", ".jpg", ".jpeg", ".webp"],

  // Convertir siempre a WebP
  CONVERT_TO_WEBP: true,

  // Eliminar el archivo original después de optimizar
  DELETE_ORIGINAL: true,

  // Tiempo de espera (ms) antes de procesar (para asegurar que la descarga terminó)
  DEBOUNCE_MS: 1500,
};

// ============================================================
// UTILIDADES
// ============================================================
const LOG_PREFIX = {
  info: "\x1b[36m[INFO]\x1b[0m",
  ok: "\x1b[32m[OK]\x1b[0m",
  err: "\x1b[31m[ERROR]\x1b[0m",
  warn: "\x1b[33m[WARN]\x1b[0m",
};

function log(type, msg) {
  console.log(
    `${LOG_PREFIX[type]} ${new Date().toLocaleTimeString()} - ${msg}`,
  );
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log("info", `Carpeta creada: ${dir}`);
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// ============================================================
// TINYPNG API (sin dependencias extra, solo https nativo)
// ============================================================
function tinifyCompress(filePath) {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(filePath);
    const auth = Buffer.from(`api:${CONFIG.API_KEY}`).toString("base64");

    const options = {
      hostname: "api.tinify.com",
      path: "/shrink",
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/octet-stream",
        "Content-Length": fileBuffer.length,
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode === 201) {
          const data = JSON.parse(body);
          resolve({
            url: data.output.url,
            inputSize: data.input.size,
            outputSize: data.output.size,
            ratio: data.output.ratio,
          });
        } else {
          reject(new Error(`TinyPNG API error ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on("error", reject);
    req.write(fileBuffer);
    req.end();
  });
}

function tinifyDownload(resultUrl, outputPath, convertToWebp) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`api:${CONFIG.API_KEY}`).toString("base64");

    // Si queremos WebP, usamos el endpoint de conversión
    const postBody = convertToWebp
      ? JSON.stringify({ convert: { type: ["image/webp"] } })
      : null;

    const options = {
      hostname: "api.tinify.com",
      path: new URL(resultUrl).pathname,
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        ...(postBody
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(postBody),
            }
          : {}),
      },
    };

    // Si no convertimos, simplemente descargamos con GET
    if (!convertToWebp) {
      options.method = "GET";
      delete options.headers["Content-Type"];
      delete options.headers["Content-Length"];
    }

    const req = https.request(options, (res) => {
      if (
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        // Seguir redirect
        const file = fs.createWriteStream(outputPath);
        https.get(res.headers.location, (redirectRes) => {
          redirectRes.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve(outputPath);
          });
        });
        return;
      }

      if (res.statusCode === 200) {
        const file = fs.createWriteStream(outputPath);
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve(outputPath);
        });
      } else {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          reject(new Error(`Download error ${res.statusCode}: ${body}`)),
        );
      }
    });

    req.on("error", reject);
    if (postBody) req.write(postBody);
    req.end();
  });
}

// ============================================================
// PROCESAMIENTO
// ============================================================
const processingQueue = new Set();

async function processImage(filePath) {
  if (processingQueue.has(filePath)) return;
  processingQueue.add(filePath);

  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // Ignorar archivos en la carpeta de output
  if (filePath.startsWith(CONFIG.OUTPUT_DIR)) {
    processingQueue.delete(filePath);
    return;
  }

  // Verificar extensión
  if (!CONFIG.EXTENSIONS.includes(ext)) {
    processingQueue.delete(filePath);
    return;
  }

  log("info", `Procesando: ${fileName}`);

  try {
    // 1. Comprimir con TinyPNG
    const result = await tinifyCompress(filePath);
    const savings = ((1 - result.ratio) * 100).toFixed(1);
    log(
      "ok",
      `Comprimido: ${formatBytes(result.inputSize)} → ${formatBytes(result.outputSize)} (-${savings}%)`,
    );

    // 2. Descargar (y convertir a WebP si está configurado)
    const outputExt = CONFIG.CONVERT_TO_WEBP ? ".webp" : ext;
    const outputName = path.basename(filePath, ext) + outputExt;
    const outputPath = path.join(CONFIG.OUTPUT_DIR, outputName);

    await tinifyDownload(result.url, outputPath, CONFIG.CONVERT_TO_WEBP);
    const finalSize = fs.statSync(outputPath).size;

    log("ok", `Guardado: ${outputName} (${formatBytes(finalSize)})`);

    // 3. Eliminar original si está configurado
    if (CONFIG.DELETE_ORIGINAL) {
      fs.unlinkSync(filePath);
      log("info", `Original eliminado: ${fileName}`);
    }

    // Resumen visual
    const totalSavings = ((1 - finalSize / result.inputSize) * 100).toFixed(1);
    log(
      "ok",
      `✅ ${fileName} → ${outputName} | ${formatBytes(result.inputSize)} → ${formatBytes(finalSize)} (-${totalSavings}%)`,
    );
  } catch (err) {
    log("err", `Error procesando ${fileName}: ${err.message}`);
  } finally {
    processingQueue.delete(filePath);
  }
}

// ============================================================
// WATCHER
// ============================================================
function start() {
  if (CONFIG.API_KEY === "TU_API_KEY_AQUI") {
    log("err", "Configura tu API key de TinyPNG primero.");
    log("info", "Obtén una gratis en: https://tinypng.com/developers");
    log("info", "Luego: export TINYPNG_API_KEY=tu_key");
    process.exit(1);
  }

  ensureDir(CONFIG.OUTPUT_DIR);

  log("info", "🔍 Vigilando: " + CONFIG.WATCH_DIR);
  log("info", "📁 Output:    " + CONFIG.OUTPUT_DIR);
  log("info", `📐 Formatos:  ${CONFIG.EXTENSIONS.join(", ")}`);
  log("info", `🔄 WebP:      ${CONFIG.CONVERT_TO_WEBP ? "Sí" : "No"}`);
  log("info", "-------------------------------------------");
  log("info", "Esperando nuevas imágenes...\n");

  const debounceTimers = new Map();

  const watcher = chokidar.watch(CONFIG.WATCH_DIR, {
    ignored: [
      CONFIG.OUTPUT_DIR, // Ignorar carpeta de output
      /(^|[\/\\])\../, // Ignorar archivos ocultos
      /\.crdownload$/, // Ignorar descargas parciales de Chrome
      /\.part$/, // Ignorar descargas parciales de Firefox
      /\.tmp$/, // Ignorar temporales
    ],
    persistent: true,
    depth: 0, // Solo primer nivel (no subcarpetas)
    ignoreInitial: true, // No procesar archivos existentes
    awaitWriteFinish: {
      stabilityThreshold: CONFIG.DEBOUNCE_MS,
      pollInterval: 200,
    },
  });

  watcher.on("add", (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!CONFIG.EXTENSIONS.includes(ext)) return;

    // Debounce extra por si awaitWriteFinish no es suficiente
    if (debounceTimers.has(filePath)) {
      clearTimeout(debounceTimers.get(filePath));
    }

    debounceTimers.set(
      filePath,
      setTimeout(() => {
        debounceTimers.delete(filePath);
        processImage(filePath);
      }, 500),
    );
  });

  watcher.on("error", (err) => log("err", `Watcher error: ${err.message}`));

  // Graceful shutdown
  process.on("SIGINT", () => {
    log("info", "\nCerrando watcher...");
    watcher.close();
    process.exit(0);
  });
}

start();
