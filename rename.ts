import { walk, WalkEntry } from "https://deno.land/std@0.93.0/fs/mod.ts";
import { dirname, join } from "https://deno.land/std@0.93.0/path/mod.ts";
import { toSnakeCase } from "./deps/case.ts";

const tsFiles: WalkEntry[] = [];

for await (const entry of walk(".")) {
  if (entry.isFile && entry.name.endsWith(".ts")) {
    tsFiles.push(entry);
  }
}

const renamedMap = new Map(tsFiles.map((tsFile) => {
  const snakeCased = toSnakeCase(tsFile.name);
  return [tsFile.name, snakeCased];
}));

const promises = tsFiles.map((tsFile) =>
  async () => {
    const newName = renamedMap.get(tsFile.name)!;
    const dir = dirname(tsFile.path);
    const newPath = join(dir, newName);
    await Deno.rename(tsFile.path, newPath);

    const content = await Deno.readTextFile(newPath);
    const replaced = Array
      .from(renamedMap.entries())
      .reduce((c, [from, to]) => {
        return c.replaceAll(`${from}"`, `${to}"`);
      }, content);

    return await Deno.writeTextFile(newPath, replaced);
  }
);

await Promise.all(promises);
