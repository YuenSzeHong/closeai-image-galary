// Deno Gallery Application with proxied requests for global access
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Types for our image gallery
interface ImageItem {
  id: string;
  url: string;
  width: number;
  height: number;
  title: string;
  created_at: number;
  encodings: {
    thumbnail: {
      path: string;
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
    const teamId = request.headers.get("x-team-id"); // Get Team ID from header

    // Validate token with Zod
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
        teamId || undefined, // Pass teamId to fetchImages
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
      // Forward the image from the original source
      const response = await fetch(imageUrl);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch image: ${response.status} ${response.statusText}`,
        );
      }

      // Get content type from response or default to image/jpeg
      const contentType = response.headers.get("content-type") || "image/jpeg";

      // Stream the image content
      return new Response(response.body, {
        headers: {
          "content-type": contentType,
          "cache-control": "public, max-age=86400", // Cache for 24 hours
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

  // Serve the main HTML page for all other routes
  return new Response(renderGalleryPage(), {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
});

// Function to fetch images from the ChatGPT API using the provided token
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
    if (after) {
      url.searchParams.set("after", after);
    }

    console.log("Fetching from URL:", url.toString());
    console.log("Using API Token:", apiToken ? "Yes" : "No");
    console.log("Using Team ID:", teamId || "No (Personal Account)");

    const headers: HeadersInit = {
      "accept": "*/*",
      "authorization": "Bearer " + apiToken,
      "cache-control": "no-cache",
      "user-agent":
        "DenoGalleryApp/1.0 (Deno; like ChatGPT Interface User)", // Added User-Agent
    };

    if (teamId && teamId.trim() !== "") {
      headers["chatgpt-account-id"] = teamId; // Add team ID header if provided
    }

    // Make request to ChatGPT API
    const response = await fetch(url.toString(), { headers });

    // Handle error responses
    if (!response.ok) {
      const errorBody = await response.text(); // Log response body for debugging
      console.error("API error response body:", errorBody);

      if (response.status === 401) {
        throw new Error(
          "Invalid API token or unauthorized for the specified account.",
        );
      }
      if (response.status === 403) {
        throw new Error(
          "Access forbidden: Ensure your API token has the necessary permissions for the specified account.",
        );
      }
      throw new Error(
        "API error: " + response.status + " " + response.statusText,
      );
    }

    // Parse the response
    const data = await response.json();
    console.log(`Retrieved ${data.items?.length || 0} images in this batch`);

    // Process the response to use our proxy for images
    const items = data.items.map((item: ImageItem) => {
      // Proxy the full image URL
      item.url = `/proxy/image?url=${encodeURIComponent(item.url)}`;

      // 確保 encodings 與 thumbnail 結構存在
      if (!item.encodings) {
        item.encodings = { thumbnail: { path: "" } };
      }
      if (!item.encodings.thumbnail) {
        item.encodings.thumbnail = { path: "" };
      }

      // Proxy the thumbnail URL if it exists and is not null
      if (item.encodings.thumbnail.path) {
        item.encodings.thumbnail.path = `/proxy/image?url=${
          encodeURIComponent(item.encodings.thumbnail.path)
        }`;
      }

      return item;
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

// Function to render the HTML for the gallery page
function renderGalleryPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChatGPT Image Gallery</title>
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
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
      <div class="mb-4 sm:flex sm:gap-4">
        <button id="saveSettings"
                class="w-full sm:w-auto bg-primary text-white px-6 py-3 rounded hover:bg-primaryDark transition-colors mb-3 sm:mb-0">
          Save Settings & Load Images
        </button>
        <div class="flex items-center gap-2">
          <label for="batchSizeInput" class="text-sm text-gray-700">Batch size:</label>
          <input type="number" id="batchSizeInput" min="1" max="1000" step="1" value="50"
            class="w-24 p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary" />
          <span class="text-xs text-gray-400">(1~1000)</span>
        </div>
      </div>
      <div class="text-sm text-gray-600">
        <p class="mb-2">You need to provide your ChatGPT API token. If accessing a team workspace, also provide the Team ID. Settings are stored only in your browser's local storage.</p>
        <p class="font-semibold mb-1">How to get your API Token:</p>
        <ol class="list-decimal pl-5 space-y-1 mb-3">
          <li>Log in to <a href="https://chatgpt.com" target="_blank" class="text-primary hover:underline">ChatGPT</a></li>
          <li>Open browser Developer Tools (F12 or right-click > Inspect)</li>
          <li>Go to Network tab</li>
          <li>Refresh the page or make any request (e.g., send a message)</li>
          <li>Find any request to the ChatGPT API (e.g., a request to \`.../conversation\`)</li>
          <li>In the Request Headers, find the "Authorization" header</li>
          <li>Copy the token value (it starts with "Bearer "). Paste the entire value, or just the part after "Bearer ".</li>
        </ol>
        <p class="font-semibold mb-1">How to get your Team ID (if applicable):</p>
        <ol class="list-decimal pl-5 space-y-1">
          <li>In ChatGPT, ensure you are in your Team Workspace.</li>
          <li>Open browser Developer Tools (F12) and go to the Network tab.</li>
          <li>Refresh the page or make any request.</li>
          <li>Find a request to \`chatgpt.com\`.</li>
          <li>In the Request Headers, look for the \`chatgpt-account-id\` header. Copy its value.</li>
          <li>(Alternatively, in some cases, you might find an \`_account\` cookie with the same ID).</li>
        </ol>
      </div>
    </div>

    <div id="galleryContainer">
      <div id="gallery" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        <!-- Images will be loaded here -->
      </div>
      <div id="loadingIndicator" class="text-center py-8">
        <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
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
    // JWT decoding function
    function parseJwt(token) {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
      } catch (e) {
        console.error('Error parsing JWT:', e);
        return null;
      }
    }

    // Validate token
    function validateToken(token) {
      if (!token || token.trim() === '') {
        return { success: false, error: 'Token is required' };
      }
      if (token.trim().length < 10) {
        return { success: false, error: 'Token is too short' };
      }
      // Allow space if it's part of "Bearer ", but the actual token part shouldn't have spaces.
      // The extraction logic handles "Bearer " prefix.
      const actualToken = token.startsWith('Bearer ') ? token.substring(7).trim() : token;
      if (actualToken.includes(' ')) {
          return { success: false, error: 'The token itself (after Bearer) should not contain spaces.' };
      }

      try {
        const decoded = parseJwt(actualToken);
        if (decoded && decoded.exp) {
          const expirationTime = decoded.exp * 1000;
          const currentTime = Date.now();
          if (currentTime >= expirationTime) {
            return { success: false, error: 'Token has expired. Please log in to ChatGPT again to get a new token.' };
          }
        }
      } catch (e) {
        console.warn('Could not check token expiration:', e);
      }
      return { success: true, data: actualToken };
    }

    // Global variables
    let currentCursor = null;
    let isLoading = false;
    let hasMoreImages = true;
    let totalImagesLoaded = 0;

    // Elements
    const tokenInput = document.getElementById('tokenInput');
    const teamIdInput = document.getElementById('teamIdInput'); // New team ID input
    const saveSettingsBtn = document.getElementById('saveSettings'); // Renamed button
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

    function formatDate(timestamp) {
      const date = new Date(timestamp * 1000);
      const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
      return date.toLocaleDateString(undefined, options);
    }

    function getBatchSize() {
      let size = parseInt(localStorage.getItem('chatgpt_batch_size') || '50', 10);
      if (isNaN(size) || size < 1) size = 1;
      if (size > 1000) size = 1000;
      return size;
    }

    function setBatchSize(size) {
      size = Math.max(1, Math.min(1000, parseInt(size, 10) || 50));
      localStorage.setItem('chatgpt_batch_size', size);
      batchSizeInput.value = size;
    }

    function initBatchSizeInput() {
      batchSizeInput.value = getBatchSize();
      batchSizeInput.addEventListener('change', () => {
        setBatchSize(batchSizeInput.value);
      });
    }

    async function fetchAllImages() {
      console.log('Starting to fetch all images');
      const apiToken = localStorage.getItem('chatgpt_api_token');
      // const teamId = localStorage.getItem('chatgpt_team_id'); // Team ID will be passed in headers by fetchBatch

      if (!apiToken) {
        console.error('No API token found');
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
          await fetchBatch();
          totalImagesEl.textContent = totalImagesLoaded;
        }
        loadingIndicator.classList.add('hidden');
        summaryStats.classList.remove('hidden');
        totalImagesEl.textContent = totalImagesLoaded;
        console.log('All images fetched. Total:', totalImagesLoaded);
      }
      fetchAndRender();
    }

    async function fetchBatch() {
      console.log('Fetching batch starting with after:', currentCursor);
      if (isLoading) {
        console.log('Already loading, waiting for completion');
        return;
      }
      const apiToken = localStorage.getItem('chatgpt_api_token');
      const teamId = localStorage.getItem('chatgpt_team_id'); // Get team ID

      if (!apiToken) {
        console.error('No API token found');
        return;
      }
      isLoading = true;
      console.log('Set isLoading to true');

      try {
        const batchSize = getBatchSize();
        const url = '/api/images' + (currentCursor ? '?after=' + encodeURIComponent(currentCursor) : '');
        const urlObj = new URL(url, window.location.origin);
        urlObj.searchParams.set('limit', batchSize);
        console.log('Fetch URL:', urlObj.toString());

        const headers = { 'x-api-token': apiToken };
        if (teamId && teamId.trim() !== "") {
          headers['x-team-id'] = teamId; // Add team ID to request to our backend
          console.log('Sending x-team-id:', teamId);
        } else {
          console.log('No team ID to send, fetching for personal account.');
        }

        const response = await fetch(urlObj.toString(), { headers });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error structure' }));
          const errorMessageText = errorData.error || ('Error: ' + response.status + ' ' + response.statusText);
          throw new Error(response.status === 401
            ? 'Invalid API token or unauthorized for the specified account. Please check and try again.'
            : errorMessageText);
        }

        const data = await response.json();
        console.log('Batch received with', data.items ? data.items.length : 0, 'images');
        currentCursor = data.cursor || null;
        hasMoreImages = !!currentCursor && data.items && data.items.length > 0;
        console.log('New cursor:', currentCursor, 'Has more images:', hasMoreImages);

        if (data.items && data.items.length > 0) {
          displayImages(data.items);
          totalImagesLoaded += data.items.length;
        } else {
          hasMoreImages = false;
        }
      } catch (error) {
        console.error('Error fetching images:', error);
        showError(error.message || 'Error loading images. Please try again later.');
        hasMoreImages = false;
      } finally {
        isLoading = false;
        console.log('Set isLoading to false');
      }
    }

    function displayImages(images) {
      console.log('Displaying', images.length, 'images');
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
            console.warn('Thumbnail failed, fallback to original:', image.url);
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

    function openModal(imageSrc, imageTitle) {
      console.log('Opening modal with image:', imageSrc);
      modalImage.src = imageSrc;
      modalImage.alt = imageTitle;
      modalTitle.textContent = imageTitle;
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function showError(message) {
      console.error('Error:', message);
      errorMessage.textContent = message;
      errorMessage.classList.remove('hidden');
    }

    function hideError() {
      errorMessage.classList.add('hidden');
    }

    function showNotification() {
      notification.classList.add('translate-x-0');
      notification.classList.remove('translate-x-full');
      setTimeout(() => {
        notification.classList.add('translate-x-full');
        notification.classList.remove('translate-x-0');
      }, 3000);
    }

    function init() {
      console.log('Initializing app...');
      const apiToken = localStorage.getItem('chatgpt_api_token');
      const teamId = localStorage.getItem('chatgpt_team_id'); // Load team ID

      if (apiToken) {
        console.log('Found stored token');
        tokenInput.value = apiToken; // Pre-fill token
        if (teamId) {
          teamIdInput.value = teamId; // Pre-fill team ID
          console.log('Found stored team ID:', teamId);
        }

        try {
          const decoded = parseJwt(apiToken); // Validate only the token part
          if (decoded && decoded.exp) {
            const expirationTime = decoded.exp * 1000;
            const currentTime = Date.now();
            if (currentTime >= expirationTime) {
              console.warn('Token expired');
              showError('Your saved token has expired. Please log in to ChatGPT again to get a new token.');
              galleryEl.innerHTML = '<div class="col-span-full bg-white rounded-lg shadow p-10 text-center text-gray-600">Enter a valid API token to view your images</div>';
              loadingIndicator.classList.add('hidden');
              return;
            }
          }
        } catch (e) {
          console.warn('Could not check token expiration:', e);
        }
        console.log('Token seems okay, starting to fetch images');
        setTimeout(fetchAllImages, 100);
      } else {
        console.log('No token found');
        galleryEl.innerHTML = '<div class="col-span-full bg-white rounded-lg shadow p-10 text-center text-gray-600">Enter your API token to view your images</div>';
        loadingIndicator.classList.add('hidden');
      }

      console.log('Setting up event listeners');
      saveSettingsBtn.addEventListener('click', () => {
        console.log('Save settings clicked');
        const rawToken = tokenInput.value.trim();
        const newTeamId = teamIdInput.value.trim(); // Get team ID

        const tokenToValidate = rawToken.startsWith('Bearer ')
          ? rawToken.substring(7).trim()
          : rawToken;

        console.log('Validating token');
        const validationResult = validateToken(tokenToValidate); // Validate the actual token part

        if (!validationResult.success) {
          showError(validationResult.error);
          return;
        }

        console.log('Token valid, saving');
        localStorage.setItem('chatgpt_api_token', tokenToValidate); // Save the actual token
        if (newTeamId) {
          localStorage.setItem('chatgpt_team_id', newTeamId);
          console.log('Saved team ID:', newTeamId);
        } else {
          localStorage.removeItem('chatgpt_team_id'); // Clear team ID if empty
          console.log('Cleared team ID');
        }

        showNotification();
        hideError();
        fetchAllImages();
      });

      downloadBtn.addEventListener('click', () => {
        console.log('Download clicked');
        const imageSrc = modalImage.src;
        const imageTitle = modalTitle.textContent || 'image';
        const tempLink = document.createElement('a');
        tempLink.href = imageSrc;
        tempLink.download = imageTitle.replace(/[^a-z0-9_\\-\\.]/gi, '_') + '.jpg'; // Sanitize filename
        document.body.appendChild(tempLink);
        tempLink.click();
        document.body.removeChild(tempLink);
      });

      closeModalBtn.addEventListener('click', () => {
        console.log('Close modal clicked');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          console.log('Clicked outside modal');
          modal.classList.add('hidden');
          modal.classList.remove('flex');
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
          console.log('Escape key pressed');
          modal.classList.add('hidden');
          modal.classList.remove('flex');
        }
      });

      tokenInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          console.log('Enter key pressed in token input');
          saveSettingsBtn.click();
        }
      });
      teamIdInput.addEventListener('keydown', (e) => { // Enter key for team ID input
        if (e.key === 'Enter') {
          console.log('Enter key pressed in team ID input');
          saveSettingsBtn.click();
        }
      });

      console.log('Initialization complete');
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  </script>
</body>
</html>`;
}
