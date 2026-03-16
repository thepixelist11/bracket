export class StreamError extends Error {
    constructor(msg: string = "", options?: ErrorOptions) {
        super(msg, options);
    }
}

export class REPLError extends Error {
    constructor(msg: string = "", options?: ErrorOptions) {
        super(msg, options);
    }
}

export function assertNever(x: never, msg?: string): never {
    throw new Error(msg ?? `unexpected value: ${x}`);
}
