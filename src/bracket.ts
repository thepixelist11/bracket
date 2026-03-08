#!/usr/bin/env node

import { Lexer } from "./lexer/lexer.js";

const toks = Lexer.lex(`(define @,a 1)`);

for (const tok of toks) {
    console.log(tok.toString());
}
