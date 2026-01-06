#!/usr/bin/env node

// TODO: Add fraction output rather than decimal.
// TODO: Use custom math functions. e.g. sqrt(-1) -> i instead of NaN
// TODO: Full number support according to Scheme/Racket standards

import { REPL } from "./repl.js";
import { runFile } from "./run_file.js";

// runFile(process.argv[2]);
REPL();
