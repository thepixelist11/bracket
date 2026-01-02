import { Writable } from "stream";
import util from "util";

export class Output extends Writable {
    public write_count = 0;
    public buffer = "";

    private readonly target: NodeJS.WritableStream | null;

    constructor(options: { forward_to?: NodeJS.WritableStream } = {}) {
        super({ decodeStrings: false });
        this.target = options?.forward_to ?? null;
    }

    _write(chunk: string | Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        const text = typeof chunk === "string"
            ? chunk
            : chunk.toString(encoding);

        this.write_count++;
        this.buffer += text;

        if (this.target) {
            this.target.write(text);
        }

        callback();
    }

    reset(): void {
        this.write_count = 0;
        this.buffer = "";
    }
}

export function printDeep(obj: unknown, depth = 12) {
    console.log(util.inspect(obj, { showHidden: false, depth: depth, colors: true }))
}
