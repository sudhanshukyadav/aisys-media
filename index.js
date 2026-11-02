// Whitelist: strictly images and videos only
const ALLOWED_EXTENSIONS = new Map([
  // Images
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['bmp', 'image/bmp'],
  ['gif', 'image/gif'],
  // Videos
  ['mp4', 'video/mp4'],
  ['mkv', 'video/x-matroska'],
  ['mov', 'video/quicktime'],
  ['avi', 'video/x-msvideo'],
  ['webm', 'video/webm'],
  ['m4v', 'video/x-m4v']
]);

const VALID_CATEGORIES = new Set(['SNAPSHOTS', 'MOTION']);
const MEDIA_AUTH_SECRET = 'aisys-media-secret-key'; // Change to your preferred secret

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    }

    // Upload endpoint: PUT /upload/:locationCode/:category/:camName/:fileName
    if (url.pathname.startsWith('/upload/') && request.method === 'PUT') {
      // 1. Verify Authentication Token
      const token = request.headers.get('x-media-token');
      if (token !== MEDIA_AUTH_SECRET) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }

      // 2. Parse URL path parts
      // Path format: /upload/<LOCATIONCODE>/<CATEGORY>/<CAMNAME>/<FILENAME>
      const pathSegments = url.pathname.slice('/upload/'.length).split('/');
      if (pathSegments.length < 4) {
        return jsonResponse({
          error: 'Invalid path. Expected format: /upload/:locationCode/:category/:camName/:fileName'
        }, 400);
      }

      const locationCode = decodeURIComponent(pathSegments[0]).trim().toUpperCase();
      const category = decodeURIComponent(pathSegments[1]).trim().toUpperCase();
      const camName = decodeURIComponent(pathSegments[2]).trim().toUpperCase();
      const fileName = decodeURIComponent(pathSegments.slice(3).join('/'));

      // 3. Verify category is strictly SNAPSHOTS or MOTION
      if (!VALID_CATEGORIES.has(category)) {
        return jsonResponse({
          error: `Invalid category '${category}'. Only 'SNAPSHOTS' and 'MOTION' are accepted.`
        }, 400);
      }

      // 4. Verify file extension is strictly an image or video
      const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : null;

      if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
        return jsonResponse({
          error: `File rejected. '${fileName}' is not an authorized image or video format.`
        }, 415);
      }

      const contentType = ALLOWED_EXTENSIONS.get(ext);

      // 5. Construct target R2 Object Key (matches S: folder hierarchy)
      const r2Key = `${locationCode}/${category}/${camName}/${fileName}`;

      try {
        // Stream directly into R2
        await env.MEDIA_BUCKET.put(r2Key, request.body, {
          httpMetadata: {
            contentType: contentType
          },
          customMetadata: {
            uploadedAt: new Date().toISOString(),
            locationCode,
            category,
            camName
          }
        });

        return jsonResponse({
          status: 'success',
          key: r2Key,
          contentType
        }, 201);
      } catch (err) {
        return jsonResponse({
          error: 'Failed to write to R2 bucket',
          details: err.message
        }, 500);
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
