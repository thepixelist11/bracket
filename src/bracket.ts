#!/usr/bin/env node

import { Lexer } from "./tokenization/lexer/lexer.js";

Lexer.lex("(+ 1 2)");
