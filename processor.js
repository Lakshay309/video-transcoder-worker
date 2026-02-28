import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
// import ffmpegPath from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobe.path);

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const VARIANTS = [
  { name: "360p", width: 640, height: 360, bitrate: "800k" },
  { name: "480p", width: 854, height: 480, bitrate: "1400k" },
  { name: "720p", width: 1280, height: 720, bitrate: "2800k" },
  { name: "1080p", width: 1920, height: 1080, bitrate: "5000k" },
];

export async function processVideo(bucket, key) {
  console.log("Processing:", key);

  const tempDir = path.join("tmp", Date.now().toString());
  fs.mkdirSync(tempDir, { recursive: true });

  const inputPath = path.join(tempDir, "input.mp4");

  const object = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );

  await new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(inputPath);
    object.Body.pipe(writeStream)
      .on("finish", resolve)
      .on("error", reject);
  });

  const metadata = await new Promise((resolve, reject) => {
    ffmpeg(inputPath).ffprobe((err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });

  const videoStream = metadata.streams.find(s => s.width);
  if (!videoStream) throw new Error("No video stream found");

  const originalWidth = videoStream.width;
  const originalHeight = videoStream.height;

  const allowedVariants = VARIANTS.filter(
    v => v.width <= originalWidth && v.height <= originalHeight
  );

  if (allowedVariants.length === 0) {
    throw new Error("No valid output resolutions");
  }

  const baseName = key.replace(/\.[^/.]+$/, "");
  let masterContent = "#EXTM3U\n";

  for (const variant of allowedVariants) {
    const variantDir = path.join(tempDir, variant.name);
    fs.mkdirSync(variantDir);

    console.log("Generating:", variant.name);

    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec("libx264")
        .size(`${variant.width}x${variant.height}`)
        .videoBitrate(variant.bitrate)
        .outputOptions([
          "-preset veryfast",
          "-g 48",
          "-sc_threshold 0",
          "-hls_time 6",
          "-hls_playlist_type vod",
        ])
        .output(path.join(variantDir, "index.m3u8"))
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    const files = fs.readdirSync(variantDir);

    for (const file of files) {
      const fullPath = path.join(variantDir, file);

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: `${baseName}/${variant.name}/${file}`,
          Body: fs.createReadStream(fullPath),
        })
      );
    }

    fs.rmSync(variantDir, { recursive: true, force: true });

    masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bitrate.replace("k", "000")},RESOLUTION=${variant.width}x${variant.height}\n`;
    masterContent += `${variant.name}/index.m3u8\n`;
  }

  const masterPath = path.join(tempDir, "master.m3u8");
  fs.writeFileSync(masterPath, masterContent);

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: `${baseName}/master.m3u8`,
      Body: fs.createReadStream(masterPath),
    })
  );

  fs.rmSync(tempDir, { recursive: true, force: true });

  const outputUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${baseName}/master.m3u8`;

  return outputUrl;
}