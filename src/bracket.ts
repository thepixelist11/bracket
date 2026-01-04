#!/usr/bin/env node

// TODO: Improve error handling.
// TODO: Add fraction output rather than decimal.
// TODO: Use custom math functions. e.g. sqrt(-1) -> i instead of NaN
// TODO: Full number support according to Scheme/Racket standards
// TODO: Add REPL commands. (e.g. ,exit ,help)

import { REPL } from "./repl.js";
import { runFile } from "./run_file.js";

// runFile(process.argv[2]);
REPL();
