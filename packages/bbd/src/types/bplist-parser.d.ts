// bplist-parser ships no types. Minimal ambient declaration for the bits we use.
declare module "bplist-parser" {
    export function parseBuffer<T = any>(buffer: Buffer): T[];
    export function parseFile<T = any>(file: string): Promise<T[]>;
}
