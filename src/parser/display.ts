import { Token, TokenType } from "./token.js";

export function toDisplay(tok: Token): string {
    if (tok.type === TokenType.PROCEDURE) {
        return `#<procedure:${tok.literal.toString()}>`;
    } else if (tok.type === TokenType.LIST) {
        return `(${(tok.value as Token[]).map(t => toDisplay(t)).join(" ")})`;
    } else {
        return tok.literal.toString();
    }
}

