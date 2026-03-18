import { Token } from "../../lexer/tokens.js";
import util from "util";

export function printDeep(obj: unknown, depth = 12) {
    console.log(
        util.inspect(obj, { showHidden: false, depth: depth, colors: true }),
    );
}

export function printTokenDebug(tok: Token) {
    return util.inspect(tok);
}
