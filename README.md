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
