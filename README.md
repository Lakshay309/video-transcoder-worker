# 🎬 Distributed Video Transcoding Worker

> High-performance, event-driven video transcoding worker built with **Node.js + FFmpeg**.

This service consumes video processing jobs from **Amazon SQS**, transcodes videos into **multi-variant HLS (adaptive bitrate)** format, uploads them to **private S3**, and updates processing status in **Neon Postgres**.

Designed to run in **Docker + ECS Fargate** with autoscaling.

---

## 🏗 Architecture Overview
```
Client Upload
      ↓
S3 (Temp Bucket)
      ↓
S3 ObjectCreated Event
      ↓
SQS Queue
      ↓
Video Worker (this service)
      ↓
FFmpeg HLS Transcoding
      ↓
S3 (Private Main Bucket)
      ↓
CloudFront (OAC)
      ↓
Playback
```

---

## 🚀 Features

- ✅ Event-driven processing via SQS
- ✅ Multi-variant HLS output: 360p, 480p, 720p, 1080p
- ✅ No upscaling (variants generated only if source allows)
- ✅ Disk-safe processing (per-variant upload + cleanup)
- ✅ Private S3 storage
- ✅ CloudFront secure distribution (OAC)
- ✅ Neon Postgres job status tracking
- ✅ Horizontal scaling ready (ECS + SQS depth-based autoscaling)

---

## 📦 Tech Stack

| Layer           | Technology          |
|-----------------|---------------------|
| Runtime         | Node.js             |
| Transcoding     | FFmpeg              |
| Queue           | AWS SQS             |
| Storage         | AWS S3              |
| CDN             | AWS CloudFront (OAC)|
| Database        | Neon Postgres       |
| Containerization| Docker              |
| Deployment      | ECS Fargate         |

---

## 🧠 Transcoding Strategy

For each video job, the worker follows this pipeline:

1. **Download** video from the temporary S3 bucket
2. **Probe** source video resolution
3. **Determine** allowed variants (no upscaling)
4. **Transcode** each variant using FFmpeg
5. **Upload** variant segments to private S3
6. **Cleanup** local files immediately after upload
7. **Generate** master HLS playlist
8. **Update** job status in the database

---

## 📁 S3 Output Structure
```
videos/{videoId}/
├── master.m3u8
├── 360p/
│   ├── index.m3u8
│   └── segment_000.ts
├── 480p/
│   ├── index.m3u8
│   └── segment_000.ts
├── 720p/
│   ├── index.m3u8
│   └── segment_000.ts
└── 1080p/
    ├── index.m3u8
    └── segment_000.ts
```

---

## ⚙️ Environment Variables

Create a `.env` file in the project root:
```env
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

SQS_QUEUE_URL=

TEMP_S3_BUCKET=
MAIN_S3_BUCKET=

DATABASE_URL=

FFMPEG_PATH=/usr/bin/ffmpeg
```

> ⚠️ In production, use **IAM Roles** instead of hardcoded access keys.

---

## 🐳 Docker

**Build the image:**
```bash
docker build -t video-worker .
```

**Run locally:**
```bash
docker run --env-file .env video-worker
```

---

## 🔄 Worker Flow
```
while(true):
    poll SQS (long polling)
    if message received:
        process video
        delete message from queue
```

- Long polling enabled for efficiency
- Safe retry handling built-in
- Idempotent processing recommended

---

## 📊 Scaling Strategy

This worker is designed to **scale horizontally** on ECS Fargate.

| Setting              | Recommendation                              |
|----------------------|---------------------------------------------|
| Autoscaling Metric   | `SQS ApproximateNumberOfMessagesVisible`    |
| Tasks per batch      | 1 task per ~3–5 concurrent transcodes       |
| Scale out trigger    | Queue depth increases                       |
| Scale in trigger     | Queue drains                                |
| Ephemeral storage    | 20 GB+ per task                             |
| Task type            | CPU optimized                               |

---

## 🛡 Failure Handling

- If processing fails:
  - Job is marked `FAILED` in the database
  - SQS message is left for retry or routed to DLQ

**Recommended SQS configuration:**
- Configure a **Dead Letter Queue (DLQ)**
- Set `maxReceiveCount` to prevent infinite retry loops

---

## 🧪 Local Testing

1. Upload a test video to the temp S3 bucket
2. Send a mock SQS message with the video metadata
3. Start the worker
4. Verify:
   - HLS files appear in the main S3 bucket
   - Database status is updated to `COMPLETED`
   - Playback works via CloudFront URL

---

## 🎯 Production Recommendations

- [ ] Use **IAM Roles** instead of hardcoded access keys
- [ ] Enable **S3 lifecycle policies** on the temp bucket
- [ ] Enable **CloudFront caching** for HLS segments
- [ ] Add **structured logging** (pino / winston)
- [ ] Add **ECS health checks**
- [ ] Add **CloudWatch metrics** for monitoring

---

## 📌 Future Improvements

- [ ] Thumbnail generation
- [ ] DRM support
- [ ] Parallel variant transcoding
- [ ] Priority queues
- [ ] Webhook callbacks on job completion
- [ ] HLS AES-128 encryption

---

## 👨‍💻 Author

**Lakshay Kamboj**

Built as part of a distributed video processing system.
