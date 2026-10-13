// The build plugin reads files at build time; this is all it uses of Node's types.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
