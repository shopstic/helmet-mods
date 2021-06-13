import { walk, WalkEntry } from "https://deno.land/std@0.98.0/fs/mod.ts";
import { dirname, join } from "https://deno.land/std@0.98.0/path/mod.ts";

const tsFiles: WalkEntry[] = [];
const directories: WalkEntry[] = [];

for await (const entry of walk(".")) {
  if (entry.isFile && entry.name.endsWith(".ts")) {
    tsFiles.push(entry);
  } else if (entry.isDirectory && !entry.path.startsWith(".")) {
    directories.push(entry);
  }
}

tsFiles.sort((a, b) => a.path.length - b.path.length);
directories.sort((a, b) => a.path.length - b.path.length);

const tsFileRenamePairs: Array<[string, string]> = tsFiles.map((tsFile) => {
  const snakeCased = tsFile.name.replaceAll("-", "_");
  return [tsFile.name, snakeCased];
});

const dirRenamePairs: Array<[string, string]> = directories.map((dir) => {
  const snakeCased = dir.name.replaceAll("-", "_");
  return [dir.name, snakeCased];
});

const dirPathRenamePairs: Array<[string, string]> = [];

for (const dir of directories) {
  const oldPath = dirPathRenamePairs.reduce((p, [f, t]) => {
    if (p.startsWith(`${f}/`)) {
      return p.replace(`${f}/`, `${t}/`);
    }
    return p;
  }, dir.path);

  dirPathRenamePairs.push([oldPath, oldPath.replaceAll("-", "_")]);
}

for (const [fromPath, toPath] of dirPathRenamePairs) {
  const newParent = dirname(fromPath);
  await Deno.mkdir(newParent, { recursive: true });
  console.log("Rename", fromPath, toPath);
  await Deno.rename(fromPath, toPath);
}

const filePromises = tsFiles.map((tsFile) =>
  (async () => {
    const oldPath = join(
      dirname(tsFile.path).replaceAll("-", "_"),
      tsFile.name,
    );
    const newPath = tsFile.path.replaceAll("-", "_");

    console.log("Rename", oldPath, newPath);
    await Deno.rename(oldPath, newPath);

    const content = await Deno.readTextFile(newPath);
    const replaced1 = tsFileRenamePairs
      .reduce((c, [from, to]) => {
        return c.replaceAll(`${from}"`, `${to}"`);
      }, content);

    const replaced2 = dirRenamePairs
      .reduce((c, [from, to]) => {
        return c.replaceAll(`/${from}/`, `/${to}/`);
      }, replaced1);

    return await Deno.writeTextFile(newPath, replaced2);
  })()
);

await Promise.all(filePromises);
