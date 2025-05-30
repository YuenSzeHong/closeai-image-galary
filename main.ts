// Deno Gallery Application with proxied requests for global access
// Save this entire file as e.g., gallery.html and run with:
// deno run --allow-net --allow-read --allow-env gallery.html
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
if (Deno.args.includes("--serve")) { // Simple way to only run server part if desired
  console.log("Starting Deno HTTP server on http://localhost:8000");
  Deno.serve(httpHandler);
} else if (import.meta.main) { // Default: serve if run directly
  console.log("Starting Deno HTTP server on http://localhost:8000");
  Deno.serve(httpHandler);
}


async function httpHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/images") {
    return handleApiImages(request);
  }

  if (url.pathname === "/proxy/image") {
    return handleProxyImage(request);
  }

  // Serve the main HTML page for all other routes
  if (url.pathname === "/" || url.pathname.endsWith(".html")) {
    return new Response(renderGalleryPage(), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return new Response("Not Found", { status: 404 });
}

async function handleApiImages(request: Request): Promise<Response> {
  const token = request.headers.get("x-api-token");
  const teamId = request.headers.get("x-team-id");
  const url = new URL(request.url);

  const tokenResult = TokenSchema.safeParse(token);
  if (!tokenResult.success) {
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
    console.error("Error in /api/images:", error);
    return Response.json(
      { error: error.message || "Failed to fetch images from source" },
      { status: 500 },
    );
  }
}

async function handleProxyImage(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const imageUrl = url.searchParams.get("url");

  if (!imageUrl) {
    return Response.json({ error: "Missing image URL" }, { status: 400 });
  }

  try {
    const response = await fetch(imageUrl); // Fetch the original image URL
    if (!response.ok) {
      throw new Error(
        `Failed to fetch image from source: ${response.status} ${response.statusText}`,
      );
    }
    const contentType = response.headers.get("content-type") || "image/jpeg";
    // Return the image data directly
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=86400", // Cache for 1 day
        "access-control-allow-origin": "*", // Allow CORS for the proxy
      },
    });
  } catch (error) {
    console.error("Error proxying image:", imageUrl, error);
    return Response.json(
      { error: "Failed to proxy image", details: error.message },
      { status: 502 }, // Bad Gateway
    );
  }
}

async function fetchImagesFromChatGPT(
  apiToken: string,
  teamId?: string,
  after?: string,
  limit?: number,
): Promise<GalleryResponse> {
  const targetUrl = new URL(
    "https://chatgpt.com/backend-api/my/recent/image_gen",
  );
  targetUrl.searchParams.set(
    "limit",
    String(limit && limit > 0 && limit <= 1000 ? limit : 50),
  );
  if (after) targetUrl.searchParams.set("after", after);

  console.log(
    `Fetching from ChatGPT API: ${targetUrl.toString()}, Team ID: ${
      teamId || "Personal"
    }`,
  );

  const headers: HeadersInit = {
    "accept": "*/*",
    "authorization": "Bearer " + apiToken,
    "cache-control": "no-cache",
    "user-agent": "DenoGalleryApp/1.0 (Deno; like ChatGPT Interface User)",
  };
  if (teamId && teamId.trim() !== "") {
    headers["chatgpt-account-id"] = teamId;
  }

  const response = await fetch(targetUrl.toString(), { headers });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(
      `ChatGPT API error (${response.status}):`,
      errorBody.slice(0, 500),
    ); // Log snippet of error
    if (response.status === 401) {
      throw new Error(
        "Invalid API token or unauthorized for the specified account.",
      );
    }
    if (response.status === 403) {
      throw new Error(
        "Access forbidden: Ensure API token has permissions for the account.",
      );
    }
    throw new Error(
      `ChatGPT API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  console.log(
    `Retrieved ${data.items?.length || 0} image metadata items from ChatGPT.`,
  );

  const items: ImageItem[] = (data.items || []).map((item: any) => {
    const originalFullUrl = item.url;
    const originalThumbnailPath = item.encodings?.thumbnail?.path;
    return {
      id: item.id,
      url: `/proxy/image?url=${encodeURIComponent(originalFullUrl)}`,
      originalUrl: originalFullUrl,
      width: item.width,
      height: item.height,
      title: item.title,
      created_at: item.created_at,
      encodings: {
        thumbnail: {
          path: originalThumbnailPath
            ? `/proxy/image?url=${encodeURIComponent(originalThumbnailPath)}`
            : "",
          originalPath: originalThumbnailPath,
          // blobUrl is client-side only
        },
      },
    };
  });

  return {
    items,
    cursor: data.cursor,
  };
}

// --- HTML and Client-Side JavaScript ---
function renderGalleryPage(): string {
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
    .gallery-image-placeholder {
        background-color: #f0f0f0; /* Light gray placeholder */
        display: flex; align-items: center; justify-content: center;
    }
    .dark .gallery-image-placeholder { background-color: #374151; }
    .gallery-image-placeholder svg { width: 30%; height: 30%; fill: #9ca3af; }
    .dark .gallery-image-placeholder svg { fill: #6b7280; }
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
          <label for="batchSizeInput" class="text-sm text-gray-700 dark:text-gray-300">Batch size:</label>
          <input type="number" id="batchSizeInput" min="1" max="1000" step="1" value="50"
            class="w-24 p-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          <span class="text-xs text-gray-400 dark:text-gray-500">(1~1000)</span>
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
    // --- Client-Side JavaScript ---

    // Global variables & Constants
    let currentCursor = null;
    let isLoadingMetadata = false; // Prevents multiple metadata fetches for display
    let hasMoreImages = true;
    let totalImagesLoaded = 0;
    const GALLERY_THUMBNAIL_CONCURRENCY = 6;
    const ZIP_IMAGE_CONCURRENCY = 8;

    // DOM Elements
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const tokenInput = document.getElementById('tokenInput');
    const teamIdInput = document.getElementById('teamIdInput');
    const saveSettingsBtn = document.getElementById('saveSettings');
    const exportZipBtn = document.getElementById('exportZipBtn');
    const includeMetadataCheckbox = document.getElementById('includeMetadataCheckbox');
    const exportStatusEl = document.getElementById('exportStatus');
    const exportStatusTextEl = document.getElementById('exportStatusText');
    const exportProgressBarEl = document.getElementById('exportProgressBar');
    const errorMessage = document.getElementById('errorMessage');
    const galleryEl = document.getElementById('gallery');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const summaryStats = document.getElementById('summaryStats');
    const totalImagesEl = document.getElementById('totalImages');
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const modalTitle = document.getElementById('modalTitle');
    const closeModalBtn = document.getElementById('closeModal');
    const notification = document.getElementById('notification');
    const downloadBtn = document.getElementById('downloadImage');
    const batchSizeInput = document.getElementById('batchSizeInput');

    // --- Utility Functions ---
    function parseJwt(token) {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        return JSON.parse(jsonPayload);
      } catch (e) { console.error('Error parsing JWT:', e); return null; }
    }

    function validateToken(token) {
      if (!token || token.trim() === '') return { success: false, error: 'Token is required' };
      if (token.trim().length < 10) return { success: false, error: 'Token is too short' };
      const actualToken = token.startsWith('Bearer ') ? token.substring(7).trim() : token;
      if (actualToken.includes(' ')) return { success: false, error: 'Token (after Bearer) should not contain spaces.' };
      try {
        const decoded = parseJwt(actualToken);
        if (decoded && decoded.exp && (decoded.exp * 1000 < Date.now())) {
          return { success: false, error: 'Token has expired. Please get a new one.' };
        }
      } catch (e) { console.warn('Could not check token expiration:', e); }
      return { success: true, data: actualToken };
    }

    function formatDate(timestamp) {
      const date = new Date(timestamp * 1000);
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function getBatchSize() {
      let size = parseInt(localStorage.getItem('chatgpt_batch_size') || '50', 10);
      return Math.max(1, Math.min(1000, isNaN(size) ? 50 : size));
    }

    function setBatchSize(size) {
      size = Math.max(1, Math.min(1000, parseInt(size, 10) || 50));
      localStorage.setItem('chatgpt_batch_size', size.toString());
      batchSizeInput.value = size.toString();
    }
    function initBatchSizeInput() {
      batchSizeInput.value = getBatchSize().toString();
      batchSizeInput.addEventListener('change', () => setBatchSize(batchSizeInput.value));
    }

    // --- Theme Management ---
    function applyTheme(theme) {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
    function toggleTheme() {
      const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
      localStorage.setItem('chatgpt_gallery_theme', newTheme);
      applyTheme(newTheme);
    }
    function loadTheme() {
      applyTheme(localStorage.getItem('chatgpt_gallery_theme') || 'light');
    }

    // --- UI Feedback ---
    function showError(message) {
      errorMessage.textContent = message;
      errorMessage.classList.remove('hidden');
    }
    function hideError() { errorMessage.classList.add('hidden'); }
    function showNotification(message = "Settings saved successfully!") {
      notification.textContent = message;
      notification.classList.remove('translate-x-full');
      notification.classList.add('translate-x-0');
      setTimeout(() => {
        notification.classList.add('translate-x-full');
        notification.classList.remove('translate-x-0');
      }, 3000);
    }

    // --- Gallery Loading Logic ---
    async function fetchAllImagesForDisplay() {
      console.log('Starting to fetch all images for display');
      const apiToken = localStorage.getItem('chatgpt_api_token');
      if (!apiToken) {
        galleryEl.innerHTML = '<div class="col-span-full bg-white dark:bg-gray-800 rounded-lg shadow p-10 text-center text-gray-600 dark:text-gray-400">Enter your API token to view your images</div>';
        loadingIndicator.classList.add('hidden');
        return;
      }
      galleryEl.innerHTML = '';
      totalImagesLoaded = 0;
      currentCursor = null;
      hasMoreImages = true;
      loadingIndicator.classList.remove('hidden');
      loadingIndicator.querySelector('p').textContent = 'Loading images...';
      summaryStats.classList.add('hidden');
      initBatchSizeInput();

      while (hasMoreImages && !isLoadingMetadata) {
        isLoadingMetadata = true;
        await fetchMetadataBatchAndThumbnails();
        isLoadingMetadata = false;
        totalImagesEl.textContent = totalImagesLoaded.toString();
        if (!hasMoreImages) {
            loadingIndicator.querySelector('p').textContent = totalImagesLoaded > 0 ? 'All images loaded.' : 'No images found.';
            setTimeout(() => loadingIndicator.classList.add('hidden'), totalImagesLoaded > 0 ? 2000 : 4000);
        }
      }
      if (totalImagesLoaded > 0) summaryStats.classList.remove('hidden');
      if (!hasMoreImages && totalImagesLoaded === 0) {
        galleryEl.innerHTML = '<div class="col-span-full bg-white dark:bg-gray-800 rounded-lg shadow p-10 text-center text-gray-600 dark:text-gray-400">No images found for the current settings.</div>';
      }
    }

    async function fetchMetadataBatchAndThumbnails() {
      const apiToken = localStorage.getItem('chatgpt_api_token');
      const teamId = localStorage.getItem('chatgpt_team_id');
      if (!apiToken) { showError('No API token found.'); hasMoreImages = false; return; }

      try {
        const metadataBatchSize = getBatchSize();
        const url = new URL('/api/images', window.location.origin);
        if (currentCursor) url.searchParams.set('after', currentCursor);
        url.searchParams.set('limit', metadataBatchSize.toString());

        const headers = { 'x-api-token': apiToken };
        if (teamId && teamId.trim() !== "") headers['x-team-id'] = teamId;

        const response = await fetch(url.toString(), { headers });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown API error' }));
          throw new Error(errorData.error || \`API Error: \${response.status}\`);
        }
        const metadataResult = await response.json(); // Type: GalleryResponse

        currentCursor = metadataResult.cursor || null;
        hasMoreImages = !!currentCursor && metadataResult.items && metadataResult.items.length > 0;

        if (metadataResult.items && metadataResult.items.length > 0) {
          const itemsWithThumbnails = await fetchThumbnailsForItems(metadataResult.items);
          displayImages(itemsWithThumbnails);
          totalImagesLoaded += itemsWithThumbnails.length;
        } else if (!currentCursor) { // No items and no cursor means no more images at all
            hasMoreImages = false;
        }
      } catch (error) {
        console.error('Error fetching image batch or thumbnails:', error);
        showError(error.message || 'Error loading images.');
        hasMoreImages = false;
      }
    }

    async function fetchThumbnailsForItems(items) { // items: ImageItem[]
      const itemsToProcess = items.filter(item => item.encodings.thumbnail.path);
      const processedItems = [];
      const itemMap = new Map(items.map(item => [item.id, item])); // For easy update

      for (let i = 0; i < itemsToProcess.length; i += GALLERY_THUMBNAIL_CONCURRENCY) {
        const chunk = itemsToProcess.slice(i, i + GALLERY_THUMBNAIL_CONCURRENCY);
        const thumbnailPromises = chunk.map(async (item) => {
          try {
            const response = await fetch(item.encodings.thumbnail.path);
            if (!response.ok) {
              console.warn(\`Failed thumbnail fetch for \${item.id}: \${response.status}\`);
              return { id: item.id, blobUrl: null, success: false };
            }
            const blob = await response.blob();
            return { id: item.id, blobUrl: URL.createObjectURL(blob), success: true };
          } catch (e) {
            console.warn(\`Error fetching thumbnail for \${item.id}:\`, e);
            return { id: item.id, blobUrl: null, success: false };
          }
        });
        const settledResults = await Promise.allSettled(thumbnailPromises);
        settledResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value.success) {
            const originalItem = itemMap.get(result.value.id);
            if (originalItem) {
              originalItem.encodings.thumbnail.blobUrl = result.value.blobUrl;
            }
          }
        });
      }
      return items; // Return original items array, now potentially with blobUrls
    }

    function displayImages(images) { // images: ImageItem[]
      images.forEach(image => {
        const itemEl = document.createElement('div');
        itemEl.className = 'bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-all hover:-translate-y-1';
        const imgContainer = document.createElement('div');
        imgContainer.className = 'w-full aspect-[3/4] object-cover cursor-pointer gallery-image-placeholder';
        const img = document.createElement('img');
        img.className = 'w-full h-full object-cover hidden';
        img.alt = image.title || 'Untitled image';
        img.dataset.fullImage = image.url;
        img.dataset.title = image.title || 'Untitled image';
        img.loading = 'lazy';

        const placeholderSvg = \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 3H3C1.89543 3 1 3.89543 1 5V19C1 20.1046 1.89543 21 3 21H21C22.1046 21 23 20.1046 23 19V5C23 3.89543 22.1046 3 21 3ZM3 4.5H21C21.2761 4.5 21.5 4.72386 21.5 5V15.0858L18.2071 11.7929C17.8166 11.4024 17.1834 11.4024 16.7929 11.7929L13.5 15.0858L9.70711 11.2929C9.31658 10.9024 8.68342 10.9024 8.29289 11.2929L2.5 17.0858V5C2.5 4.72386 2.72386 4.5 3 4.5ZM16 8C16 8.55228 15.5523 9 15 9C14.4477 9 14 8.55228 14 8C14 7.44772 14.4477 7 15 7C15.5523 7 16 7.44772 16 8Z"/></svg>\`;

        if (image.encodings.thumbnail.blobUrl) {
          img.src = image.encodings.thumbnail.blobUrl;
        } else if (image.encodings.thumbnail.path) { // Fallback to direct path if blob not ready/failed
          img.src = image.encodings.thumbnail.path;
        } else { // No thumbnail path at all
          imgContainer.innerHTML = placeholderSvg;
        }

        img.onload = () => {
          img.classList.remove('hidden');
          imgContainer.classList.remove('gallery-image-placeholder');
          imgContainer.innerHTML = '';
          imgContainer.appendChild(img);
        };
        img.onerror = () => {
          console.warn(\`Failed to load thumbnail: \${img.src} for \${image.title || image.id}\`);
          if (img.src !== image.url) { // If thumbnail failed, try full image
            img.src = image.url;
          } else { // Full image also failed
            img.classList.add('hidden');
            if (!imgContainer.querySelector('svg')) imgContainer.innerHTML = placeholderSvg;
            imgContainer.classList.add('gallery-image-placeholder');
          }
        };
        if (img.src) imgContainer.appendChild(img); // Add if src is set

        const info = document.createElement('div');
        info.className = 'p-4';
        const titleEl = document.createElement('h3');
        titleEl.className = 'font-medium text-gray-800 dark:text-gray-200 mb-1 truncate';
        titleEl.textContent = image.title || 'Untitled image';
        const dateEl = document.createElement('p');
        dateEl.className = 'text-sm text-gray-500 dark:text-gray-400';
        dateEl.textContent = formatDate(image.created_at);
        info.appendChild(titleEl); info.appendChild(dateEl);
        itemEl.appendChild(imgContainer); itemEl.appendChild(info);
        galleryEl.appendChild(itemEl);
        imgContainer.addEventListener('click', () => openModal(image.url, image.title || 'Untitled image'));
      });
    }

    // --- Modal Logic ---
    function openModal(imageSrc, imageTitle) {
      modalImage.src = imageSrc;
      modalImage.alt = imageTitle;
      modalTitle.textContent = imageTitle;
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
    function closeModal() {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      modalImage.src = ""; // Clear src to stop loading if any
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

      exportZipBtn.disabled = true;
      exportStatusEl.classList.remove('hidden');
      exportStatusTextEl.textContent = 'Starting export: Fetching all image metadata...';
      exportProgressBarEl.style.width = '0%';

      const allImageMetadata = [];
      let tempCursor = null;
      let moreMetaToFetch = true;
      let metaBatchesFetched = 0;
      const metaBatchSize = 100; // Larger batch for metadata collection
      let baseZipProgress = 0;

      try {
        // 1. Collect ALL image metadata first
        while (moreMetaToFetch) {
          metaBatchesFetched++;
          exportStatusTextEl.textContent = \`Fetching image metadata (Batch \${metaBatchesFetched})...\`;
          const teamId = localStorage.getItem('chatgpt_team_id');
          const url = new URL('/api/images', window.location.origin);
          if (tempCursor) url.searchParams.set('after', tempCursor);
          url.searchParams.set('limit', metaBatchSize.toString());
          const headers = { 'x-api-token': apiToken };
          if (teamId && teamId.trim() !== "") headers['x-team-id'] = teamId;

          const response = await fetch(url.toString(), { headers });
          if (!response.ok) throw new Error(\`Metadata fetch error: \${response.status}\`);
          const data = await response.json(); // GalleryResponse
          if (data.items && data.items.length > 0) allImageMetadata.push(...data.items);
          tempCursor = data.cursor;
          moreMetaToFetch = !!tempCursor && data.items && data.items.length > 0;
          baseZipProgress = Math.min(10, metaBatchesFetched); // Max 10% for metadata phase
          exportProgressBarEl.style.width = \`\${baseZipProgress * 10}%\`;
        }

        if (allImageMetadata.length === 0) {
          exportStatusTextEl.textContent = 'No images found to export.';
          exportProgressBarEl.style.width = '100%';
          setTimeout(() => exportStatusEl.classList.add('hidden'), 3000);
          return;
        }
        exportStatusTextEl.textContent = \`Found \${allImageMetadata.length} images. Preparing to ZIP...\`;
        
        const zip = new JSZip();
        if (includeMetadataCheckbox.checked) {
          exportStatusTextEl.textContent = 'Adding metadata.json...';
          const metadataToExport = allImageMetadata.map(item => ({
            id: item.id, title: item.title, created_at: item.created_at,
            width: item.width, height: item.height,
            original_url: item.originalUrl,
            original_thumbnail_url: item.encodings.thumbnail.originalPath
          }));
          zip.file("metadata.json", JSON.stringify(metadataToExport, null, 2));
          baseZipProgress = 15;
          exportProgressBarEl.style.width = \`\${baseZipProgress}%\`;
        } else {
          baseZipProgress = 10;
          exportProgressBarEl.style.width = \`\${baseZipProgress}%\`;
        }

        // 2. Fetch image blobs concurrently and add to ZIP
        let imagesProcessedForZip = 0;
        let successfulImageDownloads = 0;

        for (let i = 0; i < allImageMetadata.length; i += ZIP_IMAGE_CONCURRENCY) {
          const chunk = allImageMetadata.slice(i, i + ZIP_IMAGE_CONCURRENCY);
          exportStatusTextEl.textContent = \`Downloading images \${i + 1}-\${Math.min(i + ZIP_IMAGE_CONCURRENCY, allImageMetadata.length)} of \${allImageMetadata.length}...\`;

          const imageFetchPromises = chunk.map(async (imageItem) => {
            try {
              const imageResponse = await fetch(imageItem.url); // Uses proxied URL
              if (!imageResponse.ok) return { success: false, item: imageItem, errorStatus: imageResponse.status };
              const blob = await imageResponse.blob();
              const contentType = imageResponse.headers.get('content-type');
              const extension = getExtensionFromContentType(contentType);
              const datePrefix = formatDateForFilename(imageItem.created_at);
              const titlePart = sanitizeFilename(imageItem.title);
              const filename = \`images/\${datePrefix}_\${titlePart}.\${extension}\`;
              return { success: true, filename, blob, item: imageItem };
            } catch (e) { return { success: false, item: imageItem, error: e }; }
          });

          const chunkResults = await Promise.allSettled(imageFetchPromises);
          chunkResults.forEach(result => {
            imagesProcessedForZip++;
            const overallProgress = baseZipProgress + ((imagesProcessedForZip / allImageMetadata.length) * (100 - baseZipProgress));
            exportProgressBarEl.style.width = \`\${Math.round(overallProgress)}%\`;
            if (result.status === 'fulfilled' && result.value.success) {
              zip.file(result.value.filename, result.value.blob);
              successfulImageDownloads++;
            } else {
              const title = result.status === 'fulfilled' ? result.value.item.title : (result.reason?.item?.title || "Unknown");
              console.warn(\`Skipped zipping: \${title}. Reason:\`, result.status === 'rejected' ? result.reason : result.value);
            }
          });
          exportStatusTextEl.textContent = \`Processed \${imagesProcessedForZip} of \${allImageMetadata.length} images for zipping...\`;
        }
        
        if (successfulImageDownloads === 0 && allImageMetadata.length > 0) {
            throw new Error("No images could be successfully downloaded for the ZIP.");
        }

        // 3. Generate and download ZIP
        exportStatusTextEl.textContent = 'Generating ZIP file... Please wait.';
        exportProgressBarEl.style.width = '100%';
        const zipContent = await zip.generateAsync({ type: "blob" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipContent);
        const workspaceName = localStorage.getItem('chatgpt_team_id') ? 'team' : 'personal';
        link.download = \`chatgpt_images_\${workspaceName}_\${formatDateForFilename(Date.now()/1000)}.zip\`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        exportStatusTextEl.textContent = 'Export complete! ZIP file downloaded.';

      } catch (error) {
        console.error('Error during ZIP export:', error);
        showError(\`Export failed: \${error.message}\`);
        exportStatusTextEl.textContent = \`Export failed: \${error.message}\`;
      } finally {
        exportZipBtn.disabled = false;
        setTimeout(() => {
          exportStatusEl.classList.add('hidden');
          exportProgressBarEl.style.width = '0%';
        }, 7000);
      }
    }

    // --- Initialization and Event Listeners ---
    function init() {
      loadTheme();
      console.log('Initializing app...');
      const storedToken = localStorage.getItem('chatgpt_api_token');
      const storedTeamId = localStorage.getItem('chatgpt_team_id');
      const storedIncludeMeta = localStorage.getItem('chatgpt_include_metadata');

      if (storedToken) {
        tokenInput.value = storedToken;
        if (storedTeamId) teamIdInput.value = storedTeamId;
        if (storedIncludeMeta !== null) includeMetadataCheckbox.checked = storedIncludeMeta === 'true';
        
        const validation = validateToken(storedToken); // Validate on load
        if (!validation.success && validation.error.includes("expired")) {
            showError(validation.error);
            loadingIndicator.classList.add('hidden');
        } else if (validation.success) {
            setTimeout(fetchAllImagesForDisplay, 100);
        } else { // Other validation error
            showError(validation.error || "Invalid stored token.");
            loadingIndicator.classList.add('hidden');
        }
      } else {
        galleryEl.innerHTML = '<div class="col-span-full bg-white dark:bg-gray-800 rounded-lg shadow p-10 text-center text-gray-600 dark:text-gray-400">Enter API token to view images.</div>';
        loadingIndicator.classList.add('hidden');
      }
      initBatchSizeInput();

      themeToggleBtn.addEventListener('click', toggleTheme);
      saveSettingsBtn.addEventListener('click', () => {
        hideError();
        const rawToken = tokenInput.value.trim();
        const newTeamId = teamIdInput.value.trim();
        const validationResult = validateToken(rawToken);

        if (!validationResult.success) { showError(validationResult.error); return; }
        
        localStorage.setItem('chatgpt_api_token', validationResult.data); // Save actual token
        if (newTeamId) localStorage.setItem('chatgpt_team_id', newTeamId);
        else localStorage.removeItem('chatgpt_team_id');
        localStorage.setItem('chatgpt_include_metadata', includeMetadataCheckbox.checked.toString());
        
        showNotification("Settings saved. Reloading images...");
        fetchAllImagesForDisplay();
      });
      exportZipBtn.addEventListener('click', handleExportAllAsZip);
      includeMetadataCheckbox.addEventListener('change', () => {
         localStorage.setItem('chatgpt_include_metadata', includeMetadataCheckbox.checked.toString());
      });
      downloadBtn.addEventListener('click', () => {
        const imageSrc = modalImage.src;
        const imageTitle = modalTitle.textContent || 'image';
        const tempLink = document.createElement('a');
        tempLink.href = imageSrc;
        // Try to get extension from src if it's a blob or has one, otherwise default
        let extension = 'jpg';
        try {
            const urlParts = new URL(imageSrc);
            const pathParts = urlParts.pathname.split('.');
            if (pathParts.length > 1) extension = pathParts.pop();
        } catch(e) { /* ignore if not a valid URL for parsing extension */ }

        tempLink.download = sanitizeFilename(imageTitle) + '.' + extension;
        document.body.appendChild(tempLink); tempLink.click(); document.body.removeChild(tempLink);
      });
      closeModalBtn.addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });
      tokenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveSettingsBtn.click(); });
      teamIdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveSettingsBtn.click(); });
      console.log('Initialization complete');
    }

    // Start the app
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  </script>
</body>
</html>`;
}
