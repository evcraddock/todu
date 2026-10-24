import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const electronDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(electronDir, "build/icon-source.png");
const output = path.join(electronDir, "build/icons");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "todu-icons-"));
const iconset = path.join(temporary, "todu.iconset");
fs.mkdirSync(iconset);
fs.mkdirSync(output, { recursive: true });
try {
  for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) {
    execFileSync("sips", ["-z", String(size), String(size), source, "--out", path.join(output, `${size}x${size}.png`)], { stdio: "ignore" });
  }
  fs.copyFileSync(path.join(output, "1024x1024.png"), path.join(output, "icon.png"));
  fs.copyFileSync(path.join(output, "icon.png"), path.join(electronDir, "resources/app-icon.png"));
  for (const size of [16, 32, 128, 256, 512]) {
    fs.copyFileSync(path.join(output, `${size}x${size}.png`), path.join(iconset, `icon_${size}x${size}.png`));
    fs.copyFileSync(path.join(output, `${size * 2}x${size * 2}.png`), path.join(iconset, `icon_${size}x${size}@2x.png`));
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", path.join(output, "icon.icns")]);
  // Modern Windows icons can store PNG images directly in the ICO container.
  const sizes = [16, 32, 48, 64, 128, 256];
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  const images = sizes.map((size, index) => {
    const image = fs.readFileSync(path.join(output, `${size}x${size}.png`));
    const entry = 6 + index * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
    return image;
  });
  fs.writeFileSync(path.join(output, "icon.ico"), Buffer.concat([header, ...images]));
  console.log("Generated desktop PNG, ICNS, and ICO assets.");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
