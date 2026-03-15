import { ParenKind, Token, TokenKind } from "../../lexer/tokens.js";
import util from "util";

export function printDeep(obj: unknown, depth = 12) {
    console.log(
        util.inspect(obj, { showHidden: false, depth: depth, colors: true }),
    );
}

export function printTokenDebug(tok: Token) {
    let str_obj = {
        kind: TokenKind[tok.kind],
        literal: tok.literal,
        meta: tok.meta,
    };

    switch (tok.kind) {
        case TokenKind.LParen:
        case TokenKind.RParen:
            str_obj.kind = ParenKind[str_obj.kind as unknown as number];
    }

    return util.inspect(str_obj);
}
