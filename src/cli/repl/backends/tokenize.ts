import { Lexer } from "../../../lexer/lexer.js";
import { TerminalController } from "../terminal-controller.js";
import { tokenToString } from "../../../lexer/tokens.js";

export const BACKEND_TOKENIZE = (input: string, ctl: TerminalController) => {
    const toks = Lexer.lex(input);
    for (const tok of toks) {
        ctl.output(tokenToString(tok));
        ctl.outputNewline();
    }
};
