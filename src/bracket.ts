#!/usr/bin/env node

import { Input } from "./cli/io/input.js";
import { Output } from "./cli/io/output.js";
import { REPL } from "./cli/repl/repl.js";
import { REPL_PROMPT, REPL_WELCOME_MESSAGE } from "./shared/globals.js";
import { BACKEND_READ_TO_AST } from "./cli/repl/backends/read-to-ast.js";
import path from "path";

const repl = new REPL(BACKEND_READ_TO_AST, {
    use_hist: true,
    history_size: 1000,
    history_file: path.join(process.env.HOME ?? "./", ".bracket_repl_history"),
    banner_enabled: true,
    welcome_message: REPL_WELCOME_MESSAGE,
    clear_buffer_on_commit: true,
    prompt: REPL_PROMPT,
    input: Input.STDIN,
    output: Output.STDOUT,
    newline_on_commit: true,
});

repl.start();
