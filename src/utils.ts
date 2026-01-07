import { Writable } from "stream";
import util from "util";
import { GOODBYE_MESSAGE, REPL_BANNER_ENABLED, STDOUT } from "./globals.js";
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
