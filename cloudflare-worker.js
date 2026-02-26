// Purelyd-SC Cloudflare Worker
// Proxies requests to Official SoundCloud API (api.soundcloud.com)

const SC_CLIENT_ID = 'FqfkxJZWPZt411KWUg3pxbwm43M6UalQ';
const SC_API_BASE = 'https://api.soundcloud.com';

const WORKER_CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: WORKER_CORS_HEADERS });
        }

        const url = new URL(request.url);

        try {
            if (url.pathname === '/search') {
                const query = url.searchParams.get('q');
                if (!query) return jsonResponse({ error: 'Missing query' }, 400);
                return handleSearch(query);
            }

            if (url.pathname === '/stream') {
                const trackId = url.searchParams.get('id');
                if (!trackId) return jsonResponse({ error: 'Missing track ID' }, 400);
                return handleStream(trackId, request);
            }

            if (url.pathname === '/trending') {
                return handleTrending(url.searchParams.get('genre'));
            }

            if (url.pathname === '/resolve') {
                const scUrl = url.searchParams.get('url');
                if (!scUrl) return jsonResponse({ error: 'Missing url' }, 400);
                return handleResolve(scUrl);
            }

            return jsonResponse({
                routes: [
                    '/search?q=QUERY',
                    '/stream?id=TRACK_ID',
                    '/trending?genre=GENRE (optional)',
                    '/resolve?url=SC_PERMALINK_URL'
                ]
            }, 200);

        } catch (error) {
            console.error("Worker Error:", error);
            return jsonResponse({ error: 'Internal Server Error', details: error.message }, 500);
        }
    }
};

// --- Helpers ---

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: {
            'Content-Type': 'application/json',
            ...WORKER_CORS_HEADERS
        }
    });
}

function mapSCTrackToPurelyd(track) {
    return {
        id: 'sc-' + track.id,
        title: track.title || "Unknown Title",
        artist: track.user?.username || "SoundCloud User",
        url: track.permalink_url,
        cover: track.artwork_url ? track.artwork_url.replace('large', 't500x500') : (track.user?.avatar_url || ""),
        type: 'soundcloud',
        durationMs: track.duration,
        streamable: track.streamable
    };
}

// --- Endpoints ---

async function handleSearch(query) {
    // Official API: /tracks?q=query&client_id=...&limit=20
    const targetUrl = `${SC_API_BASE}/tracks?q=${encodeURIComponent(query)}&client_id=${SC_CLIENT_ID}&limit=20&linked_partitioning=1`;

    const response = await fetch(targetUrl);
    if (!response.ok) {
        return jsonResponse({ error: 'SoundCloud API error', status: response.status }, response.status);
    }

    const data = await response.json();
    const tracks = (data.collection || []).filter(t => t.kind === 'track' && t.streamable);

    const results = tracks.map(mapSCTrackToPurelyd);

    return jsonResponse({
        status: 'ok',
        source: 'soundcloud_official',
        results: results
    });
}

async function handleStream(trackId, request) {
    // To stream a track in official API: /tracks/{id}/stream?client_id=...
    // This endpoint usually returns a 302 redirect to the actual MP3 file.
    // We will fetch it, grab the redirect Location, and either return it or pipe it.

    const targetUrl = `${SC_API_BASE}/tracks/${trackId}/stream?client_id=${SC_CLIENT_ID}`;

    // We fetch without following redirects to grab the raw MP3 URL
    const response = await fetch(targetUrl, { redirect: 'manual' });

    if (response.status === 302 || response.status === 301 || response.status === 303) {
        const streamUrl = response.headers.get('Location');
        if (streamUrl) {
            // Option 1: Just redirect the client to the MP3 URL
            return new Response(null, {
                status: 302,
                headers: {
                    'Location': streamUrl,
                    ...WORKER_CORS_HEADERS
                }
            });

            // Option 2 (Proxying): 
            // const audioResp = await fetch(streamUrl, { headers: { Range: request.headers.get('Range') || 'bytes=0-' }});
            // return new Response(audioResp.body, { status: audioResp.status, headers: { ...audioResp.headers, ...WORKER_CORS_HEADERS } });
        }
    } else if (response.ok) {
        // Sometimes it returns JSON with the http_mp3_128_url directly depending on the API variant
        try {
            const data = await response.json();
            if (data.http_mp3_128_url) {
                return new Response(null, {
                    status: 302,
                    headers: { 'Location': data.http_mp3_128_url, ...WORKER_CORS_HEADERS }
                });
            }
        } catch (e) { }
    }

    return jsonResponse({ error: 'Track not streamable or not found' }, 404);
}

async function handleTrending(genre) {
    // Official API doesn't have a direct /charts endpoint like V2, but we can simulate it by:
    // /tracks?tags=...&order=hotness or similar.
    // Let's use a broad query sorted by plays or simply fetch highly rated recent tracks.
    // Alternatively, many devs use /tracks?tags=pop,hiphop&limit=40

    const tags = genre ? encodeURIComponent(genre) : 'pop,hiphop,electronic,reggaeton';
    const targetUrl = `${SC_API_BASE}/tracks?tags=${tags}&client_id=${SC_CLIENT_ID}&limit=40`; // some apis support &order=hotness

    const response = await fetch(targetUrl);
    if (!response.ok) {
        return jsonResponse({ error: 'SoundCloud API error', status: response.status }, response.status);
    }

    const data = await response.json();
    // Sort by playback count to simulate "Trending" if API didn't sort it
    let tracks = (Array.isArray(data) ? data : (data.collection || []))
        .filter(t => t.kind === 'track' && t.streamable);

    tracks.sort((a, b) => (b.playback_count || 0) - (a.playback_count || 0));

    const results = tracks.map(mapSCTrackToPurelyd);

    return jsonResponse({
        status: 'ok',
        source: 'soundcloud_official_trending',
        results: results
    });
}

async function handleResolve(scUrl) {
    // /resolve?url=...&client_id=...
    const targetUrl = `${SC_API_BASE}/resolve?url=${encodeURIComponent(scUrl)}&client_id=${SC_CLIENT_ID}`;

    const response = await fetch(targetUrl, { redirect: 'follow' });
    if (!response.ok) {
        return jsonResponse({ error: 'Could not resolve URL', status: response.status }, response.status);
    }

    const data = await response.json();
    if (data.kind === 'track') {
        return jsonResponse({
            status: 'ok',
            type: 'track',
            result: mapSCTrackToPurelyd(data)
        });
    } else if (data.kind === 'playlist') {
        const results = (data.tracks || []).filter(t => t.streamable).map(mapSCTrackToPurelyd);
        return jsonResponse({
            status: 'ok',
            type: 'playlist',
            count: results.length,
            results: results
        });
    }

    return jsonResponse({ error: 'Unsupported URL type', kind: data.kind }, 400);
}
