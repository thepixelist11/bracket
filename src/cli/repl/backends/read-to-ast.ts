import { Lexer } from "../../../lexer/lexer.js";
import { Reader } from "../../../reader/reader.js";
import { TerminalController } from "../terminal-controller.js";

export const BACKEND_READ_TO_AST = (input: string, ctl: TerminalController) => {
    const toks = Lexer.lex(input);

    if (toks.is_err()) throw toks.err();

    const ast = Reader.read(toks.unwrap());

    // FIXME: replace with TerminalController handling
    console.log(ast);
};
