// Save this entire file as gallery.ts and run with:
// deno run --allow-net --allow-read --allow-env gallery.ts
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// --- Types ---
interface ImageItem {
  id: string;
  url: string; // Proxied full image URL
  originalUrl?: string; // Original full image URL from ChatGPT
  width: number;
  height: number;
  title: string;
  created_at: number;
  encodings: {
    thumbnail: {
      path: string; // Proxied thumbnail URL
      originalPath?: string; // Original thumbnail URL from ChatGPT
      blobUrl?: string; // Client-side: URL.createObjectURL() for fetched thumbnail
    };
  };
}

interface GalleryResponse {
  items: ImageItem[];
  cursor?: string;
}

// --- Zod Schemas ---
const TokenSchema = z
  .string()
  .min(10, "Token too short")
  .refine((val) => !val.includes(" "), {
    message: "Token should not contain spaces",
  });

// --- Deno Server Logic ---
if (Deno.args.includes("--serve") || import.meta.main) {
  console.log("Starting Deno HTTP server on http://localhost:8000");
  Deno.serve(httpHandler);
}

async function httpHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  console.log(`[SERVER] Received request: ${request.method} ${url.pathname}`);

  if (url.pathname === "/api/images") {
    return handleApiImages(request);
  }

  if (url.pathname === "/proxy/image") {
    return handleProxyImage(request);
  }

  if (url.pathname === "/" || url.pathname.endsWith(".html")) {
    console.log("[SERVER] Serving main HTML page.");
    return new Response(renderGalleryPageHTML(), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  console.log(`[SERVER] Path not found: ${url.pathname}`);
  return new Response("Not Found", { status: 404 });
}

async function handleApiImages(request: Request): Promise<Response> {
  const token = request.headers.get("x-api-token");
  const teamId = request.headers.get("x-team-id");
  const url = new URL(request.url);
  console.log(`[SERVER /api/images] Token: ${token ? "Present" : "Missing"}, TeamID: ${teamId || "N/A"}, After: ${url.searchParams.get("after")}`);


  const tokenResult = TokenSchema.safeParse(token);
  if (!tokenResult.success) {
    console.warn("[SERVER /api/images] Invalid token:", tokenResult.error.flatten());
    return Response.json(
      { error: "Invalid API token", details: tokenResult.error.errors },
      { status: 401 },
    );
  }

  const after = url.searchParams.get("after");
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);

  try {
    const images = await fetchImagesFromChatGPT(
      tokenResult.data,
      teamId || undefined,
      after || undefined,
      limit,
    );
    return Response.json(images);
  } catch (error) {
    console.error("[SERVER ERROR] /api/images:", error.message, error.stack);
    return Response.json(
      { error: error.message || "Failed to fetch images from source" },
      { status: 500 },
    );
  }
}

async function handleProxyImage(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const imageUrl = url.searchParams.get("url");
   console.log(`[SERVER /proxy/image] Proxying URL: ${imageUrl}`);

  if (!imageUrl) {
    console.warn("[SERVER /proxy/image] Missing image URL parameter.");
    return Response.json({ error: "Missing image URL" }, { status: 400 });
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.warn(`[SERVER /proxy/image] Failed to fetch from source (${imageUrl}): ${response.status} ${response.statusText}`);
      throw new Error(
        `Failed to fetch image from source: ${response.status} ${response.statusText}`,
      );
    }
    const contentType = response.headers.get("content-type") || "image/jpeg";
    console.log(`[SERVER /proxy/image] Successfully proxied ${imageUrl}, Content-Type: ${contentType}`);
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=86400",
        "access-control-allow-origin": "*",
      },
    });
  } catch (error) {
    console.error("[SERVER ERROR] /proxy/image:", imageUrl, error.message, error.stack);
    return Response.json(
      { error: "Failed to proxy image", details: error.message },
      { status: 502 },
    );
  }
}

async function fetchImagesFromChatGPT(
  apiToken: string,
  teamId?: string,
  after?: string,
  limit?: number,
): Promise<GalleryResponse> {
  const targetUrl = new URL("https://chatgpt.com/backend-api/my/recent/image_gen");
  targetUrl.searchParams.set("limit", String(limit && limit > 0 && limit <= 1000 ? limit : 50));
  if (after) targetUrl.searchParams.set("after", after);
  console.log(`[SERVER CHATGPT_FETCH] Fetching: ${targetUrl.toString()}, Team ID: ${teamId || "Personal"}`);
  const headers: HeadersInit = {
    "accept": "*/*", "authorization": "Bearer " + apiToken,
    "cache-control": "no-cache", "user-agent": "DenoGalleryApp/1.0",
  };
  if (teamId && teamId.trim() !== "") headers["chatgpt-account-id"] = teamId;

  const response = await fetch(targetUrl.toString(), { headers });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[SERVER CHATGPT_FETCH] API error (${response.status}):`, errorBody.slice(0, 500));
    if (response.status === 401) throw new Error("Invalid API token or unauthorized for the specified account.");
    if (response.status === 403) throw new Error("Access forbidden: Ensure API token has permissions for the account.");
    throw new Error(`ChatGPT API error: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  console.log(`[SERVER CHATGPT_FETCH] Retrieved ${data.items?.length || 0} metadata items. Cursor: ${data.cursor}`);
  const items: ImageItem[] = (data.items || []).map((item: any) => {
    const originalFullUrl = item.url;
    const originalThumbnailPath = item.encodings?.thumbnail?.path;
    return {
      id: item.id,
      url: `/proxy/image?url=${encodeURIComponent(originalFullUrl)}`,
      originalUrl: originalFullUrl, width: item.width, height: item.height,
      title: item.title, created_at: item.created_at,
      encodings: {
        thumbnail: {
          path: originalThumbnailPath ? `/proxy/image?url=${encodeURIComponent(originalThumbnailPath)}` : "",
          originalPath: originalThumbnailPath,
        },
      },
    };
  });
  return { items, cursor: data.cursor };
}

// --- HTML and Client-Side JavaScript ---
function renderGalleryPageHTML(): string {
  return `<!DOCTYPE html>
<html lang="en" class="">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChatGPT Image Gallery</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            primary: '#10a37f', primaryDark: '#0c8c6a', error: '#ef4444',
            gray: { 850: '#18212f', 900: '#111827' }
          }
        }
      }
    }
  </script>
  <style>
    .progress-bar-container { width: 100%; background-color: #e0e0e0; border-radius: 4px; margin-top: 0.5rem; height: 10px; }
    .dark .progress-bar-container { background-color: #4b5563; }
    .progress-bar { width: 0%; height: 100%; background-color: #10a37f; border-radius: 4px; transition: width 0.1s ease-out; }
    .theme-icon { display: inline-block; width: 1.5em; height: 1.5em; }
    .sun-icon { fill: currentColor; } .moon-icon { fill: currentColor; }
    .dark .sun-icon { display: none; } .moon-icon { display: none; }
    .dark .moon-icon { display: inline-block; }
    .gallery-image-container {
        width: 100%; aspect-ratio: 3 / 4; display: flex;
        align-items: center; justify-content: center;
        overflow: hidden; border-radius: 0.25rem;
    }
    .gallery-image-container.placeholder {
        background-color: #e5e7eb; /* Tailwind gray-200 */
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    .dark .gallery-image-container.placeholder { background-color: #374151; }
    .gallery-image-container img { width: 100%; height: 100%; object-fit: cover; }
  </style>
</head>
<body class="bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 transition-colors duration-300">
  <div class="max-w-6xl mx-auto px-4 py-6">
    <header class="flex justify-between items-center mb-8">
      <div>
        <h1 class="text-3xl font-bold text-center text-gray-900 dark:text-white">ChatGPT Image Gallery</h1>
        <p class="text-center text-gray-600 dark:text-gray-400">View all your generated images</p>
      </div>
      <button id="themeToggleBtn" title="Toggle theme" class="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary">
        <svg class="theme-icon sun-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 9a3 3 0 100 6 3 3 0 000-6zm0-2a5 5 0 110 10 5 5 0 010-10zm0-3.5a.5.5 0 01.5.5v2a.5.5 0 01-1 0v-2a.5.5 0 01.5-.5zm0 17a.5.5 0 01.5.5v2a.5.5 0 01-1 0v-2a.5.5 0 01.5-.5zM4.222 5.636a.5.5 0 01.707-.707l1.414 1.414a.5.5 0 01-.707.707L4.222 5.636zm14.142 14.142a.5.5 0 01.707-.707l1.414 1.414a.5.5 0 01-.707.707l-1.414-1.414zM19.778 5.636L18.364 4.222a.5.5 0 01.707-.707l1.414 1.414a.5.5 0 01-.707.707zM5.636 19.778L4.222 18.364a.5.5 0 01.707-.707l1.414 1.414a.5.5 0 01-.707.707zM2.5 12a.5.5 0 01.5-.5h2a.5.5 0 010 1h-2a.5.5 0 01-.5-.5zm17 0a.5.5 0 01.5-.5h2a.5.5 0 010 1h-2a.5.5 0 01-.5-.5z"/></svg>
        <svg class="theme-icon moon-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12.001.035a11.962 11.962 0 00-8.486 3.515A11.962 11.962 0 00.035 12a11.962 11.962 0 003.48 8.485A11.962 11.962 0 0012 23.965a11.962 11.962 0 008.485-3.48A11.962 11.962 0 0023.965 12a11.962 11.962 0 00-3.48-8.485A11.962 11.962 0 0012.001.035zm0 1.001a10.962 10.962 0 017.753 3.208 10.962 10.962 0 013.208 7.752 10.962 10.962 0 01-3.208 7.753 10.962 10.962 0 01-7.753 3.208 10.962 10.962 0 01-7.752-3.208A10.962 10.962 0 011.036 12a10.962 10.962 0 013.208-7.752A10.962 10.962 0 0112.001 1.036zM11.5 5.5A6.5 6.5 0 005 12a6.502 6.502 0 009.283 5.84A6.466 6.466 0 0112.5 12a6.466 6.466 0 011.84-4.283A6.502 6.502 0 0011.5 5.5z"/></svg>
      </button>
    </header>

    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
      <div id="errorMessage" class="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 p-4 rounded mb-4 hidden"></div>
      <div class="mb-4">
        <label for="tokenInput" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ChatGPT API Token:</label>
        <input type="password" id="tokenInput" placeholder="Enter your ChatGPT API token"
               class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" />
      </div>
      <div class="mb-4">
        <label for="teamIdInput" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Team ID (Optional):</label>
        <input type="text" id="teamIdInput" placeholder="Enter Team ID for team workspace"
               class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" />
      </div>
      <div class="mb-4 sm:flex sm:items-center sm:gap-4">
        <button id="saveSettings"
                class="w-full sm:w-auto bg-primary text-white px-6 py-3 rounded hover:bg-primaryDark transition-colors mb-3 sm:mb-0">
          Save Settings & Load Images
        </button>
        <button id="exportZipBtn"
                class="w-full sm:w-auto bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 transition-colors mb-3 sm:mb-0">
          Export All as ZIP
        </button>
        <div class="flex items-center gap-2">
          <label for="batchSizeInput" class="text-sm text-gray-700 dark:text-gray-300">API Batch size:</label>
          <input type="number" id="batchSizeInput" min="1" max="1000" step="1" value="50"
            class="w-24 p-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          <span class="text-xs text-gray-400 dark:text-gray-500">(1-1000, for API metadata)</span>
        </div>
      </div>
      <div class="mb-4">
        <label for="includeMetadataCheckbox" class="flex items-center text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" id="includeMetadataCheckbox" class="mr-2 h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700" checked>
          Include metadata.json in ZIP
        </label>
      </div>
      <div id="exportStatus" class="text-sm text-gray-600 dark:text-gray-400 mt-4 hidden">
        <p id="exportStatusText">Starting export...</p>
        <div class="progress-bar-container">
          <div id="exportProgressBar" class="progress-bar"></div>
        </div>
      </div>
      <div class="text-sm text-gray-600 dark:text-gray-400">
        <p class="mb-2">Provide your ChatGPT API token. For team workspaces, also provide the Team ID. Settings are stored locally.</p>
        <p class="font-semibold mb-1 text-gray-700 dark:text-gray-300">How to get API Token & Team ID:</p>
        <ol class="list-decimal pl-5 space-y-1 mb-3">
          <li>Login to <a href="https://chatgpt.com" target="_blank" class="text-primary hover:underline">ChatGPT</a>. Open DevTools (F12) > Network.</li>
          <li>Refresh/make a request. Find API calls (e.g., to \`.../conversation\`).</li>
          <li>Token: "Authorization" header (copy value after "Bearer ").</li>
          <li>Team ID: \`chatgpt-account-id\` header (if in team workspace).</li>
        </ol>
      </div>
    </div>

    <div id="galleryContainer">
      <div id="gallery" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"></div>
      <div id="loadingIndicator" class="text-center py-8">
        <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
        <p class="mt-2 text-gray-600 dark:text-gray-400">Loading images...</p>
      </div>
      <div id="summaryStats" class="text-center py-4 text-gray-600 dark:text-gray-400 hidden">
        <p><span id="totalImages">0</span> images loaded</p>
      </div>
    </div>
  </div>

  <div id="imageModal" class="fixed inset-0 bg-black bg-opacity-80 dark:bg-opacity-90 z-50 hidden flex justify-center items-center">
    <div class="relative max-w-[90%] max-h-[90%]">
      <button id="closeModal" title="Close modal" class="absolute -top-10 right-0 text-white text-3xl font-bold hover:text-gray-300">&times;</button>
      <img id="modalImage" class="max-w-full max-h-[90vh] object-contain rounded" src="" alt="">
      <div id="modalTitle" class="absolute -bottom-10 left-0 text-white text-base p-2 bg-black bg-opacity-50 rounded"></div>
      <a id="downloadImage" title="Download image" class="absolute -top-10 left-0 text-white hover:text-gray-300 transition-colors cursor-pointer p-2 rounded-md hover:bg-black hover:bg-opacity-30">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Download
      </a>
    </div>
  </div>
  <div id="notification" class="fixed top-5 right-5 bg-primary text-white p-4 rounded shadow-lg transform translate-x-full transition-transform duration-300 z-50">
    Settings saved successfully!
  </div>

  <script>
    console.log("Client-side script started.");

    // --- Client-Side JavaScript ---

    // Global variables & Constants
    let currentCursor = null;
    let isLoadingMetadataGlobal = false;
    let hasMoreImagesGlobal = true;
    let totalImagesLoadedGlobal = 0;
    const GALLERY_THUMBNAIL_CONCURRENCY = 6;
    const ZIP_FULL_IMAGE_CONCURRENCY = 4;

    // DOM Elements
    let themeToggleBtn, tokenInput, teamIdInput, saveSettingsBtn, exportZipBtn, includeMetadataCheckbox,
        exportStatusEl, exportStatusTextEl, exportProgressBarEl, errorMessage, galleryEl,
        loadingIndicator, summaryStats, totalImagesEl, modal, modalImage, modalTitle,
        closeModalBtn, notification, downloadBtn, batchSizeInput;

    function assignDomElements() {
        console.log("[DOM] Assigning DOM elements.");
        themeToggleBtn = document.getElementById('themeToggleBtn');
        tokenInput = document.getElementById('tokenInput');
        teamIdInput = document.getElementById('teamIdInput');
        saveSettingsBtn = document.getElementById('saveSettings');
        exportZipBtn = document.getElementById('exportZipBtn');
        includeMetadataCheckbox = document.getElementById('includeMetadataCheckbox');
        exportStatusEl = document.getElementById('exportStatus');
        exportStatusTextEl = document.getElementById('exportStatusText');
        exportProgressBarEl = document.getElementById('exportProgressBar');
        errorMessage = document.getElementById('errorMessage');
        galleryEl = document.getElementById('gallery');
        loadingIndicator = document.getElementById('loadingIndicator');
        summaryStats = document.getElementById('summaryStats');
        totalImagesEl = document.getElementById('totalImages');
        modal = document.getElementById('imageModal');
        modalImage = document.getElementById('modalImage');
        modalTitle = document.getElementById('modalTitle');
        closeModalBtn = document.getElementById('closeModal');
        notification = document.getElementById('notification');
        downloadBtn = document.getElementById('downloadImage');
        batchSizeInput = document.getElementById('batchSizeInput');
        console.log("[DOM] DOM elements assigned.");
    }

    // --- Utility Functions ---
    function parseJwt(token) {
      try {
        if (!token || typeof token !== 'string' || token.split('.').length < 2) {
            console.warn('[UTIL] Invalid token structure or type for parsing. Token:', token); return null;
        }
        const base64Url = token.split('.')[1];
        if (!base64Url) { console.warn('[UTIL] Missing payload in token.'); return null; }
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        return JSON.parse(jsonPayload);
      } catch (e) { console.error('[UTIL] Error parsing JWT:', e, "Token snippet:", token ? String(token).slice(0, 20) + "..." : "null"); return null; }
    }
    function validateToken(token) {
      let result = { success: false, error: 'Token validation failed unexpectedly.' };
      if (!token || typeof token !== 'string' || token.trim() === '') {
        result = { success: false, error: 'Token is required and must be a string.' };
        console.warn('[UTIL_VALIDATE_TOKEN]', result.error, "Received token:", token); return result;
      }
      if (token.trim().length < 10) {
        result = { success: false, error: 'Token is too short.' };
        console.warn('[UTIL_VALIDATE_TOKEN]', result.error); return result;
      }
      const actualToken = token.startsWith('Bearer ') ? token.substring(7).trim() : token.trim();
      if (actualToken.includes(' ')) {
        result = { success: false, error: 'Token (after Bearer) should not contain spaces.' };
        console.warn('[UTIL_VALIDATE_TOKEN]', result.error); return result;
      }
      if (actualToken.length === 0) {
        result = { success: false, error: 'Token content is missing after "Bearer " prefix.' };
        console.warn('[UTIL_VALIDATE_TOKEN]', result.error); return result;
      }
      try {
        const decoded = parseJwt(actualToken);
        if (decoded && decoded.exp) {
          const expirationTime = decoded.exp * 1000; const currentTime = Date.now();
          if (currentTime >= expirationTime) {
            result = { success: false, error: 'Token has expired. Please get a new one.' };
            console.warn('[UTIL_VALIDATE_TOKEN]', result.error); return result;
          }
        } else if (decoded === null && actualToken.length > 10) {
            console.warn('[UTIL_VALIDATE_TOKEN] Token could not be decoded as JWT. Assuming opaque token, proceeding.');
            result = { success: true, data: actualToken }; return result;
        } else if (decoded === null) {
            result = { success: false, error: 'Token is not a valid JWT structure.' };
            console.warn('[UTIL_VALIDATE_TOKEN]', result.error); return result;
        }
        result = { success: true, data: actualToken };
        console.log('[UTIL_VALIDATE_TOKEN] Token appears valid for client-side checks.'); return result;
      } catch (e) {
        console.error('[UTIL_VALIDATE_TOKEN] Unexpected error during token validation:', e);
        result = { success: false, error: 'Unexpected error during token validation.' }; return result;
      }
    }
    function formatDate(timestamp) {
      const date = new Date(timestamp * 1000);
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    function getApiBatchSize() {
      let size = parseInt(localStorage.getItem('chatgpt_batch_size') || '50', 10);
      return Math.max(1, Math.min(1000, isNaN(size) ? 50 : size));
    }
    function setApiBatchSize(size) {
      size = Math.max(1, Math.min(1000, parseInt(size, 10) || 50));
      localStorage.setItem('chatgpt_batch_size', size.toString());
      if(batchSizeInput) batchSizeInput.value = size.toString(); else console.error("batchSizeInput is null in setApiBatchSize");
    }
    function initApiBatchSizeInput() {
      if(batchSizeInput) {
        batchSizeInput.value = getApiBatchSize().toString();
        batchSizeInput.addEventListener('change', () => setApiBatchSize(batchSizeInput.value));
      } else {
        console.error("batchSizeInput is null in initApiBatchSizeInput");
      }
    }

    // --- Theme Management ---
    function applyTheme(theme) { document.documentElement.classList.toggle('dark', theme === 'dark'); }
    function toggleTheme() {
      const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
      localStorage.setItem('chatgpt_gallery_theme', newTheme); applyTheme(newTheme);
    }
    function loadTheme() {
      const savedTheme = localStorage.getItem('chatgpt_gallery_theme');
      if (savedTheme) {
        console.log(\`[THEME] Loading saved theme: \${savedTheme}\`); applyTheme(savedTheme);
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        console.log("[THEME] No saved theme, defaulting to system preferred: dark"); applyTheme('dark');
      } else {
        console.log("[THEME] No saved theme, defaulting to system preferred: light"); applyTheme('light');
      }
    }

    // --- UI Feedback ---
    function showError(message) { console.error('[UI ERROR]', message); if(errorMessage) {errorMessage.textContent = message; errorMessage.classList.remove('hidden');} else console.error("errorMessage element is null"); }
    function hideError() { if(errorMessage) errorMessage.classList.add('hidden'); }
    function showNotification(message = "Settings saved successfully!") {
      if(notification) {
        notification.textContent = message;
        notification.classList.remove('translate-x-full'); notification.classList.add('translate-x-0');
        setTimeout(() => { notification.classList.add('translate-x-full'); notification.classList.remove('translate-x-0'); }, 3000);
      } else console.error("notification element is null");
    }

    // --- Gallery Loading Logic ---
    async function fetchAndDisplayGalleryImages() {
      console.log('[GALLERY] Starting full image display process.');
      const apiToken = localStorage.getItem('chatgpt_api_token');
      if (!apiToken) {
        if(galleryEl) galleryEl.innerHTML = '<div class="col-span-full bg-white dark:bg-gray-800 rounded-lg shadow p-10 text-center text-gray-600 dark:text-gray-400">Enter your API token to view your images</div>';
        if(loadingIndicator) loadingIndicator.classList.add('hidden'); return;
      }
      if(galleryEl) galleryEl.innerHTML = ''; totalImagesLoadedGlobal = 0; currentCursor = null; hasMoreImagesGlobal = true;
      if(loadingIndicator) {
        loadingIndicator.classList.remove('hidden');
        loadingIndicator.querySelector('p').textContent = 'Loading images...';
      }
      if(summaryStats) summaryStats.classList.add('hidden');
      initApiBatchSizeInput();

      while (hasMoreImagesGlobal) {
        if (isLoadingMetadataGlobal) {
          console.log('[GALLERY] Metadata fetch already in progress. Waiting...');
          await new Promise(resolve => setTimeout(resolve, 300)); continue;
        }
        isLoadingMetadataGlobal = true;
        console.log('[GALLERY] Fetching next metadata batch. Cursor:', currentCursor);
        const metadataBatch = await fetchSingleMetadataBatch(apiToken, currentCursor);
        if (metadataBatch) {
          currentCursor = metadataBatch.cursor || null;
          hasMoreImagesGlobal = !!currentCursor;
          if (metadataBatch.items && metadataBatch.items.length > 0) {
            console.log(\`[GALLERY] Fetched \${metadataBatch.items.length} metadata items. Rendering skeletons and fetching thumbnails...\`);
            renderSkeletons(metadataBatch.items);
            const itemsWithThumbnails = await fetchThumbnailsForItems(metadataBatch.items);
            updateSkeletonsWithImages(itemsWithThumbnails);
            totalImagesLoadedGlobal += itemsWithThumbnails.length;
          } else if (!currentCursor) { hasMoreImagesGlobal = false; console.log('[GALLERY] No items and no next cursor.'); }
          else { console.log('[GALLERY] No items in this batch, but there is a next cursor.'); }
        } else { hasMoreImagesGlobal = false; console.log('[GALLERY] fetchSingleMetadataBatch returned null (error).'); }
        isLoadingMetadataGlobal = false;
        if(totalImagesEl) totalImagesEl.textContent = totalImagesLoadedGlobal.toString();
      }
      if(loadingIndicator) loadingIndicator.classList.add('hidden');
      if (totalImagesLoadedGlobal > 0) {
        if(summaryStats) summaryStats.classList.remove('hidden'); console.log(\`[GALLERY] All images loaded. Total: \${totalImagesLoadedGlobal}\`);
      } else {
        if(galleryEl) galleryEl.innerHTML = '<div class="col-span-full bg-white dark:bg-gray-800 rounded-lg shadow p-10 text-center text-gray-600 dark:text-gray-400">No images found.</div>';
        console.log('[GALLERY] No images found after loading.');
      }
    }

    async function fetchSingleMetadataBatch(apiToken, cursor) {
      const teamId = localStorage.getItem('chatgpt_team_id');
      try {
        const metadataApiBatchSize = getApiBatchSize();
        const url = new URL('/api/images', window.location.origin);
        if (cursor) url.searchParams.set('after', cursor);
        url.searchParams.set('limit', metadataApiBatchSize.toString());
        const headers = { 'x-api-token': apiToken };
        if (teamId && teamId.trim() !== "") headers['x-team-id'] = teamId;
        console.log('[METADATA_FETCH] Requesting:', url.toString());
        const response = await fetch(url.toString(), { headers });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown API error during metadata fetch' }));
          throw new Error(errorData.error || \`API Error (Metadata): \${response.status}\`);
        }
        const metadataResult = await response.json();
        console.log(\`[METADATA_FETCH] Received: \${metadataResult.items?.length || 0} items, Cursor: \${metadataResult.cursor}\`);
        return metadataResult;
      } catch (error) {
        console.error('[METADATA_FETCH] Error:', error);
        showError(error.message || 'Error loading image metadata.'); return null;
      }
    }

    async function fetchThumbnailsForItems(items) {
      console.log(\`[THUMBNAILS] Processing \${items.length} items for thumbnails.\`);
      const itemsToProcess = items.filter(item => item.encodings.thumbnail.path);
      if(itemsToProcess.length === 0 && items.length > 0) {
        console.log("[THUMBNAILS] No items with valid thumbnail paths in this batch."); return items;
      }
      const itemMap = new Map(items.map(item => [item.id, item]));
      for (let i = 0; i < itemsToProcess.length; i += GALLERY_THUMBNAIL_CONCURRENCY) {
        const chunk = itemsToProcess.slice(i, i + GALLERY_THUMBNAIL_CONCURRENCY);
        console.log(\`[THUMBNAILS] Fetching thumbnail chunk: \${i + 1} to \${i + chunk.length}\`);
        const thumbnailPromises = chunk.map(async (item) => {
          try {
            const response = await fetch(item.encodings.thumbnail.path);
            if (!response.ok) {
              console.warn(\`[THUMBNAILS] Failed fetch for \${item.id} (\${item.title?.slice(0,20)}): \${response.status}\`);
              return { id: item.id, blobUrl: null, success: false };
            }
            const blob = await response.blob();
            return { id: item.id, blobUrl: URL.createObjectURL(blob), success: true };
          } catch (e) {
            console.warn(\`[THUMBNAILS] Error fetching for \${item.id} (\${item.title?.slice(0,20)}):\`, e);
            return { id: item.id, blobUrl: null, success: false };
          }
        });
        const settledResults = await Promise.allSettled(thumbnailPromises);
        settledResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value.success) {
            const originalItem = itemMap.get(result.value.id);
            if (originalItem) originalItem.encodings.thumbnail.blobUrl = result.value.blobUrl;
          } else if (result.status === 'fulfilled' && !result.value.success) {
             console.log(\`[THUMBNAILS] Fulfilled but failed for ID: \${result.value.id}\`);
          } else if (result.status === 'rejected') {
             console.error('[THUMBNAILS] Promise rejected:', result.reason);
          }
        });
      }
      return Array.from(itemMap.values());
    }

    function renderSkeletons(items) {
        if(!galleryEl) { console.error("[SKELETON] galleryEl is null!"); return; }
        console.log(\`[SKELETON] Rendering \${items.length} skeletons.\`);
        items.forEach(image => {
            const itemEl = document.createElement('div');
            itemEl.className = 'bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-md';
            itemEl.id = \`gallery-item-\${image.id}\`;

            const imgContainer = document.createElement('div');
            imgContainer.className = 'gallery-image-container placeholder cursor-pointer';

            const info = document.createElement('div');
            info.className = 'p-4';
            const titleEl = document.createElement('h3');
            titleEl.className = 'font-medium text-gray-800 dark:text-gray-200 mb-1 truncate h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse';
            titleEl.textContent = '\u00A0';
            const dateEl = document.createElement('p');
            dateEl.className = 'text-sm text-gray-500 dark:text-gray-400 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-1';
            dateEl.textContent = '\u00A0';

            info.appendChild(titleEl); info.appendChild(dateEl);
            itemEl.appendChild(imgContainer); itemEl.appendChild(info);
            galleryEl.appendChild(itemEl);
        });
    }

    function updateSkeletonsWithImages(images) {
        console.log(\`[UPDATE_SKELETON] Updating \${images.length} items with actual images.\`);
        images.forEach(image => {
            const itemEl = document.getElementById(\`gallery-item-\${image.id}\`);
            if (!itemEl) {
                console.warn(\`[UPDATE_SKELETON] Could not find skeleton for item ID: \${image.id}\`);
                return;
            }
            const imgContainer = itemEl.querySelector('.gallery-image-container');
            const titleEl = itemEl.querySelector('h3');
            const dateEl = itemEl.querySelector('p');

            if (titleEl) {
                titleEl.textContent = image.title || 'Untitled image';
                titleEl.classList.remove('h-6', 'bg-gray-200', 'dark:bg-gray-700', 'animate-pulse');
            }
            if (dateEl) {
                dateEl.textContent = formatDate(image.created_at);
                dateEl.classList.remove('h-4', 'bg-gray-200', 'dark:bg-gray-700', 'animate-pulse', 'mt-1');
            }

            if (imgContainer) {
                imgContainer.innerHTML = '';
                imgContainer.classList.remove('placeholder');

                const img = document.createElement('img');
                img.alt = image.title || 'Untitled image';
                img.dataset.fullImage = image.url;
                img.dataset.title = image.title || 'Untitled image';
                img.loading = 'lazy';

                let imgSrcSet = false;
                if (image.encodings.thumbnail.blobUrl) {
                    img.src = image.encodings.thumbnail.blobUrl;
                    imgSrcSet = true;
                } else if (image.encodings.thumbnail.path) {
                    img.src = image.encodings.thumbnail.path;
                    imgSrcSet = true;
                }

                if (imgSrcSet) {
                    img.onload = () => { /* Image loaded successfully */ };
                    img.onerror = () => {
                      console.warn(\`[UPDATE_SKELETON] Error loading image: \${img.src.slice(0,100)} for \${image.title || image.id}\`);
                      if (img.src !== image.url && image.url) {
                        img.src = image.url; // Try full image
                      } else {
                        imgContainer.innerHTML = ''; // Clear broken img
                        imgContainer.classList.add('placeholder'); // Re-add placeholder style
                      }
                    };
                    imgContainer.appendChild(img);
                } else {
                    imgContainer.classList.add('placeholder');
                }
                imgContainer.addEventListener('click', () => openModal(image.url, image.title || 'Untitled image'));
            }
        });
    }

    // --- Modal Logic ---
    function openModal(imageSrc, imageTitle) {
      if(modalImage) { modalImage.src = imageSrc; modalImage.alt = imageTitle; }
      if(modalTitle) modalTitle.textContent = imageTitle;
      if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    }
    function closeModal() {
      if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
      if(modalImage) modalImage.src = "";
    }

    // --- ZIP Export Logic ---
    function formatDateForFilename(timestamp) {
      const date = new Date(timestamp * 1000);
      const Y = date.getFullYear(); const M = (date.getMonth() + 1).toString().padStart(2, '0');
      const D = date.getDate().toString().padStart(2, '0'); const h = date.getHours().toString().padStart(2, '0');
      const m = date.getMinutes().toString().padStart(2, '0'); const s = date.getSeconds().toString().padStart(2, '0');
      return \`\${Y}\${M}\${D}_\${h}\${m}\${s}\`;
    }
    function sanitizeFilename(name, maxLength = 100) {
      let s = (name || 'image').replace(/[<>:"/\\\\|?*\\s]+/g, '_').replace(/[\\x00-\\x1f\\x7f]/g, '');
      return s.length > maxLength ? s.substring(0, maxLength) : s;
    }
    function getExtensionFromContentType(contentType) {
      if (!contentType) return 'jpg';
      if (contentType.includes('jpeg')) return 'jpg'; if (contentType.includes('png')) return 'png';
      if (contentType.includes('gif')) return 'gif'; if (contentType.includes('webp')) return 'webp';
      const parts = contentType.split('/'); return parts.length > 1 ? parts[1].split(';')[0].trim() : 'jpg';
    }
    async function handleExportAllAsZip() {
      const apiToken = localStorage.getItem('chatgpt_api_token');
      if (!apiToken) { showError('API Token is required for export.'); return; }
      if (!window.JSZip) { showError('JSZip library not loaded.'); return; }
      if(!exportZipBtn || !exportStatusEl || !exportStatusTextEl || !exportProgressBarEl) {
        console.error("[ZIP] Export UI elements not found!"); return;
      }
      exportZipBtn.disabled = true; exportStatusEl.classList.remove('hidden');
      exportStatusTextEl.textContent = 'Starting export: Fetching all image metadata...';
      exportProgressBarEl.style.width = '0%';
      const allImageMetadata = []; let tempCursor = null; let moreMetaToFetch = true;
      let metaBatchesFetched = 0; const metadataCollectionApiBatchSize = Math.max(getApiBatchSize(), 100);
      let baseZipProgress = 0;
      try {
        console.log('[ZIP] Starting metadata collection.');
        while (moreMetaToFetch) {
          metaBatchesFetched++;
          exportStatusTextEl.textContent = \`Fetching image metadata (Batch \${metaBatchesFetched})...\`;
          const teamId = localStorage.getItem('chatgpt_team_id');
          const url = new URL('/api/images', window.location.origin);
          if (tempCursor) url.searchParams.set('after', tempCursor);
          url.searchParams.set('limit', metadataCollectionApiBatchSize.toString());
          const headers = { 'x-api-token': apiToken };
          if (teamId && teamId.trim() !== "") headers['x-team-id'] = teamId;
          const response = await fetch(url.toString(), { headers });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({error: \`Metadata fetch HTTP error: \${response.status}\`}));
            throw new Error(errorData.error || \`Metadata fetch error: \${response.status}\`);
          }
          const data = await response.json();
          if (data.items && data.items.length > 0) {
            allImageMetadata.push(...data.items);
            console.log(\`[ZIP] Fetched \${data.items.length} metadata items. Total now: \${allImageMetadata.length}\`);
          }
          tempCursor = data.cursor; moreMetaToFetch = !!tempCursor;
          baseZipProgress = Math.min(10, metaBatchesFetched);
          exportProgressBarEl.style.width = \`\${baseZipProgress * 10}%\`;
        }
        console.log(\`[ZIP] Metadata collection complete. Total items: \${allImageMetadata.length}\`);
        if (allImageMetadata.length === 0) {
          exportStatusTextEl.textContent = 'No images found to export.';
          exportProgressBarEl.style.width = '100%';
          setTimeout(() => exportStatusEl.classList.add('hidden'), 3000); exportZipBtn.disabled = false; return;
        }
        exportStatusTextEl.textContent = \`Found \${allImageMetadata.length} images. Preparing to ZIP...\`;
        const zip = new JSZip();
        if (includeMetadataCheckbox && includeMetadataCheckbox.checked) {
          exportStatusTextEl.textContent = 'Adding metadata.json...';
          const metadataToExport = allImageMetadata.map(item => ({
            id: item.id, title: item.title, created_at: item.created_at, width: item.width, height: item.height,
            original_url: item.originalUrl, original_thumbnail_url: item.encodings.thumbnail.originalPath
          }));
          zip.file("metadata.json", JSON.stringify(metadataToExport, null, 2));
          baseZipProgress = 15; exportProgressBarEl.style.width = \`\${baseZipProgress}%\`; console.log('[ZIP] Added metadata.json.');
        } else { baseZipProgress = 10; exportProgressBarEl.style.width = \`\${baseZipProgress}%\`; }

        let imagesProcessedForZip = 0; let successfulImageDownloads = 0;
        console.log(\`[ZIP] Starting image blob download with concurrency: \${ZIP_FULL_IMAGE_CONCURRENCY}\`);
        for (let i = 0; i < allImageMetadata.length; i += ZIP_FULL_IMAGE_CONCURRENCY) {
          const chunk = allImageMetadata.slice(i, i + ZIP_FULL_IMAGE_CONCURRENCY);
          exportStatusTextEl.textContent = \`Downloading images \${i + 1}-\${Math.min(i + ZIP_FULL_IMAGE_CONCURRENCY, allImageMetadata.length)} of \${allImageMetadata.length}...\`;
          console.log(\`[ZIP] Processing chunk: \${i + 1} to \${i + chunk.length}\`);
          const imageFetchPromises = chunk.map(async (imageItem) => {
            try {
              const imageResponse = await fetch(imageItem.url);
              if (!imageResponse.ok) {
                console.warn(\`[ZIP] Failed to fetch blob for \${imageItem.id} (\${imageItem.title?.slice(0,20)}): \${imageResponse.status}\`);
                return { success: false, item: imageItem, errorStatus: imageResponse.status };
              }
              const blob = await imageResponse.blob();
              const contentType = imageResponse.headers.get('content-type');
              const extension = getExtensionFromContentType(contentType);
              const datePrefix = formatDateForFilename(imageItem.created_at);
              const titlePart = sanitizeFilename(imageItem.title);
              const filename = \`images/\${datePrefix}_\${titlePart}.\${extension}\`;
              return { success: true, filename, blob, item: imageItem };
            } catch (e) {
              console.error(\`[ZIP] Error fetching blob for \${imageItem.id} (\${imageItem.title?.slice(0,20)}):\`, e);
              if (e.name === 'RangeError' || e.message.toLowerCase().includes('allocation failed')) {
                 console.error("[ZIP] Potential memory allocation error during fetch for item:", imageItem.id);
              }
              return { success: false, item: imageItem, error: e };
            }
          });
          const chunkResults = await Promise.allSettled(imageFetchPromises);
          for (const result of chunkResults) {
            imagesProcessedForZip++;
            const overallProgress = baseZipProgress + ((imagesProcessedForZip / allImageMetadata.length) * (100 - baseZipProgress));
            exportProgressBarEl.style.width = \`\${Math.round(overallProgress)}%\`;
            if (result.status === 'fulfilled' && result.value.success) {
              zip.file(result.value.filename, result.value.blob); successfulImageDownloads++;
            } else {
              const title = result.status === 'fulfilled' ? result.value.item.title : (result.reason?.item?.title || "Unknown");
              const reason = result.status === 'rejected' ? result.reason : (result.value.errorStatus || result.value.error);
              console.warn(\`[ZIP] Skipped zipping: \${title}. Reason:\`, reason);
            }
          }
          console.log(\`[ZIP] Chunk processed. Total processed for zip: \${imagesProcessedForZip}\`);
          exportStatusTextEl.textContent = \`Processed \${imagesProcessedForZip} of \${allImageMetadata.length} images for zipping...\`;
        }
        if (successfulImageDownloads === 0 && allImageMetadata.length > 0) {
            throw new Error("No images could be successfully downloaded for the ZIP. Check console for errors.");
        }
        exportStatusTextEl.textContent = 'Generating ZIP file... This may take a while for many images.';
        console.log('[ZIP] Generating ZIP file...'); exportProgressBarEl.style.width = '100%';
        const zipContent = await zip.generateAsync({ type: "blob" });
        console.log('[ZIP] ZIP generation complete.');
        const link = document.createElement('a'); link.href = URL.createObjectURL(zipContent);
        const workspaceName = localStorage.getItem('chatgpt_team_id') ? 'team' : 'personal';
        link.download = \`chatgpt_images_\${workspaceName}_\${formatDateForFilename(Date.now()/1000)}.zip\`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        exportStatusTextEl.textContent = 'Export complete! ZIP file downloaded.'; console.log('[ZIP] Export complete.');
      } catch (error) {
        console.error('[ZIP] Error during ZIP export:', error);
        let userMessage = \`Export failed: \${error.message}\`;
        if (error.message && error.message.toLowerCase().includes('allocation failed')) {
            userMessage += " This often means the browser ran out of memory. Try reducing the 'API Batch size' (which also affects ZIP image downloads) or export fewer images if possible.";
        }
        showError(userMessage); exportStatusTextEl.textContent = userMessage;
      } finally {
        if(exportZipBtn) exportZipBtn.disabled = false;
        setTimeout(() => {
          if(exportStatusEl) exportStatusEl.classList.add('hidden');
          if(exportProgressBarEl) exportProgressBarEl.style.width = '0%';
        }, 10000);
      }
    }

    // --- Initialization and Event Listeners ---
    function init() {
      console.log("[INIT] DOMContentLoaded or script directly executed.");
      assignDomElements();
      loadTheme();
      console.log('[INIT] Initializing app...');
      const storedToken = localStorage.getItem('chatgpt_api_token');
      const storedTeamId = localStorage.getItem('chatgpt_team_id');
      const storedIncludeMeta = localStorage.getItem('chatgpt_include_metadata');

      if (storedToken) {
        console.log('[INIT] Found stored token.');
        if(tokenInput) tokenInput.value = storedToken;
        if(teamIdInput && storedTeamId) teamIdInput.value = storedTeamId;
        if(includeMetadataCheckbox && storedIncludeMeta !== null) includeMetadataCheckbox.checked = storedIncludeMeta === 'true';
        
        const validation = validateToken(storedToken);
        console.log('[INIT] Token validation result:', validation);
        if (!validation) {
            console.error("[INIT] CRITICAL: validateToken returned undefined or null!");
            showError("Internal error: Token validation failed to produce a result.");
            if(loadingIndicator) loadingIndicator.classList.add('hidden'); return;
        }
        if (!validation.success && validation.error && validation.error.includes("expired")) {
            showError(validation.error);
            if(loadingIndicator) loadingIndicator.classList.add('hidden');
            console.log('[INIT] Token expired.');
        } else if (validation.success) {
            console.log('[INIT] Token valid. Starting image fetch.');
            fetchAndDisplayGalleryImages();
        } else {
            showError(validation.error || "Invalid stored token.");
            if(loadingIndicator) loadingIndicator.classList.add('hidden');
            console.log('[INIT] Invalid token based on client-side checks:', validation.error);
        }
      } else {
        console.log('[INIT] No token found.');
        if(galleryEl) galleryEl.innerHTML = '<div class="col-span-full bg-white dark:bg-gray-800 rounded-lg shadow p-10 text-center text-gray-600 dark:text-gray-400">Enter API token to view images.</div>';
        if(loadingIndicator) loadingIndicator.classList.add('hidden');
      }
      initApiBatchSizeInput();

      if(themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme); else console.error("[INIT] themeToggleBtn not found");
      if(saveSettingsBtn) saveSettingsBtn.addEventListener('click', () => {
        console.log('[EVENT] Save Settings clicked.'); hideError();
        const rawToken = tokenInput.value.trim(); const newTeamId = teamIdInput.value.trim();
        const validationResult = validateToken(rawToken);
        console.log('[EVENT] Save Settings - Token validation result:', validationResult);
        if (!validationResult.success) { showError(validationResult.error); return; }
        localStorage.setItem('chatgpt_api_token', validationResult.data);
        if (newTeamId) localStorage.setItem('chatgpt_team_id', newTeamId); else localStorage.removeItem('chatgpt_team_id');
        if(includeMetadataCheckbox) localStorage.setItem('chatgpt_include_metadata', includeMetadataCheckbox.checked.toString());
        showNotification("Settings saved. Reloading images..."); fetchAndDisplayGalleryImages();
      }); else console.error("[INIT] saveSettingsBtn not found");

      if(exportZipBtn) exportZipBtn.addEventListener('click', handleExportAllAsZip); else console.error("[INIT] exportZipBtn not found");
      if(includeMetadataCheckbox) includeMetadataCheckbox.addEventListener('change', () => { localStorage.setItem('chatgpt_include_metadata', includeMetadataCheckbox.checked.toString()); }); else console.error("[INIT] includeMetadataCheckbox not found");
      
      if(downloadBtn) downloadBtn.addEventListener('click', () => {
        const imageSrc = modalImage.src; const imageTitle = modalTitle.textContent || 'image';
        const tempLink = document.createElement('a'); tempLink.href = imageSrc;
        let extension = 'jpg'; try { const urlParts = new URL(imageSrc); const pathParts = urlParts.pathname.split('.'); if (pathParts.length > 1) extension = pathParts.pop(); } catch(e) {}
        tempLink.download = sanitizeFilename(imageTitle) + '.' + extension;
        document.body.appendChild(tempLink); tempLink.click(); document.body.removeChild(tempLink);
      }); else console.error("[INIT] downloadBtn not found");

      if(closeModalBtn) closeModalBtn.addEventListener('click', closeModal); else console.error("[INIT] closeModalBtn not found");
      if(modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); }); else console.error("[INIT] modal not found");
      
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) closeModal(); });
      
      if(tokenInput) tokenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && saveSettingsBtn) saveSettingsBtn.click(); }); else console.error("[INIT] tokenInput not found");
      if(teamIdInput) teamIdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && saveSettingsBtn) saveSettingsBtn.click(); }); else console.error("[INIT] teamIdInput not found");
      
      console.log('[INIT] Initialization complete.');
    }

    // Start the app
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        console.log("DOMContentLoaded event fired.");
        init();
      });
    } else {
      console.log("Document already loaded, running init directly.");
      init();
    }
  </script>
</body>
</html>`;
}