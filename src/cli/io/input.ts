import { ReadStream } from "tty";

export class Input extends ReadStream {
    static STDIN = process.stdin;
}
