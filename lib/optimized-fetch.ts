'use client';

// Request deduplication and caching for improved performance
const requestCache = new Map<string, Promise<any>>();
const responseCache = new Map<string, { data: any; timestamp: number }>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(url: string, options: RequestInit = {}): string {
  const method = options.method || 'GET';
  const body = options.body ? JSON.stringify(options.body) : '';
  return `${method}:${url}:${body}`;
}

function isExpired(timestamp: number): boolean {
  return Date.now() - timestamp > CACHE_TTL;
}

export async function optimizedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const cacheKey = getCacheKey(url, options);

  // Check if request is already in flight
  if (requestCache.has(cacheKey)) {
    const cachedRequest = requestCache.get(cacheKey);
    if (cachedRequest) {
      return cachedRequest;
    }
  }

  // Check response cache for GET requests
  if (!options.method || options.method === 'GET') {
    const cached = responseCache.get(cacheKey);
    if (cached && !isExpired(cached.timestamp)) {
      return new Response(JSON.stringify(cached.data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Create optimized fetch request
  const requestPromise = fetch(url, {
    ...options,
    keepalive: true, // Keep connection alive for better performance
  }).then(async (response) => {
    // Cache successful GET responses
    if (response.ok && (!options.method || options.method === 'GET')) {
      try {
        const data = await response.clone().json();
        responseCache.set(cacheKey, {
          data,
          timestamp: Date.now()
        });

        // Cleanup old cache entries
        if (responseCache.size > 100) {
          const entries = Array.from(responseCache.entries());
          entries
            .filter(([, value]) => isExpired(value.timestamp))
            .forEach(([key]) => responseCache.delete(key));
        }
      } catch {
        // Ignore caching for non-JSON responses
      }
    }

    return response;
  }).finally(() => {
    // Remove from in-flight cache
    requestCache.delete(cacheKey);
  });

  // Store in-flight request
  requestCache.set(cacheKey, requestPromise);

  return requestPromise;
}

// Enhanced fetch with better error handling and retries
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 2
): Promise<Response> {
  let lastError: Error | undefined;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      const response = await optimizedFetch(url, options);

      // Return successful responses
      if (response.ok) {
        return response;
      }

      // Don't retry on client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Retry on server errors (5xx) or network issues
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);

    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Network error');

      // Don't retry on abort or timeout
      if (lastError.name === 'AbortError') {
        throw lastError;
      }
    }

    // Wait before retry (exponential backoff)
    if (i < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }

  throw lastError || new Error('Unknown error occurred');
}