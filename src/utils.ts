import { Writable } from "stream";
import util from "util";
import { GOODBYE_MESSAGE, REPL_BANNER_ENABLED, REPL_COMMAND_MAX_LINE_LENGTH, STDOUT } from "./globals.js";
import { Token, TokenType } from "./token.js";

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

export function exit(code = 0): void {
    if (code === 0 && REPL_BANNER_ENABLED) {
        STDOUT.write(`\n${GOODBYE_MESSAGE}\n`);
    }

    if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
    }
}

export function editDistance(a: string, b: string) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
            );
        }
    }

    return dp[m][n];
}

export function toDisplay(tok: Token): string {
    if (tok.type === TokenType.PROCEDURE) {
        return `#<procedure:${tok.literal.toString()}>`;
    } else if (tok.type === TokenType.LIST) {
        return `(${(tok.value as Token[]).map(t => toDisplay(t)).join(" ")})`;
    } else {
        return tok.literal.toString();
    }
}

export function stripNewlines(str: string, replacement = "\\n"): string {
    return str.replaceAll(/\n/g, replacement);
}

export function wrapLines(str: string, max_len: number = REPL_COMMAND_MAX_LINE_LENGTH) {
    if (str === "\n") return "\n";

    const pattern = new RegExp(`\\n|[^\\n]{1,${max_len}}(?=\\s|$)|[^\\n]{${max_len}}`, "g");

    let result = "";
    let first = true;

    for (const m of str.matchAll(pattern)) {
        const chunk = m[0];

        if (chunk === "\n") {
            result += "\n";
            first = true;
        } else {
            if (!first) result += "\n";
            result += chunk;
            first = false;
        }
    }

    return result;
}

export function prune(value: unknown, prune_terms = new Set(["builtins", "__builtins", "__stdout"]), seen = new WeakMap()): unknown {
    if (value && typeof value === "object") {
        if (seen.has(value)) {
            return seen.get(value);
        }

        let result: any;

        if (Array.isArray(value)) {
            result = [];
            seen.set(value, result);
            for (const item of value) {
                result.push(prune(item, prune_terms, seen));
            }
        } else if (value instanceof Map) {
            result = new Map();
            seen.set(value, result);
            for (const [k, v] of value.entries()) {
                if (prune_terms.has(k)) continue;
                result.set(k, prune(v, prune_terms, seen));
            }
        } else if (value instanceof Set) {
            result = new Set();
            seen.set(value, result);
            for (const v of value) {
                result.add(prune(v, prune_terms, seen));
            }
        } else {
            result = {};
            seen.set(value, result);
            for (const [key, val] of Object.entries(value)) {
                if (prune_terms.has(key)) continue;
                result[key] = prune(val, prune_terms, seen);
            }
        }

        return result;
    }

    return value;
}

export function toByteString(value: number | number[], bytes = 1) {
    if (typeof value === "number")
        return value.toString(2).padStart(8 * bytes, "0");

    return value.map(b => b.toString(2).padStart(8 * bytes, "0")).join(" ");
}

export function splitUint8(value: number): Uint8Array {
    return new Uint8Array([
        value & 0xFF,
    ]);
}

export function splitUint16(value: number): Uint8Array {
    return new Uint8Array([
        value & 0xFF,
        (value >>> 8) & 0xFF,
    ]);
}

export function splitUint32(value: number): Uint8Array {
    return new Uint8Array([
        value & 0xFF,
        (value >>> 8) & 0xFF,
        (value >>> 16) & 0xFF,
        (value >>> 24) & 0xFF,
    ]);
}

export function splitInt8(value: number): Uint8Array {
    value = Math.min(127, Math.max(-128, value));
    return new Uint8Array([
        value & 0xFF,
    ]);
}

export function splitInt16(value: number): Uint8Array {
    value = Math.min(32767, Math.max(-32768, value));
    return new Uint8Array([
        value & 0xFF,
        (value >> 8) & 0xFF,
    ]);
}

export function splitInt32(value: number): Uint8Array {
    value = Math.min(2147483647, Math.max(-2147483648, value));
    return new Uint8Array([
        value & 0xFF,
        (value >>> 8) & 0xFF,
        (value >>> 16) & 0xFF,
        (value >>> 24) & 0xFF,
    ]);
}

export function readUint8(value: Uint8Array, offset: number = 0): number {
    return value[offset];
}

export function readUint16(value: Uint8Array, offset: number = 0): number {
    return value[offset] +
        (value[offset + 1] << 8);
}

export function readUint32(value: Uint8Array, offset: number = 0): number {
    return value[offset] +
        (value[offset + 1] << 8) +
        (value[offset + 2] << 16) +
        (value[offset + 3] << 24);
}

export function readInt8(value: Uint8Array, offset: number = 0): number {
    const data = value.slice(offset, offset + 1);
    const view = new DataView(data.buffer);
    return view.getInt8(0);
}

export function readInt16(value: Uint8Array, offset: number = 0): number {
    const data = value.slice(offset, offset + 2);
    const view = new DataView(data.buffer);
    return view.getInt16(0, true);
}

export function readInt32(value: Uint8Array, offset: number = 0): number {
    const data = value.slice(offset, offset + 4);
    const view = new DataView(data.buffer);
    return view.getInt32(0, true);
}

export function readFloat16(value: Uint8Array, offset: number = 0): number {
    const data = value.slice(offset, offset + 2);
    const view = new DataView(data.buffer);
    return view.getFloat16(0, true);
}

export function readFloat32(value: Uint8Array, offset: number = 0): number {
    const data = value.slice(offset, offset + 4);
    const view = new DataView(data.buffer);
    return view.getFloat32(0, true);
}

export function readFloat64(value: Uint8Array, offset: number = 0): number {
    const data = value.slice(offset, offset + 8);
    const view = new DataView(data.buffer);
    return view.getFloat64(0, true);
}

export function readString(value: Uint8Array, offset: number = 0): string {
    const length = value[0];
    const encoded = new Uint8Array(value.slice(offset + 1, offset + length + 1));
    return new TextDecoder().decode(encoded);
}
