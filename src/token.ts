import { ParenType, EOF_CHAR, LPAREN_TYPE_MAP, RPAREN_TYPE_MAP, BOOL_TRUE, BOOL_FALSE } from "./globals.js";
import { Lexer } from "./lexer.js";
import { ASTProcedureNode } from "./ast.js";

export interface TokenMetadata { row: number, col: number }

export class Token {
    public meta: TokenMetadata = { row: -1, col: -1 };

    constructor(
        public type: TokenType,
        public literal: string,
        row: number = -1,
        col: number = -1,
        public value?: unknown
    ) {
        this.meta.row = row;
        this.meta.col = col;
    }

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
                    return `#<error:${this.literal} at ${this.meta.row}:${this.meta.col}>`;
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
        }
    }

    withPos(row: number, col: number) {
        return new Token(this.type, this.literal, row, col, this.value);
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
};

export function TokenError(msg: string, row: number = -1, col: number = -1) { return new Token(TokenType.ERROR, msg, row, col) };
export function TokenEOF(row: number = -1, col: number = -1) { return new Token(TokenType.EOF, EOF_CHAR, row, col) };
export function TokenVoid(row: number = -1, col: number = -1) { return new Token(TokenType.VOID, "", row, col) };
export function TokenLParen(type: ParenType = ParenType.PAREN, row: number = -1, col: number = -1) { return new Token(TokenType.LPAREN, LPAREN_TYPE_MAP[type], row, col) };
export function TokenRParen(type: ParenType = ParenType.PAREN, row: number = -1, col: number = -1) { return new Token(TokenType.RPAREN, RPAREN_TYPE_MAP[type], row, col) };
export function TokenNum(num: number | string, row: number = -1, col: number = -1) { return new Token(TokenType.NUM, num.toString(), row, col) };
export function TokenSym(sym: string, row: number = -1, col: number = -1) { return new Token(TokenType.SYM, sym.toString(), row, col) };
export function TokenBool(bool: boolean, row: number = -1, col: number = -1) { return new Token(TokenType.BOOL, bool ? BOOL_TRUE : BOOL_FALSE, row, col) };
export function TokenStr(str: string, row: number = -1, col: number = -1) { return new Token(TokenType.STR, str, row, col) };
export function TokenIdent(ident: string, row: number = -1, col: number = -1) { return new Token(TokenType.IDENT, ident, row, col) };
export function TokenChar(char: string, row: number = -1, col: number = -1) { return new Token(TokenType.CHAR, char, row, col) };
export function TokenProc(proc: ASTProcedureNode, row: number = -1, col: number = -1) { return new Token(TokenType.PROCEDURE, "", row, col, proc) };
export function TokenList(list: Token[], row: number = -1, col: number = -1) { return new Token(TokenType.LIST, "", row, col, list) };

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

