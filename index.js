import dotenv from "dotenv";
dotenv.config();

import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";

import {
  S3Client,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

import { updateVideo } from "./db.js";
import { processVideo } from "./processor.js";

const sqs = new SQSClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

function isValidS3Event(body) {
  return (
    body?.Records &&
    Array.isArray(body.Records) &&
    body.Records[0]?.s3
  );
}

async function deleteMessage(message) {
  await sqs.send(
    new DeleteMessageCommand({
      QueueUrl: process.env.SQS_URL,
      ReceiptHandle: message.ReceiptHandle,
    })
  );
}


async function poll() {
  while (true) {
    try {
      const data = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: process.env.SQS_URL,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20,
        })
      );

      if (!data.Messages) continue;

      for (const message of data.Messages) {
        try {
          const body = JSON.parse(message.Body);

          if (!isValidS3Event(body)) {
            await deleteMessage(message);
            continue;
          }

          const record = body.Records[0];
          const bucket = record.s3.bucket.name;
          const key = record.s3.object.key;

          const outputUrl = await processVideo(bucket, key);

          await updateVideo(key, outputUrl);

          await s3.send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: key,
            })
          );

          await deleteMessage(message);

          console.log("Success:", key);

        } catch (err) {
          console.error("Message Processing Error:", err);
        }
      }

    } catch (err) {
      console.error("Polling Loop Error:", err);
    }
  }
}
poll();