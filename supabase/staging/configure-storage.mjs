import { stagingClient, unwrap } from "./lib.mjs";

const { client } = stagingClient();
const requiredBuckets = [
  { id: "documents", name: "documents", public: false, fileSizeLimit: 50 * 1024 * 1024 },
  { id: "backup-archives", name: "backup-archives", public: false, fileSizeLimit: 50 * 1024 * 1024 },
];

const existing = unwrap(await client.storage.listBuckets(), "list storage buckets");
for (const bucket of requiredBuckets) {
  const current = existing.find((item) => item.id === bucket.id || item.name === bucket.name);
  if (!current) {
    unwrap(await client.storage.createBucket(bucket.id, {
      public: false,
      fileSizeLimit: bucket.fileSizeLimit,
    }), `create ${bucket.id}`);
  } else {
    unwrap(await client.storage.updateBucket(bucket.id, {
      public: false,
      fileSizeLimit: bucket.fileSizeLimit,
    }), `harden ${bucket.id}`);
  }
  console.log(`${bucket.id}: CONFIGURED PRIVATE`);
}
