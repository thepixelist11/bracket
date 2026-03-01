import { Writable } from "stream";
import util from "util";

export class Output extends Writable {
    public write_count = 0;
    public buffer = "";
    public targeted: Output[] = [];

    private readonly target: NodeJS.WritableStream | null;
    private readonly chunk_fn: (chunk: string) => string;

    constructor(options: { forward_to?: NodeJS.WritableStream, chunk_fn?: (chunk: string) => string } = {}) {
        super({ decodeStrings: false });
        this.target = options?.forward_to ?? null;

        if (this.target instanceof Output)
            this.target.targeted.push(this);

        this.chunk_fn = options?.chunk_fn ?? ((s) => s);
    }

    _write(chunk: string | Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        const text = this.chunk_fn(typeof chunk === "string"
            ? chunk
            : chunk.toString(encoding));

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

        for (const tar of this.targeted) {
            tar.reset();
        }
    }

    warn(msg: string) {
        this.write(`warning: ${msg}\n`);
    }

    error(msg: string | Error) {
        let out = msg;
        if (msg instanceof Error)
            out = (msg as any).message ?? String(msg);

        this.write(`error: ${out}\n`);
    }
}

export function printDeep(obj: unknown, depth = 12) {
    console.log(util.inspect(obj, { showHidden: false, depth: depth, colors: true }))
}
