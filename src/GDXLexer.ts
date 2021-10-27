import { Lexer, Cursor, Token } from "./parser";

export interface ImportToken extends Token {
	className: string;
	relativePath: string;
}

export interface ClassNameToken extends Token {
	className: string;
}

export interface TagToken extends Token {
	id: string;
	className: string;
	properties: { [key: string]: string };
	children: TagToken[];
}

export class GDXLexer extends Lexer {
	constructor(input: string) {
			super(input);
	}

	getToken(): Token {
			return (
					this.gdxBlockToken() || this.importToken() || this.classNameToken()
			);
	}

	// GDX Lexer
	gdxBlockToken(): TagToken {
			let start: Cursor;
			let end: Cursor;

			const foundBlock = this.match(() => {
					return (
							this.match(this.T_GDX_BLOCK_START) &&
							this.expect(
									() =>
											this.matchUntil(() => {
													return this.match(this.T_GDX_BLOCK_END);
											}),
									`Couldn't find block close`
							)
					);
			});

			if (foundBlock) {
			}

			return null;
	}

	// Import lexer
	importToken(): ImportToken {
			if (this.match("import")) {
					const start = this.getCursorStart(-1);
					this.expect(
							this.T_SYMBOL,
							"Expected name of the imported component"
					);
					const className = this.getStr(-1);
					this.expect("from", `Expected token "from"`);
					this.expect(this.T_STRING, "Expected path string");
					const relativePath = this.getStr(-1);
					const end = this.getCursorEnd(-1);

					return {
							tokenType: "IMPORT",
							range: [start, end],
							className,
							relativePath: relativePath.slice(1, relativePath.length - 1),
					};
			}

			return null;
	}

	// Class name Lexer
	classNameToken(): ClassNameToken {
			if (this.match("class_name")) {
					const start = this.getCursorStart(-1);
					this.expect(this.T_SYMBOL, "Expected name");
					const className = this.getStr(-1);
					const end = this.getCursorEnd(-1);

					return {
							tokenType: "CLASSNAME",
							className,
							range: [start, end],
					};
			}

			return null;
	}

	// TOKENS
	T_GDX_BLOCK_START(): boolean {
			return this.match("(") && this.match("<");
	}

	T_GDX_BLOCK_END(): boolean {
			return this.match(">") && this.match(")");
	}

	T_VALUE(): boolean {
			return (
					this.T_GDBLOCK() ||
					this.T_ACCESSOR() ||
					this.T_FUNCTION_CALL() ||
					this.T_LITERAL() ||
					this.T_SYMBOL()
			);
	}

	T_SYMBOL(): boolean {
			return this.match(/(_|[a-z]|[A-Z])(_|:|[a-z]|[A-Z]|[0-9])*/g);
	}

	T_LITERAL(): boolean {
			return this.T_STRING() || this.T_FLOAT() || this.T_INT();
	}

	T_INT(): boolean {
			return (
					this.match(/[+-]?0x([0-9]|[a-f]|[A-F])+/g) ||
					this.match(/[+-]?0b[01]+/g) ||
					this.match(/[+-]?[0-9]+/g)
			);
	}

	T_FLOAT(): boolean {
			return (
					this.match(/[+-]?[0-9]+\.[0-9]*e[+-]?[0-9]+/g) ||
					this.match(/[+-]?[0-9]+\.[0-9]*[fF]?/g) ||
					this.match(/[+-]?[0-9]+/g)
			);
	}

	T_STRING(): boolean {
			if (this.match(/\"\"\"(.|\n)*\"\"\"/g)) {
					let str: string = this.getStr(-1);
					str = str.slice(2, str.length - 2).replace(/\t/g, "");
					str = str.replace(/\n/g, " ");
					str = str.replace(/ +/g, " ");
					this.setStr(-1, str);
					return true;
			}

			return this.match(/\".*?\"|\'.*?\'/g);
	}

	T_ACCESSOR(): boolean {
			const any = function (): boolean {
					return (
							this.T_GDBLOCK() ||
							this.T_FUNCTION() ||
							this.T_LITERAL() ||
							this.T_SYMBOL()
					);
			};

			return this.match(() => {
					return (
							any() &&
							this.match(".") &&
							this.expect(any, `Expected value`) &&
							this.matchWhile(
									() => this.match(".") && this.expect(any, `Expected value`)
							)
					);
			}, true);
	}

	T_GDBLOCK(): boolean {
			let mPos = this.matchStack.length;
			const foundBlock = this.match(() => this.matchScope("{", "}"));
			if (foundBlock) {
					this.setStr(
							-1,
							this.input.slice(
									this.getCursorStart(mPos).pos + 1,
									this.getCursorEnd(-1).pos - 1
							)
					);
					return true;
			}
			return false;
	}

	T_FUNCTION_CALL(): boolean {
			return this.match(() => {
					return (
							this.T_SYMBOL() &&
							this.match("(") &&
							this.T_FUNCTION_CALL_BODY() &&
							this.expect(")", `Expected ")"`)
					);
			}, true);
	}

	T_FUNCTION_CALL_BODY(): boolean {
			if (this.T_VALUE()) {
					return this.matchWhile(() => {
							return (
									this.match(",") &&
									this.expect(this.T_VALUE, `Expected value`)
							);
					});
			}
			return true;
	}
}