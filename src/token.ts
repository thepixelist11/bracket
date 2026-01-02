import { ParenType, EOF_CHAR, LPAREN_TYPE_MAP, RPAREN_TYPE_MAP, BOOL_TRUE, BOOL_FALSE } from "./globals.js";
import { Lexer } from "./lexer.js";
import { ASTProcedureNode } from "./ast.js";

export interface TokenMetadata { row: number, col: number }

export class Token {
    constructor(
        public type: TokenType,
        public literal: string,
        public meta: TokenMetadata = { row: -1, col: -1 },
        public value?: unknown,
    ) { }

    private escapeString(str: string) {
        return str
            .replaceAll("\x07", "\\a")
            .replaceAll("\x08", "\\b")
            .replaceAll("\x09", "\\t")
            .replaceAll("\x0a", "\\n")
            .replaceAll("\x0b", "\\v")
            .replaceAll("\x0c", "\\f")
            .replaceAll("\x0d", "\\r")
            .replaceAll("\x1b", "\\e")
            .replaceAll("\x22", "\\\"");
    }

    toString(): string {
        switch (this.type) {
            case TokenType.ERROR:
                if (this.meta.row >= -1 && this.meta.col >= 0)
                    return `#<error:${this.literal} at ${this.meta.row + 1}:${this.meta.col + 1}>`;
                else
                    return `#<error:${this.literal}>`;
            case TokenType.EOF:
                throw new Error("Unable to convert EOF token to string. This should never be attempted.");
            case TokenType.LPAREN:
                return `#(`;
            case TokenType.RPAREN:
                return `#)`;
            case TokenType.NUM:
                return `${parseFloat(this.literal)}`;
            case TokenType.SYM:
                if (this.literal.split("").some(ch => Lexer.isIllegalSymbolChar(ch)))
                    return `'|${this.literal}|`;
                else
                    return `'${this.literal}`;
            case TokenType.BOOL:
                return `${this.literal}`;
            case TokenType.STR:
                return `"${this.escapeString(this.literal)}"`;
            case TokenType.IDENT:
                return `#<ident:${this.literal}>`;
            case TokenType.CHAR:
                return `#\\${this.literal}`;
            case TokenType.VOID:
                return "";
            case TokenType.PROCEDURE:
                return "#<procedure>";
            case TokenType.LIST:
                return `'(${(this.value as Token[] ?? []).map(t => t.toString()).join(" ")})`; // FIXME: Prevent nested lists from having '
            case TokenType.ANY:
                return `<any>`
            case TokenType.QUOTE:
                return `<quote>`
        }
    }

    withPos(row: number, col: number) {
        return new Token(this.type, this.literal, { ...this.meta, row, col }, this.value);
    }
}

export const enum TokenType {
    ANY,
    ERROR,
    EOF,
    VOID,
    LPAREN,
    RPAREN,
    NUM,
    SYM,
    BOOL,
    STR,
    IDENT,
    CHAR,
    PROCEDURE,
    LIST,
    QUOTE,
};

export function TokenError(msg: string, meta?: TokenMetadata) { return new Token(TokenType.ERROR, msg, meta) };
export function TokenEOF(meta?: TokenMetadata) { return new Token(TokenType.EOF, EOF_CHAR, meta) };
export function TokenVoid(meta?: TokenMetadata) { return new Token(TokenType.VOID, "", meta) };
export function TokenLParen(type: ParenType = ParenType.PAREN, meta?: TokenMetadata) { return new Token(TokenType.LPAREN, LPAREN_TYPE_MAP[type], meta) };
export function TokenRParen(type: ParenType = ParenType.PAREN, meta?: TokenMetadata) { return new Token(TokenType.RPAREN, RPAREN_TYPE_MAP[type], meta) };
export function TokenNum(num: number | string, meta?: TokenMetadata) { return new Token(TokenType.NUM, num.toString(), meta) };
export function TokenSym(sym: string, meta?: TokenMetadata) { return new Token(TokenType.SYM, sym.toString(), meta) };
export function TokenBool(bool: boolean, meta?: TokenMetadata) { return new Token(TokenType.BOOL, bool ? BOOL_TRUE : BOOL_FALSE, meta) };
export function TokenStr(str: string, meta?: TokenMetadata) { return new Token(TokenType.STR, str, meta) };
export function TokenIdent(ident: string, meta?: TokenMetadata) { return new Token(TokenType.IDENT, ident, meta) };
export function TokenChar(char: string, meta?: TokenMetadata) { return new Token(TokenType.CHAR, char, meta) };
export function TokenProc(proc: ASTProcedureNode, meta?: TokenMetadata) { return new Token(TokenType.PROCEDURE, "", meta, proc) };
export function TokenList(list: Token[], meta?: TokenMetadata) { return new Token(TokenType.LIST, "", meta, list) };

export type ValueType =
    | TokenType.ANY
    | TokenType.NUM
    | TokenType.SYM
    | TokenType.STR
    | TokenType.BOOL
    | TokenType.ERROR
    | TokenType.VOID
    | TokenType.CHAR
    | TokenType.IDENT
    | TokenType.LIST
    | TokenType.PROCEDURE;

