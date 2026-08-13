import { app } from '@azure/functions';

const CHANNEL_ID = 'UC_2o4dV4dCBxhmNOUYlum1w';
const UPLOADS_PLAYLIST_ID = `UU${CHANNEL_ID.slice(2)}`;
const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';
const CACHE_MS = 5 * 60 * 1000;

let cached = null;

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(process.env.ALLOWED_ORIGINS || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'public, max-age=300',
    Vary: 'Origin',
  };
  if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

async function youtube(path, params, apiKey) {
  const url = new URL(`${YOUTUBE_API}/${path}`);
  for (const [name, value] of Object.entries({ ...params, key: apiKey })) {
    url.searchParams.set(name, value);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`YouTube ${path} responded ${response.status}`);
  return response.json();
}

function startedAt(video) {
  return Date.parse(video.liveStreamingDetails?.actualStartTime || video.snippet?.publishedAt || 0);
}

export function selectVideo(videos) {
  const live = videos.find((video) => video.snippet?.liveBroadcastContent === 'live');
  if (live) return { video: live, state: 'live' };

  const completed = videos
    .filter((video) => video.liveStreamingDetails?.actualEndTime)
    .sort((left, right) => startedAt(right) - startedAt(left));
  return completed.length ? { video: completed[0], state: 'recorded' } : null;
}

export async function resolveVideo(apiKey) {
  const playlist = await youtube('playlistItems', {
    part: 'contentDetails',
    playlistId: UPLOADS_PLAYLIST_ID,
    maxResults: '25',
  }, apiKey);
  const ids = (playlist.items || [])
    .map((item) => item.contentDetails?.videoId)
    .filter(Boolean);
  if (!ids.length) throw new Error('YouTube uploads playlist was empty');

  const details = await youtube('videos', {
    part: 'snippet,liveStreamingDetails',
    id: ids.join(','),
  }, apiKey);
  const selected = selectVideo(details.items || []);
  if (!selected) throw new Error('YouTube returned no live or completed streams');

  return {
    videoId: selected.video.id,
    title: selected.video.snippet.title,
    state: selected.state,
  };
}

export async function youtubeHandler(request, context) {
  const headers = corsHeaders(request);
  if (request.method === 'OPTIONS') return { status: 204, headers };

  try {
    if (cached && cached.expiresAt > Date.now()) {
      return { status: 200, jsonBody: cached.value, headers };
    }
    if (!process.env.YOUTUBE_API_KEY) {
      return { status: 503, jsonBody: { message: 'YouTube is not configured.' }, headers };
    }

    const value = await resolveVideo(process.env.YOUTUBE_API_KEY);
    cached = { value, expiresAt: Date.now() + CACHE_MS };
    context.log(JSON.stringify({ event: 'youtube', ...value }));
    return { status: 200, jsonBody: value, headers };
  } catch (error) {
    context.error('youtube lookup failed', error && error.stack ? error.stack : String(error));
    return { status: 502, jsonBody: { message: 'YouTube is temporarily unavailable.' }, headers };
  }
}

app.http('youtube', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'youtube',
  handler: youtubeHandler,
});