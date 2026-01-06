import { ParenType, EOF_CHAR, LPAREN_TYPE_MAP, RPAREN_TYPE_MAP, TOKEN_PRINT_TYPE_MAP } from "./globals.js";
import { Lexer } from "./lexer.js";
import { ASTProcedureNode } from "./ast.js";

export const BOOL_TRUE = "#t" as const, BOOL_FALSE = "#f" as const;

export interface TokenMetadata { row: number, col: number, [key: string]: string | number }

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

    toString(nested_list = false): string {
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
                if (this.literal.split("").some(ch => Lexer.isIllegalIdentChar(ch)) || this.literal === "")
                    return `${nested_list ? "" : "'"}|${this.literal}|`;
                else
                    return `${nested_list ? "" : "'"}${this.literal}`;
            case TokenType.BOOL:
                return `${this.literal}`;
            case TokenType.STR:
                return `"${this.escapeString(this.literal)}"`;
            case TokenType.IDENT:
                if (this.literal.split("").some(ch => Lexer.isIllegalIdentChar(ch)))
                    return `#<ident:|${this.literal}|>`;
                else
                    return `#<ident:${this.literal}>`;
            case TokenType.CHAR:
                return `#\\${this.literal}`;
            case TokenType.VOID:
                return "#<void>";
            case TokenType.PROCEDURE:
                return "#<procedure>";
            case TokenType.LIST:
                return `${nested_list ? "" : "'"}(${(this.value as Token[]).map(t => t.toString(true)).join(" ")})`;
            case TokenType.ANY:
                return `#<any>`
            default:
                throw new Error(`unhandled token type: ${TOKEN_PRINT_TYPE_MAP[this.type]}`);
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
    FORM,
    META,
};

export type TokenMetadataInjector = { meta: { [key: string]: string | number }, pred?: (tok: Token) => boolean };

function defaultMeta(meta: Partial<TokenMetadata> = {}): TokenMetadata { return { row: meta.row ?? -1, col: meta.col ?? -1 }; }
export function TokenError(msg: string, meta?: TokenMetadata) { return new Token(TokenType.ERROR, msg, defaultMeta(meta)) };
export function TokenEOF(meta?: TokenMetadata) { return new Token(TokenType.EOF, EOF_CHAR, defaultMeta(meta)) };
export function TokenVoid(meta?: TokenMetadata) { return new Token(TokenType.VOID, "", defaultMeta(meta)) };
export function TokenLParen(type: ParenType = ParenType.PAREN, meta?: TokenMetadata) { return new Token(TokenType.LPAREN, LPAREN_TYPE_MAP[type], defaultMeta(meta)) };
export function TokenRParen(type: ParenType = ParenType.PAREN, meta?: TokenMetadata) { return new Token(TokenType.RPAREN, RPAREN_TYPE_MAP[type], defaultMeta(meta)) };
export function TokenNum(num: number | string, meta?: TokenMetadata) { return new Token(TokenType.NUM, num.toString(), defaultMeta(meta)) };
export function TokenSym(sym: string, meta?: TokenMetadata) { return new Token(TokenType.SYM, sym.toString(), defaultMeta(meta)) };
export function TokenBool(bool: boolean | string, meta?: TokenMetadata) { return new Token(TokenType.BOOL, (typeof bool === "string" ? bool === BOOL_TRUE : bool) ? BOOL_TRUE : BOOL_FALSE, defaultMeta(meta)) };
export function TokenStr(str: string, meta?: TokenMetadata) { return new Token(TokenType.STR, str, defaultMeta(meta)) };
export function TokenIdent(ident: string, meta?: TokenMetadata) { return new Token(TokenType.IDENT, ident, defaultMeta(meta)) };
export function TokenChar(char: string, meta?: TokenMetadata) { return new Token(TokenType.CHAR, char, defaultMeta(meta)) };
export function TokenProc(proc: ASTProcedureNode, meta?: TokenMetadata) { return new Token(TokenType.PROCEDURE, "", defaultMeta(meta), proc) };
export function TokenList(list: Token[], meta?: TokenMetadata) { return new Token(TokenType.LIST, "", defaultMeta(meta), list) };
export function TokenForm(val: Token[], meta?: TokenMetadata) { return new Token(TokenType.LIST, "", defaultMeta(meta), val) };
export function TokenMeta(injector: TokenMetadataInjector, meta?: TokenMetadata) { return new Token(TokenType.META, "", defaultMeta(meta), injector) };

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

