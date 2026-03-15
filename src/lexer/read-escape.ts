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

import { Err, Ok, Result } from "../shared/data-structures/result.js";
import { LexerError } from "../shared/errors.js";
import { Lexer } from "./lexer.js";
import {
    convertSeqToString,
    hexValue,
    isHex,
    isOctal
} from "../shared/util/strings.js";

export function readOctalEscape(l: Lexer): Result<string, LexerError> {
    const octal_str = l.readWhileN(isOctal, 3).join("");

    const octal = parseInt(octal_str, 8);

    if (Number.isNaN(octal)) {
        return Err(new LexerError(
            `failed to read octal sequence; malformed octal value: '${octal_str}'`
        ));
    }

    if (octal < 0 || 255 < octal) {
        return Err(new LexerError(
            `invalid octal sequence; octal value out of range [0, 255], got (${octal})`
        ));
    }

    const ch = String.fromCharCode(octal);
    return Ok(convertSeqToString(ch));
}

export function readHexEscape(l: Lexer): Result<string, LexerError> {
    const res = l.expect(
        ch => ch === "x",
        `expected hex sequence to begin with an 'x', got '${String(l.peek())}'`
    );

    if (res.is_err())
        return res.map_err(x => new LexerError(x.message));

    const hex_str = l.readWhileN(isHex, 2).join("");

    if (hex_str.length === 0)
        return Err(new LexerError("Invalid escape sequence: '\\x'"));

    const hex = parseInt(hex_str, 16);

    if (Number.isNaN(hex)) {
        return Err(new LexerError(
            `failed to read hex sequence; malformed hex value: '${hex_str}'`
        ));
    }

    const ch = String.fromCharCode(hex);
    return Ok(convertSeqToString(ch));
}

export function readUnicodeEscape4(l: Lexer): Result<string, LexerError> {
    const res = l.expect(
        ch => ch === "u",
        `expected unicode (4) sequence to begin with a 'u', got '${String(l.peek())}'`
    );

    if (res.is_err())
        return res.map_err(x => new LexerError(x.message));

    let result = "";

    const unicode_str = l.readWhileN(
        ch => hexValue(ch) !== -1,
        4,
    ).join("");

    if (unicode_str.length === 0)
        return Err(new LexerError("Invalid escape sequence: '\\u'"));

    const unicode = parseInt(unicode_str, 16);

    if (Number.isNaN(unicode)) {
        return Err(new LexerError(
            `failed to read unicode sequence; malformed unicode value: '${unicode_str}'`
        ));
    }

    if (0xDC00 <= unicode && unicode <= 0xDFFF) {
        return Err(new LexerError(
            `failed to read unicode sequence; unexpected unpaired surrogate: '${unicode_str};` +
            `is the ordering of surrogate pairs incorrect?'`
        ));
    }

    if (0xD800 <= unicode && unicode <= 0xDBFF) {
        const pre_surrogate = l.mark();

        const surrogate = l.peekN(6).join("");
        const low = parseInt(surrogate.slice(2), 16);

        if (
            surrogate[0] !== "\\" ||
            surrogate[1] !== "u" ||
            !isHex(surrogate.slice(2))
        ) {
            l.restore(pre_surrogate);
            return Err(new LexerError(
                `failed to read unicode sequence; incomplete surrogate pair: '${unicode_str}'`
            ));
        }

        if (Number.isNaN(low)) {
            return Err(new LexerError(
                `failed to read unicode sequence (second in UTF-16 surrogate pair); ` +
                `malformed unicode value: '${surrogate}'`
            ));
        }

        if (
            low < 0xDC00 || 0xDFFF < low
        ) {
            return Err(new LexerError(
                `failed to read unicode sequence; expected valid surrogate sequence in ` +
                `[0xDC00, 0xDFFF], got '${surrogate}'`
            ));
        }

        const code =
            (unicode - 0xD800) * 0x400 +
            (low - 0xDC00) +
            0x10000;

        l.nextN(6);

        result = String.fromCodePoint(code);
    } else {
        result = String.fromCodePoint(unicode);
    }

    return Ok(convertSeqToString(result));
}

export function readUnicodeEscape8(l: Lexer): Result<string, LexerError> {
    const res = l.expect(
        ch => ch === "U",
        `expected hex sequence to begin with an 'U', got '${String(l.peek())}'`
    );

    if (res.is_err())
        return res.map_err(x => new LexerError(x.message));

    const unicode_str = l.readWhileN(isHex, 8).join("");

    if (unicode_str.length === 0)
        return Err(new LexerError("Invalid escape sequence: '\\U'"));

    const unicode = parseInt(unicode_str, 16);

    if (Number.isNaN(unicode)) {
        return Err(new LexerError(
            `failed to read hex sequence; malformed hex value: '${unicode_str}'`
        ));
    }

    const ch = String.fromCodePoint(unicode);
    return Ok(convertSeqToString(ch));
}

export function readEscape(l: Lexer): Result<string, LexerError> {
    const res = l.expect(
        ch => ch === "\\",
        `expected escape sequence to start with a '\\', got '${String(l.peek())}'`
    );

    if (res.is_err())
        return res.map_err(x => new LexerError(x.message));

    if (l.is_done) {
        return Err(new LexerError("expected escape sequence; found EOF"));
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
        switch (ch) {
            case "a": l.next(); ch = "\a";
            case "b": l.next(); ch = "\b";
            case "t": l.next(); ch = "\t";
            case "n": l.next(); ch = "\n";
            case "v": l.next(); ch = "\v";
            case "f": l.next(); ch = "\f";
            case "r": l.next(); ch = "\r";
            case "e": l.next(); ch = "\e";
            case '"': l.next(); ch = '"';
            case "'": l.next(); ch = "'";
            case "\\": l.next(); ch = "\\";
        }
    }

    return Ok(ch);
}
