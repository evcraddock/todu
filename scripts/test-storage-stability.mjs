import { spawnSync } from "node:child_process";

const runs = Number(process.env.STORAGE_STABILITY_RUNS ?? "20");

if (!Number.isInteger(runs) || runs <= 0) {
  console.error("STORAGE_STABILITY_RUNS must be a positive integer");
  process.exit(1);
}

for (let index = 1; index <= runs; index += 1) {
  console.log(`\n[storage-stability] run ${index}/${runs}`);

  const result = spawnSync("npm", ["run", "test:all", "--", "packages/engine/src/storage.integration.test.ts"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`\n[storage-stability] passed ${runs}/${runs} runs`);
