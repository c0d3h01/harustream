import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
import { scopeLogger } from '@/lib/log';

// Server-side plan for turning an MKV (or any non-browser-playable source)
// into a fragmented MP4 stream the browser can feed to MediaSource.

const log = scopeLogger('transcode');

// Resolve the ffmpeg binary to use. Precedence:
//   1. FFMPEG_PATH env override
//   2. the bundled ffmpeg-static binary (downloaded at install; ships with
//      the deployment so /api/play works on Vercel, whose serverless runtime
//      has no system ffmpeg)
//   3. ffmpeg on PATH (local dev / self-hosted runtimes)
function resolveFfmpeg(): string {
  const override = process.env.FFMPEG_PATH?.trim();
  if (override) return override;
  if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic;
  return 'ffmpeg';
}

export const ffmpegBinary = resolveFfmpeg();

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

// ffmpeg's `-i` header dump (stderr) carries everything the plan needs:
// duration plus the codec/profile of the first video and audio tracks. Only
// the input header section (before "Stream mapping:") describes the source —
// the rest describes the output encode and must be ignored.
function parseProbeOutput(stderr: string): { streams: ProbeStream[]; duration?: number } | null {
  const header = stderr.split('Stream mapping:')[0];

  const durationMatch = header.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = durationMatch
    ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
    : undefined;

  const streams: ProbeStream[] = [];
  for (const line of header.split('\n')) {
    // "Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), ..."
    const video = line.match(/Stream #\d+:\d+.*?\bVideo:\s*(\w+)(?:\s+\(([^)]+)\))?/);
    if (video) {
      streams.push({ codec_type: 'video', codec_name: video[1], profile: video[2] });
      continue;
    }
    // "Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, ..."
    const audio = line.match(/Stream #\d+:\d+.*?\bAudio:\s*(\w+)/);
    if (audio) {
      streams.push({ codec_type: 'audio', codec_name: audio[1] });
    }
  }

  if (streams.length === 0) return null;
  return { streams, duration };
}

// Probe a URL with the ffmpeg binary itself (opening the input with `-t 0`
// reads only the stream header, not the file) and return parsed stream info.
// Any failure resolves to null so callers can fall back to a full transcode.
async function probeUrl(url: string, signal?: AbortSignal): Promise<ProbeResult | null> {
  return new Promise((resolve) => {
    const child = spawn(ffmpegBinary, ['-hide_banner', '-i', url, '-t', '0', '-f', 'null', '-'], {
      stdio: ['ignore', 'ignore', 'pipe'],
      signal,
    });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      log.warn({ url }, 'ffmpeg probe timed out after 15s');
      resolve(null);
    }, 15000);
    child.stderr.on('data', (d) => {
      stderr += String(d);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      log.warn({ url, binary: ffmpegBinary, error: error.message }, 'ffmpeg probe failed to start');
      resolve(null);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        log.warn({ url, code }, 'ffmpeg probe exited non-zero');
        resolve(null);
        return;
      }
      const parsed = parseProbeOutput(stderr);
      if (!parsed) {
        log.warn({ url }, 'ffmpeg probe returned no stream info');
        resolve(null);
        return;
      }
      resolve({
        streams: parsed.streams,
        format: parsed.duration != null ? { duration: String(parsed.duration) } : undefined,
      });
    });
  });
}

const AVC_PROFILE_IDC: Record<string, [string, string]> = {
  'Constrained Baseline': ['42', '40'],
  Baseline: ['42', '00'],
  Main: ['4d', '00'],
  High: ['64', '00'],
};

// Build the avc1.PPCCLL codec string from the probe output. Returns null when
// the stream's profile isn't safe to play via MSE in modern browsers.
function avcCodec(v: ProbeStream): string | null {
  const entry = v.profile ? AVC_PROFILE_IDC[v.profile] : undefined;
  if (!entry) return null;
  // ffmpeg's input header doesn't report the H.264 bitstream level, so fall
  // back to 4.0 (1080p30) — a conservative level declaration that MSE
  // accepts and still decodes real content declared at higher levels through.
  const level = v.level && v.level > 0 ? Math.min(255, Math.round(v.level)) : 40;
  const ll = level.toString(16).padStart(2, '0');
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
      binary: ffmpegBinary,
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
