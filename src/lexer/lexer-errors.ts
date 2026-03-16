import { Err } from "../shared/data-structures/result.js";
import { Position } from "../shared/util/types.js";

export enum LexerErrorKind {
    UnexpectedSyntax,
    MissingClosing,
    General,
}

export class LexerError extends Error {
    kind: LexerErrorKind;
    pos?: Position;
    constructor(
        msg: string = "",
        kind = LexerErrorKind.General,
        pos?: Position,
    ) {
        super(msg);
        this.kind = kind;
        this.pos = pos;
    }
}

export function unexpectedSyntax(msg: string, pos?: Position) {
    return Err(new LexerError(msg, LexerErrorKind.UnexpectedSyntax, pos));
}

export function generalLexerError(msg: string, pos?: Position) {
    return Err(new LexerError(msg, LexerErrorKind.General, pos));
}

export function missingClosing(msg: string, pos?: Position) {
    return Err(new LexerError(msg, LexerErrorKind.MissingClosing, pos));
}

export function toLexerError(
    err: Error,
    kind: LexerErrorKind = LexerErrorKind.General,
    pos?: Position,
) {
    return new LexerError(err.message, kind, pos);
}
