// Deno Gallery Application with proxied requests for global access
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Types for our image gallery
interface ImageItem {
  id: string;
  url: string; // This will be the proxied URL
  originalUrl?: string; // Store the original URL
  width: number;
  height: number;
  title: string;
  created_at: number;
  encodings: {
    thumbnail: {
      path: string; // This will be the proxied URL
      originalPath?: string; // Store original thumbnail URL
    };
  };
}

interface GalleryResponse {
  items: ImageItem[];
  cursor?: string;
}

// Zod schema for API token validation
const TokenSchema = z
  .string()
  .min(10, "Token too short")
  .refine((val) => !val.includes(" "), {
    message: "Token should not contain spaces",
  });

// Main handler for all requests
Deno.serve(async (request) => {
  const url = new URL(request.url);

  // Handle API route for images
  if (url.pathname === "/api/images") {
    const token = request.headers.get("x-api-token");
    const teamId = request.headers.get("x-team-id");

    const tokenResult = TokenSchema.safeParse(token);
    if (!tokenResult.success) {
      return Response.json(
        {
          error: "Invalid API token",
          details: tokenResult.error.errors,
        },
        { status: 401 },
      );
    }

    const after = url.searchParams.get("after");
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    try {
      const images = await fetchImages(
        tokenResult.data,
        teamId || undefined,
        after || undefined,
        limit,
      );
      return Response.json(images);
    } catch (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  // Handle proxy requests for image content
  if (url.pathname === "/proxy/image") {
    const imageUrl = url.searchParams.get("url");
    if (!imageUrl) {
      return Response.json({ error: "Missing image URL" }, { status: 400 });
    }

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch image: ${response.status} ${response.statusText}`,
        );
      }
      const contentType = response.headers.get("content-type") || "image/jpeg";
      return new Response(response.body, {
        headers: {
          "content-type": contentType,
          "cache-control": "public, max-age=86400",
          "access-control-allow-origin": "*",
        },
      });
    } catch (error) {
      console.error("Error proxying image:", error);
      return Response.json(
        { error: "Failed to proxy image" },
        { status: 500 },
      );
    }
  }

  return new Response(renderGalleryPage(), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});

async function fetchImages(
  apiToken: string,
  teamId?: string,
  after?: string,
  limit?: number,
): Promise<GalleryResponse> {
  try {
    const url = new URL("https://chatgpt.com/backend-api/my/recent/image_gen");
    url.searchParams.set(
      "limit",
      String(limit && limit > 0 && limit <= 1000 ? limit : 50),
    );
    if (after) url.searchParams.set("after", after);

    console.log(
      `Fetching from URL: ${url.toString()}, Team ID: ${teamId || "Personal"}`,
    );

    const headers: HeadersInit = {
      "accept": "*/*",
      "authorization": "Bearer " + apiToken,
      "cache-control": "no-cache",
      "user-agent":
        "DenoGalleryApp/1.0 (Deno; like ChatGPT Interface User)",
    };
    if (teamId && teamId.trim() !== "") {
      headers["chatgpt-account-id"] = teamId;
    }

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("API error response body:", errorBody);
      if (response.status === 401)
        throw new Error(
          "Invalid API token or unauthorized for the specified account.",
        );
      if (response.status === 403)
        throw new Error(
          "Access forbidden: Ensure permissions for the specified account.",
        );
      throw new Error(
        `API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    console.log(`Retrieved ${data.items?.length || 0} images in this batch`);

    const items = data.items.map((item: any) => {
      const originalFullUrl = item.url;
      const originalThumbnailPath = item.encodings?.thumbnail?.path;

      const processedItem: ImageItem = {
        id: item.id,
        url: `/proxy/image?url=${encodeURIComponent(originalFullUrl)}`,
        originalUrl: originalFullUrl, // Store original URL
        width: item.width,
        height: item.height,
        title: item.title,
        created_at: item.created_at,
        encodings: {
          thumbnail: {
            path: originalThumbnailPath
              ? `/proxy/image?url=${
                encodeURIComponent(originalThumbnailPath)
              }`
              : "",
            originalPath: originalThumbnailPath, // Store original thumbnail URL
          },
        },
      };
      // Ensure encodings structure if missing from API
      if (!processedItem.encodings) {
        processedItem.encodings = { thumbnail: { path: "", originalPath: "" } };
      }
      if (!processedItem.encodings.thumbnail) {
        processedItem.encodings.thumbnail = { path: "", originalPath: "" };
      }
      return processedItem;
    });

    return {
      items,
      cursor: data.cursor,
    } as GalleryResponse;
  } catch (error) {
    console.error("Error fetching images:", error);
    throw error;
  }
}

function renderGalleryPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChatGPT Image Gallery</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: '#10a37f',
            primaryDark: '#0c8c6a',
            error: '#ef4444'
          }
        }
      }
    }
  </script>
  <style>
    .progress-bar-container { width: 100%; background-color: #e0e0e0; border-radius: 4px; margin-top: 0.5rem; height: 10px; }
    .progress-bar { width: 0%; height: 100%; background-color: #10a37f; border-radius: 4px; transition: width 0.3s ease-in-out; }
  </style>
</head>
<body class="bg-gray-50 text-gray-800">
  <div class="max-w-6xl mx-auto px-4 py-6">
    <h1 class="text-3xl font-bold text-center">ChatGPT Image Gallery</h1>
    <p class="text-center text-gray-600 mb-8">View all your generated images in one place</p>

    <div class="bg-white rounded-lg shadow p-6 mb-8">
      <div id="errorMessage" class="bg-red-100 text-red-700 p-4 rounded mb-4 hidden"></div>
      <div class="mb-4">
        <label for="tokenInput" class="block text-sm font-medium text-gray-700 mb-1">ChatGPT API Token:</label>
        <input type="password" id="tokenInput" placeholder="Enter your ChatGPT API token"
               class="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      <div class="mb-4">
        <label for="teamIdInput" class="block text-sm font-medium text-gray-700 mb-1">Team ID (Optional):</label>
        <input type="text" id="teamIdInput" placeholder="Enter Team ID for team workspace"
               class="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary" />
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
          <label for="batchSizeInput" class="text-sm text-gray-700">Batch size:</label>
          <input type="number" id="batchSizeInput" min="1" max="1000" step="1" value="50"
            class="w-24 p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary" />
          <span class="text-xs text-gray-400">(1~1000)</span>
        </div>
      </div>
      <div class="mb-4">
        <label for="includeMetadataCheckbox" class="flex items-center text-sm text-gray-700">
          <input type="checkbox" id="includeMetadataCheckbox" class="mr-2 h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded" checked>
          Include metadata.json in ZIP
        </label>
      </div>
      <div id="exportStatus" class="text-sm text-gray-600 mt-4 hidden">
        <p id="exportStatusText">Starting export...</p>
        <div class="progress-bar-container">
          <div id="exportProgressBar" class="progress-bar"></div>
        </div>
      </div>
      <div class="text-sm text-gray-600">
        <p class="mb-2">Provide your ChatGPT API token. For team workspaces, also provide the Team ID. Settings are stored locally.</p>
        <p class="font-semibold mb-1">How to get API Token & Team ID:</p>
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
        <p class="mt-2 text-gray-600">Loading all images...</p>
      </div>
      <div id="summaryStats" class="text-center py-4 text-gray-600 hidden">
        <p><span id="totalImages">0</span> images loaded</p>
      </div>
    </div>
  </div>

  <div id="imageModal" class="fixed inset-0 bg-black bg-opacity-90 z-50 hidden flex justify-center items-center">
    <div class="relative max-w-[90%] max-h-[90%]">
      <button id="closeModal" class="absolute -top-10 right-0 text-white text-3xl font-bold">&times;</button>
      <img id="modalImage" class="max-w-full max-h-[90vh] object-contain rounded" src="" alt="">
      <div id="modalTitle" class="absolute -bottom-10 left-0 text-white text-base"></div>
      <a id="downloadImage" class="absolute -top-10 left-0 text-white hover:text-gray-200 transition-colors cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg> Download
      </a>
    </div>
  </div>
  <div id="notification" class="fixed top-5 right-5 bg-primary text-white p-4 rounded shadow-lg transform translate-x-full transition-transform duration-300 z-50">
    Settings saved successfully!
  </div>

  <script>
    // JSZip will be available globally
    // ... (parseJwt, validateToken, formatDate, getBatchSize, setBatchSize, initBatchSizeInput from previous version) ...

    // Global variables
    let currentCursor = null;
    let isLoading = false;
    let hasMoreImages = true;
    let totalImagesLoaded = 0;

    // Elements
    const tokenInput = document.getElementById('tokenInput');
    const teamIdInput = document.getElementById('teamIdInput');
    const saveSettingsBtn = document.getElementById('saveSettings');
    const exportZipBtn = document.getElementById('exportZipBtn');
    const includeMetadataCheckbox = document.getElementById('includeMetadataCheckbox'); // New checkbox
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


    // --- Helper functions for ZIP export ---
    function formatDateForFilename(timestamp) {
      const date = new Date(timestamp * 1000);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      return \`\${year}\${month}\${day}_\${hours}\${minutes}\${seconds}\`;
    }

    function sanitizeFilename(name, maxLength = 100) {
      let sanitized = name.replace(/[<>:"/\\\\|?*\\s]+/g, '_').replace(/[\\x00-\\x1f\\x7f]/g, '');
      if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
      }
      return sanitized || 'image';
    }

    function getExtensionFromContentType(contentType) {
      if (!contentType) return 'jpg'; // Default extension
      if (contentType.includes('jpeg')) return 'jpg';
      if (contentType.includes('png')) return 'png';
      if (contentType.includes('gif')) return 'gif';
      if (contentType.includes('webp')) return 'webp';
      const parts = contentType.split('/');
      return parts.length > 1 ? parts[1].split(';')[0].trim() : 'jpg'; // Handle cases like 'image/jpeg; charset=utf-8'
    }
    // --- End Helper functions for ZIP export ---


    async function fetchAllImages() {
      // ... (same as previous version)
      console.log('Starting to fetch all images for display');
      const apiToken = localStorage.getItem('chatgpt_api_token');
      if (!apiToken) {
        galleryEl.innerHTML = '<div class="col-span-full bg-white rounded-lg shadow p-10 text-center text-gray-600">Enter your API token to view your images</div>';
        loadingIndicator.classList.add('hidden');
        return;
      }
      galleryEl.innerHTML = '';
      totalImagesLoaded = 0;
      currentCursor = null;
      hasMoreImages = true;
      loadingIndicator.classList.remove('hidden');
      summaryStats.classList.add('hidden');
      initBatchSizeInput();

      async function fetchAndRender() {
        while (hasMoreImages) {
          await fetchBatch(true);
          totalImagesEl.textContent = totalImagesLoaded;
        }
        loadingIndicator.classList.add('hidden');
        summaryStats.classList.remove('hidden');
        totalImagesEl.textContent = totalImagesLoaded;
      }
      fetchAndRender();
    }

    async function fetchBatch(forDisplay = true) {
      // ... (same as previous version)
      console.log('Fetching batch. For display:', forDisplay, 'After:', currentCursor);
      if (isLoading && forDisplay) return;

      const apiToken = localStorage.getItem('chatgpt_api_token');
      const teamId = localStorage.getItem('chatgpt_team_id');
      if (!apiToken) return forDisplay ? showError('No API token found.') : null;

      if (forDisplay) isLoading = true;

      try {
        const batchSize = getBatchSize();
        const url = '/api/images' + (currentCursor ? '?after=' + encodeURIComponent(currentCursor) : '');
        const urlObj = new URL(url, window.location.origin);
        urlObj.searchParams.set('limit', batchSize.toString());

        const headers = { 'x-api-token': apiToken };
        if (teamId && teamId.trim() !== "") headers['x-team-id'] = teamId;

        const response = await fetch(urlObj.toString(), { headers });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || \`Error: \${response.status}\`);
        }
        const data = await response.json();

        if (forDisplay) {
            currentCursor = data.cursor || null;
            hasMoreImages = !!currentCursor && data.items && data.items.length > 0;
            if (data.items && data.items.length > 0) {
                displayImages(data.items);
                totalImagesLoaded += data.items.length;
            } else {
                hasMoreImages = false;
            }
        } else {
            return { items: data.items || [], cursor: data.cursor || null };
        }

      } catch (error) {
        console.error('Error fetching batch:', error);
        if (forDisplay) showError(error.message);
        if (forDisplay) hasMoreImages = false;
        return null;
      } finally {
        if (forDisplay) isLoading = false;
      }
    }


    function displayImages(images) {
      // ... (same as previous version)
       images.forEach(image => {
        const item = document.createElement('div');
        item.className = 'bg-white rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-all hover:-translate-y-1';
        const img = document.createElement('img');
        img.className = 'w-full aspect-[3/4] object-cover cursor-pointer';
        img.src = image.encodings.thumbnail.path;
        img.alt = image.title || 'Untitled image';
        img.dataset.fullImage = image.url;
        img.dataset.title = image.title || 'Untitled image';
        img.loading = 'lazy';
        img.onerror = function () {
          if (img.src !== image.url) {
            img.src = image.url;
          }
        };
        const info = document.createElement('div');
        info.className = 'p-4';
        const title = document.createElement('h3');
        title.className = 'font-medium text-gray-800 mb-1';
        title.textContent = image.title || 'Untitled image';
        const date = document.createElement('p');
        date.className = 'text-sm text-gray-500';
        date.textContent = formatDate(image.created_at);
        info.appendChild(title);
        info.appendChild(date);
        item.appendChild(img);
        item.appendChild(info);
        galleryEl.appendChild(item);
        img.addEventListener('click', () => openModal(image.url, image.title || 'Untitled image'));
      });
    }

    // --- ZIP Export Logic ---
    async function handleExportAllAsZip() {
      const apiToken = localStorage.getItem('chatgpt_api_token');
      if (!apiToken) {
        showError('API Token is required for export.');
        return;
      }
      if (!window.JSZip) {
        showError('JSZip library not loaded. Cannot export.');
        return;
      }

      exportZipBtn.disabled = true;
      exportStatusEl.classList.remove('hidden');
      exportStatusTextEl.textContent = 'Starting export: Fetching image list...';
      exportProgressBarEl.style.width = '0%';

      const allImageMetadata = []; // Will store ImageItem objects
      let exportCursor = null;
      let hasMoreToExport = true;
      let batchesFetched = 0;
      const batchSizeForExport = 100;

      try {
        // 1. Collect all image metadata
        while (hasMoreToExport) {
          batchesFetched++;
          exportStatusTextEl.textContent = \`Fetching image metadata (Batch \${batchesFetched})...\`;

          const teamId = localStorage.getItem('chatgpt_team_id');
          const url = '/api/images' + (exportCursor ? '?after=' + encodeURIComponent(exportCursor) : '');
          const urlObj = new URL(url, window.location.origin);
          urlObj.searchParams.set('limit', batchSizeForExport.toString());

          const headers = { 'x-api-token': apiToken };
          if (teamId && teamId.trim() !== "") headers['x-team-id'] = teamId;

          const response = await fetch(urlObj.toString(), { headers });
          if (!response.ok) throw new Error(\`Failed to fetch image metadata: \${response.status}\`);

          const data = await response.json(); // Expects GalleryResponse structure
          if (data.items && data.items.length > 0) {
            // data.items are already processed ImageItem objects from our backend
            allImageMetadata.push(...data.items);
          }
          exportCursor = data.cursor;
          hasMoreToExport = !!exportCursor && data.items && data.items.length > 0;
          // Simple progress for metadata fetching, assuming roughly 10 batches max for this stage
          exportProgressBarEl.style.width = \`\${Math.min(10, (batchesFetched * 1)) * 10}%\`;
        }

        if (allImageMetadata.length === 0) {
          exportStatusTextEl.textContent = 'No images found to export.';
          exportProgressBarEl.style.width = '100%';
          setTimeout(() => exportStatusEl.classList.add('hidden'), 3000);
          return;
        }

        exportStatusTextEl.textContent = \`Found \${allImageMetadata.length} images. Preparing to ZIP...\`;
        // Reset progress bar for zipping stage, starting from 10% (after metadata fetch)
        let baseZipProgress = 10;
        exportProgressBarEl.style.width = \`\${baseZipProgress}%\`;

        const zip = new JSZip();

        // 2. Add metadata.json if checkbox is checked
        if (includeMetadataCheckbox.checked) {
          exportStatusTextEl.textContent = 'Adding metadata.json...';
          // Create a clean version of metadata for export (e.g., remove proxied URLs if desired, or keep them)
          // For simplicity, we'll export the ImageItem structure as is, which includes original and proxied URLs.
          const metadataToExport = allImageMetadata.map(item => ({
            id: item.id,
            title: item.title,
            created_at: item.created_at,
            width: item.width,
            height: item.height,
            original_url: item.originalUrl,
            original_thumbnail_url: item.encodings.thumbnail.originalPath
          }));
          zip.file("metadata.json", JSON.stringify(metadataToExport, null, 2));
          baseZipProgress = 15; // Increment base progress
          exportProgressBarEl.style.width = \`\${baseZipProgress}%\`;
        }


        // 3. Fetch image blobs and add to ZIP
        for (let i = 0; i < allImageMetadata.length; i++) {
          const imageItem = allImageMetadata[i]; // This is an ImageItem
          // Calculate progress for zipping images, accounting for baseZipProgress
          const imageZipProgress = ((i + 1) / allImageMetadata.length) * (100 - baseZipProgress);
          const currentTotalProgress = baseZipProgress + imageZipProgress;

          exportStatusTextEl.textContent = \`Zipping image \${i + 1} of \${allImageMetadata.length}: \${imageItem.title || 'Untitled'}\`;
          exportProgressBarEl.style.width = \`\${Math.round(currentTotalProgress)}%\`;

          try {
            // imageItem.url is already the proxied URL: /proxy/image?url=ENCODED_ORIGINAL_URL
            const imageResponse = await fetch(imageItem.url);
            if (!imageResponse.ok) {
              console.warn(\`Skipping \${imageItem.title}: Failed to fetch blob (\${imageResponse.status})\`);
              continue;
            }
            const blob = await imageResponse.blob();
            const contentType = imageResponse.headers.get('content-type');
            const extension = getExtensionFromContentType(contentType);
            const datePrefix = formatDateForFilename(imageItem.created_at);
            const titlePart = sanitizeFilename(imageItem.title || imageItem.id);
            const filename = \`images/\${datePrefix}_\${titlePart}.\${extension}\`; // Put images in an 'images' subfolder
            zip.file(filename, blob);
          } catch (fetchError) {
            console.warn(\`Skipping \${imageItem.title} due to fetch error:\`, fetchError);
          }
        }

        // 4. Generate and download ZIP
        exportStatusTextEl.textContent = 'Generating ZIP file... Please wait.';
        exportProgressBarEl.style.width = '100%';
        const zipContent = await zip.generateAsync({ type: "blob" });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipContent);
        const workspaceName = localStorage.getItem('chatgpt_team_id') ? 'team' : 'personal';
        link.download = \`chatgpt_images_\${workspaceName}_\${formatDateForFilename(Date.now()/1000)}.zip\`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
        }, 5000);
      }
    }
    // --- End ZIP Export Logic ---

    // ... (openModal, showError, hideError, showNotification, init, etc. from previous version) ...
    // Ensure init() sets up all event listeners correctly.

    function init() {
      console.log('Initializing app...');
      const apiToken = localStorage.getItem('chatgpt_api_token');
      const teamId = localStorage.getItem('chatgpt_team_id');
      const includeMeta = localStorage.getItem('chatgpt_include_metadata');

      if (apiToken) {
        tokenInput.value = apiToken;
        if (teamId) teamIdInput.value = teamId;
        if (includeMeta !== null) includeMetadataCheckbox.checked = includeMeta === 'true';


        try {
          const decoded = parseJwt(apiToken.startsWith('Bearer ') ? apiToken.substring(7) : apiToken);
          if (decoded && decoded.exp && (decoded.exp * 1000 < Date.now())) {
            showError('Saved token has expired. Please get a new one.');
            loadingIndicator.classList.add('hidden');
            return;
          }
        } catch (e) { /* ignore */ }
        setTimeout(fetchAllImages, 100);
      } else {
        galleryEl.innerHTML = '<div class="col-span-full bg-white rounded-lg shadow p-10 text-center text-gray-600">Enter API token to view images.</div>';
        loadingIndicator.classList.add('hidden');
      }

      saveSettingsBtn.addEventListener('click', () => {
        const rawToken = tokenInput.value.trim();
        const newTeamId = teamIdInput.value.trim();
        const tokenToValidate = rawToken.startsWith('Bearer ') ? rawToken.substring(7).trim() : rawToken;
        const validationResult = validateToken(tokenToValidate);

        if (!validationResult.success) {
          showError(validationResult.error);
          return;
        }
        localStorage.setItem('chatgpt_api_token', tokenToValidate);
        if (newTeamId) localStorage.setItem('chatgpt_team_id', newTeamId);
        else localStorage.removeItem('chatgpt_team_id');
        localStorage.setItem('chatgpt_include_metadata', includeMetadataCheckbox.checked.toString());


        showNotification();
        hideError();
        fetchAllImages();
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
        tempLink.download = sanitizeFilename(imageTitle) + '.' + getExtensionFromContentType(null); // Default to jpg if type unknown
        document.body.appendChild(tempLink);
        tempLink.click();
        document.body.removeChild(tempLink);
      });

      closeModalBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
          modal.classList.remove('flex');
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
          modal.classList.add('hidden');
          modal.classList.remove('flex');
        }
      });
      tokenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveSettingsBtn.click(); });
      teamIdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveSettingsBtn.click(); });

      console.log('Initialization complete');
    }


    // Start the app
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  </script>
</body>
</html>`;
}
