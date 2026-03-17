/*
 * In Bracket, backslash prefixed escape sequences can be used in strings and
 * Char literals.
 *
 * All non-unicode (\u, \U) escape sequences may additionally be used in byte strings
 * provided that the value produced by the escape sequence can be represented
 * by a single byte (i.e. ASCII 0-255).
 *
 * The following escape sequences are recognized by Bracket:
 *  '\a': alarm                         (ASCII 7)
 *  '\b': backspace                     (ASCII 8)
 *  '\t': htab                          (ASCII 9)
 *  '\n': linefeed                      (ASCII 10)
 *  '\v': vtab                          (ASCII 11)
 *  '\f': formfeed                      (ASCII 12)
 *  '\r': return                        (ASCII 13)
 *  '\e': escape                        (ASCII 27)
 *  '\"': double-quotes                 (without terminating the string)
 *  '\'': apostrophe                    (identical to literal "'")
 *  '\\': literal backslash
 *  '\<[0-7]{1,3}>': octal unicode      (ASCII [0,255])
 *  '\x<[0-9a-fA-F]{1,2}>': hex unicode
 *  '\u<[0-9a-fA-F]{1,4}>': hex unicode (4 hex digits)
 *  '\u<[0-9a-fA-F]{1,4}>\u<[0-9a-fA-F]{1,4}>': UTF-16 surrogate pair; first
 *                       must be in [0xD800,0xDBFF] and the second must be in
 *                       [0xDC00, 0xDFFF].
 *  '\U<[0-9a-fA-F]{1,8}>': hex unicode (8 hex digits)
 *  '\<newline>': elided, where <newline> is a linefeed, carriage return, or
 *                carriage return-linefeed combination.
 *
 * The escape sequences supported in Bracket are similar to those of the Racket
 * programming language, as detailed here:
 *
 * https://docs.racket-lang.org/reference/reader.html#(part._parse-string)
 */

import { Ok, Result } from "../shared/data-structures/result.js";
import { Lexer } from "./lexer.js";
import {
    convertSeqToString,
    hexValue,
    isHex,
    isOctal,
} from "../shared/util/strings.js";
import {
    LexerError,
    LexerErrorKind,
    toLexerError,
    unexpectedSyntax,
} from "./lexer-errors.js";

export function readOctalEscape(l: Lexer): Result<string, LexerError> {
    const pos = l.position;
    const octal_str = l.readWhileN(isOctal, 3).join("");

    const octal = parseInt(octal_str, 8);

    if (Number.isNaN(octal)) {
        return unexpectedSyntax(
            `failed to read octal sequence; malformed octal value: '${octal_str}'`,
            pos,
        );
    }

    if (octal < 0 || 255 < octal) {
        return unexpectedSyntax(
            `invalid octal sequence; octal value out of range [0, 255], got (${octal})`,
            pos,
        );
    }

    const ch = String.fromCharCode(octal);
    return Ok(convertSeqToString(ch));
}

export function readHexEscape(l: Lexer): Result<string, LexerError> {
    const pos = l.position;

    const res = l.expect(
        (ch) => ch === "x",
        `expected hex sequence to begin with an 'x', got '${String(l.peek())}'`,
    );

    if (res.is_err())
        return res.map_err((x) =>
            toLexerError(x, LexerErrorKind.UnexpectedSyntax, pos),
        );

    const hex_str = l.readWhileN(isHex, 2).join("");

    if (hex_str.length === 0)
        return unexpectedSyntax("No hex digit following: '\\x'", pos);

    const hex = parseInt(hex_str, 16);

    if (Number.isNaN(hex)) {
        return unexpectedSyntax(
            `failed to read hex sequence; malformed hex value: '${hex_str}'`,
            pos,
        );
    }

    const ch = String.fromCharCode(hex);
    return Ok(convertSeqToString(ch));
}

export function readUnicodeEscape4(l: Lexer): Result<string, LexerError> {
    const pos = l.position;

    const res = l.expect(
        (ch) => ch === "u",
        `expected unicode (4) sequence to begin with a 'u', got '${String(l.peek())}'`,
    );

    if (res.is_err())
        return res.map_err((x) =>
            toLexerError(x, LexerErrorKind.UnexpectedSyntax, pos),
        );

    let result = "";

    const unicode_str = l.readWhileN((ch) => hexValue(ch) !== -1, 4).join("");

    if (unicode_str.length === 0)
        return unexpectedSyntax("Invalid escape sequence: '\\u'", pos);

    const unicode = parseInt(unicode_str, 16);

    if (Number.isNaN(unicode)) {
        return unexpectedSyntax(
            `failed to read unicode sequence; malformed unicode value: '${unicode_str}'`,
            pos,
        );
    }

    if (0xdc00 <= unicode && unicode <= 0xdfff) {
        return unexpectedSyntax(
            `failed to read unicode sequence; unexpected unpaired surrogate: '${unicode_str};` +
                `is the ordering of surrogate pairs incorrect?'`,
            pos,
        );
    }

    if (0xd800 <= unicode && unicode <= 0xdbff) {
        const surrogate = l.peekN(6).join("");
        const low = parseInt(surrogate.slice(2), 16);

        if (
            surrogate[0] !== "\\" ||
            surrogate[1] !== "u" ||
            !isHex(surrogate.slice(2))
        ) {
            return unexpectedSyntax(
                `failed to read unicode sequence; incomplete surrogate pair: '${unicode_str}'`,
                pos,
            );
        }

        if (Number.isNaN(low)) {
            return unexpectedSyntax(
                `failed to read unicode sequence (second in UTF-16 surrogate pair); ` +
                    `malformed unicode value: '${surrogate}'`,
                pos,
            );
        }

        if (low < 0xdc00 || 0xdfff < low) {
            return unexpectedSyntax(
                `failed to read unicode sequence; expected valid surrogate sequence in ` +
                    `[0xDC00, 0xDFFF], got '${surrogate}'`,
                pos,
            );
        }

        const code = (unicode - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;

        l.nextN(6);

        if (code > 0x10ffff)
            return unexpectedSyntax(
                `unicode out of range; computed scalar is ${code}, max unicode scalar is ${0x10ffff}`,
                pos,
            );

        result = String.fromCodePoint(code);
    } else {
        result = String.fromCodePoint(unicode);
    }

    return Ok(convertSeqToString(result));
}

export function readUnicodeEscape8(l: Lexer): Result<string, LexerError> {
    const pos = l.position;

    const res = l.expect(
        (ch) => ch === "U",
        `expected hex sequence to begin with an 'U', got '${String(l.peek())}'`,
    );

    if (res.is_err())
        return res.map_err((x) =>
            toLexerError(x, LexerErrorKind.UnexpectedSyntax, pos),
        );

    const unicode_str = l.readWhileN(isHex, 8).join("");

    if (unicode_str.length === 0)
        return unexpectedSyntax("Invalid escape sequence: '\\U'", pos);

    const unicode = parseInt(unicode_str, 16);

    if (Number.isNaN(unicode)) {
        return unexpectedSyntax(
            `failed to read hex sequence; malformed hex value: '${unicode_str}'`,
            pos,
        );
    }

    if (unicode > 0x10ffff)
        return unexpectedSyntax(
            `unicode out of range; computed scalar is ${unicode}, max unicode scalar is ${0x10ffff}`,
            pos,
        );

    const ch = String.fromCodePoint(unicode);
    return Ok(convertSeqToString(ch));
}

export function readEscape(l: Lexer): Result<string, LexerError> {
    const pos = l.position;

    const res = l.expect(
        (ch) => ch === "\\",
        `expected escape sequence to start with a '\\', got '${String(l.peek())}'`,
    );

    if (res.is_err())
        return res.map_err((x) =>
            toLexerError(x, LexerErrorKind.UnexpectedSyntax, pos),
        );

    if (l.is_done) {
        return unexpectedSyntax("expected escape sequence; found EOF", pos);
    }

    let ch = l.peek() as string;

    if (isOctal(ch)) {
        return readOctalEscape(l);
    } else if (ch === "x") {
        return readHexEscape(l);
    } else if (ch === "u") {
        return readUnicodeEscape4(l);
    } else if (ch === "U") {
        return readUnicodeEscape8(l);
    } else if (ch === "\n") {
        l.next();
        return Ok("");
    } else {
        // prettier-ignore
        switch (ch) {
            case "a": l.next(); ch = "\a"; break;
            case "b": l.next(); ch = "\b"; break;
            case "t": l.next(); ch = "\t"; break;
            case "n": l.next(); ch = "\n"; break;
            case "v": l.next(); ch = "\v"; break;
            case "f": l.next(); ch = "\f"; break;
            case "r": l.next(); ch = "\r"; break;
            case "e": l.next(); ch = "\e"; break;
            case '"': l.next(); ch = '"'; break;
            case "'": l.next(); ch = "'"; break;
            case "\\": l.next(); ch = "\\"; break;
            default: ch = ""; break;
        }
    }

    return Ok(ch);
}
