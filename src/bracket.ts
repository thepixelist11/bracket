#!/usr/bin/env node

import { Lexer } from "./lexer/lexer.js";

const toks = Lexer.lex(`#"\\uffff"`);

console.log("===== tokens =====");
for (const tok of toks) {
    console.log(tok.toString());
}
