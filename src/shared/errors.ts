export enum ErrorKind {
};

export class LexerError extends Error {
    constructor(msg: string = "", options?: ErrorOptions) {
        super(msg, options);
    }
}
