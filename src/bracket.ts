#!/usr/bin/env node

import { Lexer } from "./lexer/lexer.js";
import { printDeep } from "./cli/io/pretty-print.js";

const toks = Lexer.lex(`"'\\uD806\\uDD00'"`);
printDeep(toks);
