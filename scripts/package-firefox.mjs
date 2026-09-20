import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";

const { version } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url))
);
const output = new URL("../.output/", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("firefox-mv3/manifest.json", output))
);
if (
  manifest.version !== version ||
  manifest.manifest_version !== 3 ||
  !manifest.sidebar_action ||
  !manifest.background?.scripts ||
  manifest.background.service_worker ||
  manifest.side_panel ||
  manifest.permissions.includes("sidePanel")
) {
  throw new Error("Invalid Firefox manifest; refusing to package.");
}
const name = `flow-translate-${version}-firefox-unsigned.zip`;
await rename(
  new URL(`flow-translate-${version}-firefox.zip`, output),
  new URL(name, output)
);
const hash = createHash("sha256")
  .update(await readFile(new URL(name, output)))
  .digest("hex");
await writeFile(new URL(`${name}.sha256`, output), `${hash}  ${name}\n`);
console.log(`Unsigned Firefox developer package: .output/${name}`);
