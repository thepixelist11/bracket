import { BYTECODE_FLAGS, BYTECODE_HEADER_SIZE, BYTECODE_MAGIC_BYTES, BYTECODE_WORD_SIZE, VERSION_ID } from "../../../shared/globals.js";
import { splitUint16, splitUint8 } from "../../../shared/utils/binary/writer.js";

//             File Header                   The file header identifies critical information
//  Magic Bytes (BRKT) ------- 4 bytes         about the file structure and build status including
//  Version ID --------------- 2 bytes         the word size (either 4 or 8 bytes), any flags
//  Word Size (4 or 8) ------- 1 byte          relating to the optimization level, debug mode, etc.
//  Flags -------------------- 1 byte          as well as magic bytes to correctly identify the file
//  Padding ------------------ 16 bytes        as being a proper Bracket binary file. This must be
//                                             placed directly at the start of the file.

export function header(): Uint8Array {
    let head = new Uint8Array(BYTECODE_HEADER_SIZE);
    head.set(BYTECODE_MAGIC_BYTES, 0);                      // magic bytes
    head.set(splitUint16(VERSION_ID), 4);                   // version id
    head.set(splitUint8(BYTECODE_WORD_SIZE), 6);            // word size
    head.set(splitUint8(BYTECODE_FLAGS), 7);                // bit flags
    head.set(Array.from({ length: 16 }, () => 0), 8);       // padding to allow for future header properties
    return head;
}
