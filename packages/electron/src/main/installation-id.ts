import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** OAuth installation identity is machine-local and independent of the synced dataset. */
export function getInstallationId(userData: string): string {
  const filePath = path.join(userData, "installation-id");
  const read = () => {
    const id = fs.readFileSync(filePath, "utf8").trim();
    if (!UUID.test(id)) throw new Error("The saved Todu installation ID is invalid");
    return id;
  };
  try {
    return read();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  fs.mkdirSync(userData, { recursive: true });
  const id = randomUUID();
  try {
    fs.writeFileSync(filePath, `${id}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return read();
    throw error;
  }
  return id;
}
