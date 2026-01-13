# Bracket

Bracket is an experimental, Scheme-like interpreter written in TypeScript.

## Overview

Bracket is a tree-walking interpreter designed from first principles.  
Its primary goals are correctness, extensibility, and semantic clarity.

## Design Goals

- Faithful Scheme/Racket-style semantics
- Extensibility through data-driven definitions
- Clear and unified error handling
- Practical usability as both a CLI tool and a library

Non-goals include strict conformance to any specific Scheme standard and production-grade performance guarantees.

## Language Overview

### Syntax

Bracket uses traditional s-expression syntax consistent with Scheme and Racket.  
Source code may be evaluated from files or interactively.

### Evaluation Model

The interpreter uses a direct tree-walking evaluation model derived from first principles.
Source text is lexed into tokens, parsed into an abstract syntax tree, and evaluated to produce a final result token.

Environments may persist across evaluations, allowing shared state in interactive sessions and across multiple files.

### Scoping

Bracket uses lexical scoping with first-class procedures and closures.

### Data Types

The following core data types are supported:

- Numbers
- Symbols
- Strings
- Characters
- Booleans
- Lists
- Null
- Procedures
- Void
- Identifiers
- Raw forms (used internally for macros)

### Procedures and Macros

Procedures are first-class values and closures are fully supported.

Hygienic macros are not currently implemented. In practice, closures cover most intended use cases. Macro support exists in a lower-level, form-based representation and is designed to be extensible.

## Implementation Overview

At a high level, Bracket is structured as follows:

Source / REPL input
↓
Lexer
↓
Parser
↓
Abstract Syntax Tree
↓
Evaluator
↓
Result token


Evaluation occurs within an environment that may persist across runs.
This enables REPL sessions and the ability to import definitions from other `.brkt` files.

## Getting Started

### Prerequisites

- Node.js (tested on 22.2.0)
- TypeScript (tested on 5.9.2)

### Installation

```bash
# Unix Installation:

git clone https://github.com/thepixelist11/bracket.git
cd bracket
npm install -D
npm run build

# Optionally, you may make the bracket.js file executable
chmod +x ./bin/bracket.js
```

### Running Bracket

Bracket is primarily a CLI application. The `bracket.js` entry point initializes the REPL, file loader, and standard environment.

It may also be used as a library by importing the relevant modules directly and omitting the CLI entry point.

## Usage

### Running Files

You may execute one or more `.brkt` files. By default, each file is evaluated in a fresh environment unless otherwise specified.

### Interactive Mode (REPL)

Interactive mode evaluates input line by line in a persistent environment.  
Files may be loaded before entering the REPL, and all definitions remain available.

### Command-Line Options

The following options are currently supported:

- `--version`, `-V`
  Displays the current version.

- `--interactive`, `--repl`, `-i`
  Runs Bracket interactively in a REPL. Any provided files are evaluated first.

- `--penv`, `-p`
  Uses a persistent environment when running multiple files. This is implied in interactive mode.

- `--help`, `-h`
  Displays help information.

- Positional arguments  
  One or more files to evaluate.

## Examples

Examples can be found in the `examples` directory.

## Extending Bracket

Bracket is designed to be extended.

- New primitives can be added by defining their metadata and behavior.
- Special forms and macros are data-driven.
- REPL commands follow the same declarative approach.

Extensions do not require changes to the evaluator itself.

## Contributing

Contributions are welcome.
The project is exploratory in nature, but correctness and clarity are valued. Issues and pull requests should include clear explanations of intent and behavior.

## License

MIT

## Acknowledgements

Bracket is inspired by Scheme and Racket, as well as by the broader tradition of minimalist language interpreters.

## Standard Library Reference
<details>
<summary>Modules</summary>

### bracket
<details>
```
identity: (identity arg0)
Produces its argument unchanged.

when: (when arg0 args...)
Evaluates the body expressions when the test expression is not false; otherwise produces void.

unless: (unless arg0 args...)
Evaluates the body expressions when the test expression is false; otherwise produces void.

cond: (cond args...)
Evaluates test-value clauses in order and produces the value of the first clause who's test is not false. An else clause matches unconditionally.

begin: (begin args...)
Evaluates expressions in order and produces the value of the last expression.

local: (local arg0 args...)
Introduces local definitions only visible within the body expressions.

let: (let arg0 args...)
Binds identifiers to values and evaluates the body expressions with those bindings.

set!: (set! special_function)
Mutates an existing binding to refer to a new value.

else: (else args...)
For use with cond.

if: (if special_function)
Evaluates the test expression and evaluates the `if` branch if not false and the `then` branch otherwise.

define: (define special_function)
Binds a value to an identifier in the current environment.

lambda: (lambda special_function)
Produces a procedure with the given parameters and body.

λ: (λ special_function)
Produces a procedure with the given parameters and body.

eq?: (eq? arg0 arg1)
Produces true if a and b are the same object or represent the same immediate value.

eqv?: (eqv? arg0 arg1)
Produces true if a and b are the same atomic value or the same object.

equal?: (equal? arg0 arg1)
Produces true if a and b are of the same structure or atomic value.

swap!: (swap! arg0 arg1)
Exchanges the values of two mutable bindings.

error: (error args...)
Throws an error with its message being the space-delimited concatenation of all arguments printed as printed by display.

void: (void args...)
Produces a void literal.

symbol?: (symbol? arg0)
Produces true if x is a symbol.

assert: (assert)

gensym: (gensym)

void?: (void?)

procedure?: (procedure?)

values: (values)

call-with-values: (call-with-values)

match: (match)

case: (case)

```
</details>

### bracket.math
<details>
```
+: (+ args...)
Adds numbers from left to right.

-: (- args...)
Subtracts numbers from left to right

*: (* args...)
Multiplies numbers from left to right

/: (/ args...)
Divides numbers from left to right.

quotient: (quotient arg0 arg1)
Produces the result of the integer division of a and b. That is, a/b truncated to an integer.

remainder: (remainder arg0 arg1)
Produces the remainder when a is divided by b with the same sign as a.

expt: (expt arg0 arg1)
Produces the result of a^b.

sqr: (sqr arg0)
Produces the square of x.

sqrt: (sqrt arg0)
Produces the square root of x.

cbrt: (cbrt arg0)
Produces the cube root of x.

<: (< args...)
Produces true if the arguments are in strictly increasing order.

<=: (<= args...)
Produces true if the arguments are in non-decreasing order.

>: (> args...)
Produces true if the arguments are in strictly decreasing order.

>=: (>= args...)
Produces true if the arguments are in non-increasing order.

=: (= args...)
Produces true if the arguments are all numerically equal.

abs: (abs arg0)
Produces the absolute value of x.

floor: (floor arg0)
Produes the greatest integer less than or equal to x.

ceiling: (ceiling arg0)
Produces the smallest integer greater than or equal to x.

round: (round arg0)
Produces the nearest integer to x.

truncate: (truncate arg0)
Produces x truncated towards 0.

positive?: (positive? arg0)
Produces true if x is strictly positive.

negative?: (negative? arg0)
Produces true if x is strictly negative.

max: (max args...)
Produces the largest of the given numbers.

min: (min args...)
Produces the smallest of the given numbers.

zero?: (zero? arg0)
Produces true if x is zero.

even?: (even? arg0)
Produces true if x is even.

odd?: (odd? arg0)
Produces true if x is odd.

add1: (add1 arg0)
Produces x plus 1.

sub1: (sub1 arg0)
Produces x minus 1.

number?: (number? arg0)
Produces true if x is a number.

gcd: (gcd)

lcm: (lcm)

modulo: (modulo)

clamp: (clamp)

sign: (sign)

hypot: (hypot)

```
</details>

### bracket.math.trig
<details>
```
exp: (exp arg0)
Produces the result of e^x.

log: (log args...)
Produces the result of ln(a) if b is not specified, and log_b(a) if b is specified.

sin: (sin arg0)
Produces the sine of x.

cos: (cos arg0)
Produces the cosine of x.

tan: (tan arg0)
Produces the tangent of x.

asin: (asin arg0)
Produces the arcsine of x.

acos: (acos arg0)
Produces the arccosine of x.

atan: (atan arg0)
Produces the arctangent of x.

pi: 3.141592653589793
The mathematical constant π.

euler.0: 2.718281828459045
Euler's constant e.

phi.0: 1.618033988749895
The golden ratio, φ.

gamma.0: 0.5772156649015329
The Euler-Mascheroni constant, γ.

sinh: (sinh)

cosh: (cosh)

tanh: (tanh)

asinh: (asinh)

acosh: (acosh)

atanh: (atanh)

log10: (log10)

log2: (log2)

degrees->radians: (degrees->radians)

radians->degrees: (radians->degrees)

atan2: (atan2)

sec: (sec)

csc: (csc)

cot: (cot)

asec: (asec)

acsc: (acsc)

acot: (acot)

sech: (sech)

csch: (csch)

coth: (coth)

asech: (asech)

acsch: (acsch)

acoth: (acoth)

```
</details>

### bracket.math.random
<details>
```
random: (random)

random-range: (random-range)

```
</details>

### bracket.system
<details>
```
sys-exec: (sys-exec args...)
Executes a system command with space-delimited arguments and both prints and returns STDOUT. Can only be used if the `sys-eval` feature is set and the environment is not sandboxed.

getenv: (getenv)

current-time: (current-time)

sleep: (sleep)

exit: (exit)

argv: (argv)

cwd: (cwd)

```
</details>

### bracket.testing
<details>
```
check-expect: (check-expect arg0 arg1)
Checks whether the value of the expr expression is equal? to the value produced by expected. If not, an error will be thrown.

check-satisfied: (check-satisfied arg0 arg1)
Checks whether the result of pred applied to expr is not false. If it is, an error will be thrown.

check-equal?: (check-equal?)

check-true: (check-true)

check-false: (check-false)

check-error: (check-error)

test-case: (test-case)

test-suite: (test-suite)

```
</details>

### bracket.logic
<details>
```
not: (not arg0)
Produces true if x is false; otherwise produces false.

true: #t
The boolean value true.

false: #f
The boolean value false.

and: (and args...)
Evaluates expressions from left to right and produces the first false value, or the last value if none are false. Short-circuits.

or: (or args...)
Evaluates expressions from left to right and produces the first non-false value, or the true if none are false. Short-circuits.

xor: (xor arg0 arg1)
Produces true if exactly one of a or b is not false.

boolean?: (boolean? arg0)
Produces true if x is a boolean.

iff: (iff)

any?: (any?)

all?: (all?)

implies: (implies)

nand: (nand)

nor: (nor)

```
</details>

### bracket.data.list
<details>
```
list: (list args...)
Produces a list containing the given arguments

list?: (list? arg0)
Produces true if x is a list.

pair?: (pair? arg0)
Produces true if x is a non-empty list.

cons?: (cons? arg0)
Produces true if x is a non-empty list.

null?: (null? arg0)
Produces true if x is the empty list.

empty?: (empty? arg0)
Produces true if x is the empty list.

cons: (cons arg0 arg1)
Produces a new list by prepending an element to a list.

empty: '()
The empty list.

null: '()
The empty list.

car: (car arg0)
Produces the first value in a pair.

first: (first arg0)
Produces the first value of a non-empty list.

second: (second arg0)
Produces the second value of a non-empty list.

third: (third arg0)
Produces the third value of a non-empty list.

fourth: (fourth arg0)
Produces the fourth value of a non-empty list.

fifth: (fifth arg0)
Produces the fifth value of a non-empty list.

sixth: (sixth arg0)
Produces the sixth value of a non-empty list.

seventh: (seventh arg0)
Produces the seventh value of a non-empty list.

eighth: (eighth arg0)
Produces the eighth value of a non-empty list.

ninth: (ninth arg0)
Produces the ninth value of a non-empty list.

tenth: (tenth arg0)
Produces the tenth value of a non-empty list.

eleventh: (eleventh arg0)
Produces the eleventh value of a non-empty list.

twelfth: (twelfth arg0)
Produces the twelfth value of a non-empty list.

thirteenth: (thirteenth arg0)
Produces the thirteenth value of a non-empty list.

fourteenth: (fourteenth arg0)
Produces the fourteenth value of a non-empty list.

fifteenth: (fifteenth arg0)
Produces the fifteenth value of a non-empty list.

last: (last arg0)
Produces the last value of a non-empty list.

last-pair: (last-pair arg0)
Produces the last pair of a non-empty list.

cdr: (cdr arg0)
Produces the second item in a pair.

rest: (rest arg0)
Produces everything after the first element in a list.

length: (length arg0)
Produces the number of elements in a list.

list-ref: (list-ref arg0 arg1)
Produces the element at index i in a list.

list-tail: (list-tail arg0 arg1)
Produces the sublist starting at index i.

append: (append args...)
Concatenates lists from left to right.

reverse: (reverse arg0)
Produces a list with the elements in reverse order.

take: (take)

drop: (drop)

take-while: (take-while)

drop-while: (drop-while)

partition: (partition)

zip: (zip)

unzip: (unzip)

flatten: (flatten)

remove: (remove)

remove-duplicates: (remove-duplicates)

index-of: (index-of)

member?: (member?)

count: (count)

```
</details>

### bracket.data.list.functional
<details>
```
build-list: (build-list arg0 arg1)
Produces a list of length n by applying a procedure to all indices from 0 to n - 1.

make-list: (make-list arg0 arg1)
Produces a list of length n with each element equal to v.

list-update: (list-update arg0 arg1 arg2)
Produces a list with the element at pos replaced by the result of applying updater to that element.

list-set: (list-set arg0 arg1 arg2)
Produces a list with the element at pos replaced by val.

map: (map args...)
Applies a procedure element-wise to one or more lists and produces a list of results. All lists must be of the same length and the i-th argument will be the current element of the i-th list.

andmap: (andmap args...)
Applies a predicate element-wise and produces false on the first false result; otherwise produces the last result. All lists must be of the same length and the i-th argument will be the current element of the i-th list.

ormap: (ormap args...)
Applies a predicate element-wise and produces true on the first non-false result; otherwise produces false. All lists must be of the same length and the i-th argument will be the current element of the i-th list.

for-each: (for-each args...)
Applies a procedure element-wise for side effects and produces void. All lists must be of the same length and the i-th argument will be the current element of the i-th list.

foldl: (foldl args...)
Reduces lists from left to right using a combining procedure and an initial value. All lists must be of the same length and the i-th argument will be the current element of the i-th list.

foldr: (foldr args...)
Reduces lists from right to left using a combining procedure and an initial value. All lists must be of the same length and the i-th argument will be the current element of the i-th list.

running-foldl: (running-foldl args...)
Produces a list of intermediate left-fold results, including the initial value. All lists must be of the same length and the i-th argument will be the current element of the i-th list.

running-foldr: (running-foldr args...)
Produces a list of intermediate right-fold results, including the initial value. All lists must be of the same length and the i-th argument will be the current element of the i-th list.

filter: (filter arg0 arg1)
Produces a list of elements for which the predicate produces true.

reduce: (reduce)

scanl: (scanl)

scanr: (scanr)

find: (find)

every?: (every?)

some?: (some?)

foldl1: (foldl1)

foldr1: (foldr1)

compose: (compose)

curry: (curry)

uncurry: (uncurry)

```
</details>

### bracket.data.string
<details>
```
string?: (string? arg0)
Produces true if x is a string.

char?: (char? arg0)
Produces true if x is a char.

string->symbol: (string->symbol arg0)
Converts a string to a symbol.

symbol->string: (symbol->string arg0)
Converts a symbol to a string.

string-length: (string-length arg0)
Produces the length of a string in characters.

string-ref: (string-ref arg0 arg1)
Produces the character at position i in a string.

string-append: (string-append args...)
Concatenates strings from left to right.

substring: (substring arg0 args...)
Produces the substring of str from index s up to, but not including e or the end of the string if e is not defined.

string=?: (string=? args...)
Produces true if all strings are equal.

string<?: (string<?)

string-ci=?: (string-ci=?)

string-upcase: (string-upcase)

string-downcase: (string-downcase)

string-trim: (string-trim)

string-trim-left: (string-trim-left)

string-trim-right: (string-trim-right)

string-split: (string-split)

string-join: (string-join)

string-contains?: (string-contains?)

string-prefix?: (string-prefix?)

string-suffix?: (string-suffix?)

char->integer: (char->integer)

integer->char: (integer->char)

string->chars: (string->chars)

chars->string: (chars->string)

```
</details>

### bracket.io
<details>
```
print: (print arg0)
Writes the textual representation of a value to the standard output.

println: (println arg0)
Writes the textual representation of a value to the standard output with a trailing newline.

display: (display arg0)
Writes the literal value or a representation of the value if unprintable to the standard output.

displayln: (displayln arg0)
Writes the literal value or a representation of the value if unprintable to the standard output with a trailing newline.

newline: (newline)

flush-output: (flush-output)

with-output-to-string: (with-output-to-string)

with-input-from-string: (with-input-from-string)

read: (read)

read-line: (read-line)

write: (write)

```
</details>


</details>
