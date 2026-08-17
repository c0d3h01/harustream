import { spawn } from 'node:child_process';
import { scopeLogger } from '@/lib/log';

// Server-side plan for turning an MKV (or any non-browser-playable source)
// into a fragmented MP4 stream the browser can feed to MediaSource.

const log = scopeLogger('transcode');

export type TranscodePlan = {
  args: string[];
  codec: string;
  kind: 'copy' | 'transcode';
  duration?: number;
};

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  level?: number;
  pixel_format?: string;
};

type ProbeResult = {
  streams?: ProbeStream[];
  format?: { duration?: string };
};

// ffprobe a URL (reads headers only, fast) and return parsed JSON. Any
// failure resolves to null so callers can fall back to a full transcode.
async function probeUrl(url: string, signal?: AbortSignal): Promise<ProbeResult | null> {
  return new Promise((resolve) => {
    const child = spawn(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_type,codec_name,profile,level,pixel_format',
        '-show_entries',
        'format=duration',
        '-of',
        'json',
        url,
      ],
      { stdio: ['ignore', 'pipe', 'ignore'], signal },
    );
    let out = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      log.warn({ url }, 'ffprobe timed out after 15s');
      resolve(null);
    }, 15000);
    child.stdout.on('data', (d) => {
      out += String(d);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      log.warn({ url, error: error.message }, 'ffprobe failed to start');
      resolve(null);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        log.warn({ url, code }, 'ffprobe exited non-zero');
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(out) as ProbeResult);
      } catch {
        log.warn({ url }, 'ffprobe returned invalid json');
        resolve(null);
      }
    });
  });
}

const AVC_PROFILE_IDC: Record<string, [string, string]> = {
  'Constrained Baseline': ['42', '40'],
  Baseline: ['42', '00'],
  Main: ['4d', '00'],
  High: ['64', '00'],
};

// Build the avc1.PPCCLL codec string from ffprobe output. Returns null when
// the stream's profile isn't safe to play via MSE in modern browsers.
function avcCodec(v: ProbeStream): string | null {
  const entry = v.profile ? AVC_PROFILE_IDC[v.profile] : undefined;
  if (!entry) return null;
  const level = v.level;
  if (level == null || level <= 0) return null;
  const ll = Math.min(255, Math.round(level)).toString(16).padStart(2, '0');
  return `avc1.${entry[0]}${entry[1]}${ll}`;
}

const AUDIO_CODEC: Record<string, string> = {
  aac: 'mp4a.40.2',
  mp3: 'mp4a.40.34',
  opus: 'opus',
  flac: 'fLaC',
};

// Decide how to convert `url` into playable fMP4. When the video track is
// H.264 and the audio track is AAC-LC (the common case for these releases)
// we can remux with `-c copy`, which runs near-realtime and loses nothing.
// Everything else is transcoded to H.264 + AAC so any browser can play it.
export async function planTranscode(
  url: string,
  start = 0,
  signal?: AbortSignal,
): Promise<TranscodePlan> {
  const probe = await probeUrl(url, signal);
  const video = probe?.streams?.find((s) => s.codec_type === 'video');
  const audio = probe?.streams?.find((s) => s.codec_type === 'audio');
  const duration = probe?.format?.duration ? Number(probe.format.duration) : undefined;

  log.debug(
    {
      url,
      videoCodec: video?.codec_name,
      audioCodec: audio?.codec_name,
      duration,
      probed: !!probe,
    },
    'transcode plan probed',
  );

  const baseArgs = ['-hide_banner', '-loglevel', 'error'];
  if (start > 0) baseArgs.push('-ss', String(start));

  const safeVideo = video ? avcCodec(video) : null;
  const safeAudio = audio ? AUDIO_CODEC[audio.codec_name ?? ''] : null;

  if (video && safeVideo && (!audio || safeAudio)) {
    log.info(
      { url, kind: 'copy', codec: `${safeVideo}${audio ? `,${safeAudio}` : ''}` },
      'plan: remux copy',
    );
    const codecParts = [safeVideo];
    if (audio && safeAudio) codecParts.push(safeAudio);
    return {
      kind: 'copy',
      codec: codecParts.join(','),
      duration,
      args: [
        ...baseArgs,
        '-i',
        url,
        '-map',
        '0:v:0',
        ...(audio ? ['-map', '0:a:0'] : []),
        '-c',
        'copy',
        // Raw ADTS AAC (typical for TS transport streams) needs converting
        // to ASC when remuxing into MP4, or the container muxer aborts.
        ...(audio?.codec_name === 'aac' ? ['-bsf:a', 'aac_adtstoasc'] : []),
        '-movflags',
        'frag_keyframe+empty_moov+default_base_moof',
        '-f',
        'mp4',
        'pipe:1',
      ],
    };
  }

  log.info(
    { url, kind: 'transcode', videoCodec: video?.codec_name, audioCodec: audio?.codec_name },
    'plan: full transcode',
  );
  return {
    kind: 'transcode',
    codec: 'avc1.640028,mp4a.40.2',
    duration,
    args: [
      ...baseArgs,
      '-i',
      url,
      '-map',
      '0:v:0',
      ...(audio ? ['-map', '0:a:0'] : []),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-profile:v',
      'high',
      ...(audio ? ['-c:a', 'aac', '-b:a', '192k', '-ac', '2'] : ['-an']),
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof',
      '-f',
      'mp4',
      'pipe:1',
    ],
  };
}
