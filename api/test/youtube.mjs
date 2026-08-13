const ORIGIN = 'https://ukccatholic.org';
process.env.ALLOWED_ORIGINS = ORIGIN;
delete process.env.YOUTUBE_API_KEY;

const apiCalls = [];
let videoItems = [];
globalThis.fetch = async (url) => {
  const parsed = new URL(url);
  apiCalls.push(parsed);
  if (parsed.pathname.endsWith('/playlistItems')) {
    return {
      ok: true,
      json: async () => ({
        items: videoItems.map((video) => ({ contentDetails: { videoId: video.id } })),
      }),
    };
  }
  return { ok: true, json: async () => ({ items: videoItems }) };
};

const { selectVideo, youtubeHandler } = await import('../src/functions/youtube.js');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
};

const request = (method = 'GET', origin = ORIGIN) => ({
  method,
  headers: new Headers({ origin }),
});
const context = { log: () => {}, error: () => {} };

const missing = await youtubeHandler(request(), context);
check('a missing API key is reported', missing.status === 503, String(missing.status));

const preflight = await youtubeHandler(request('OPTIONS'), context);
check('a preflight is answered', preflight.status === 204, String(preflight.status));
check('the parish origin is allowed', preflight.headers['Access-Control-Allow-Origin'] === ORIGIN);
const stranger = await youtubeHandler(request('OPTIONS', 'https://evil.example'), context);
check('an unknown origin is not allowed', !('Access-Control-Allow-Origin' in stranger.headers));

const upcoming = {
  id: 'upcoming',
  snippet: { title: 'Sunday Mass next week', liveBroadcastContent: 'upcoming' },
  liveStreamingDetails: { scheduledStartTime: '2026-08-23T15:00:00Z' },
};
const older = {
  id: 'older',
  snippet: { title: 'Sunday Mass last week', liveBroadcastContent: 'none' },
  liveStreamingDetails: {
    actualStartTime: '2026-08-02T17:00:00Z',
    actualEndTime: '2026-08-02T18:00:00Z',
  },
};
const latest = {
  id: 'latest',
  snippet: { title: 'Sunday Mass this week', liveBroadcastContent: 'none' },
  liveStreamingDetails: {
    actualStartTime: '2026-08-09T15:00:00Z',
    actualEndTime: '2026-08-09T16:00:00Z',
  },
};
const active = {
  id: 'active',
  snippet: { title: 'Sunday Mass live', liveBroadcastContent: 'live' },
  liveStreamingDetails: { actualStartTime: '2026-08-16T17:00:00Z' },
};

let selected = selectVideo([upcoming, older, latest]);
check('an upcoming stream is not selected', selected.video.id !== 'upcoming', selected.video.id);
check('the newest completed stream is selected', selected.video.id === 'latest', selected.video.id);
selected = selectVideo([upcoming, latest, active]);
check('an active livestream wins', selected.video.id === 'active', selected.video.id);
check('an active livestream is labeled live', selected.state === 'live', selected.state);

process.env.YOUTUBE_API_KEY = 'test-key';
videoItems = [upcoming, older, latest];
apiCalls.length = 0;
const resolved = await youtubeHandler(request(), context);
check('the resolver answers successfully', resolved.status === 200, String(resolved.status));
check('the response contains the latest completed stream', resolved.jsonBody.videoId === 'latest',
  resolved.jsonBody.videoId);
check('one playlist and one details call are made', apiCalls.length === 2, String(apiCalls.length));
check('the API key stays in the server request', apiCalls.every((url) => url.searchParams.get('key') === 'test-key'));

await youtubeHandler(request(), context);
check('a repeat request uses the cache', apiCalls.length === 2, String(apiCalls.length));

const failed = results.filter((result) => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);