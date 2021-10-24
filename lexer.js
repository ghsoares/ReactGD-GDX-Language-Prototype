import fs from 'fs';

class GDXError extends Error {
	constructor(message, cursor = {}) {
		super(`Parse error at line ${cursor.line + 1} column ${cursor.column + 1}: ${message}`);
	}
}

function createCursor(input) {
	return {
		input,
		inputLength: input.length,
		pos: 0,
		char: input[0],
		line: 0,
		column: 0,
		eof: false,
		lineBreak: false,
		walk: function (back) {
			if (back) {
				this.pos--;
				this.column--;
				if (this.lineBreak) {
					this.line--;
					this.column = 0;
					for (let i = this.pos - 1; i >= 0; i--) {
						if (this.input[i] === '\n') break;
						this.column++;
					}
				}
			} else {
				this.pos++;
				this.column++;
				if (this.lineBreak) {
					this.line++;
					this.column = 0;
				}
			}

			this.char = this.input[this.pos];
			this.eof = this.char === undefined;
			this.lineBreak = this.char === '\n';
			return this;
		},
		walkTimes: function (times, back) {
			for (let i = 0; i < times; i++) {
				this.walk(back);
			}
			return this;
		},
		move: function (pos) {
			if (pos < 0) pos = 0;
			if (pos > this.inputLength - 1) pos = this.inputLength - 1;
			if (pos === this.pos) return;

			this.pos = 0;
			this.char = input[0];
			this.line = 0;
			this.column = 0;
			this.eof = false;
			this.lineBreak = input[0] === '\n';

			while (this.pos < pos) this.walk();

			return this;
		},
		skipIgnore: function () {
			while (this.char === ' '
				|| this.char === '\n'
				|| this.char === '\t') this.walk();
		},
		toString: function () {
			return `(P:${this.pos} L:${this.line} C:${this.column} "${this.char}")`;
		}
	};
}

function* parse(input = "") {
	let cursor = createCursor(input);
	let matchStack = [];
	let cursorStartStack = [];
	let cursorEndStack = [];

	// Helper methods
	function log(msg) { console.log(msg); return true; }

	function logMatchStack() { console.log(matchStack); return true; }

	function logCursorStartStack() { console.log(cursorStartStack.map(val => val.toString())); return true; }

	function logCursorEndStack() { console.log(cursorEndStack.map(val => val.toString())); return true; }

	// Parser methods
	function getStr(pos) {
		if (matchStack.length === 0) return input;
		while (pos < 0) {
			pos += matchStack.length;
		}
		while (pos >= matchStack.length) {
			pos -= matchStack.length;
		}
		return matchStack[pos];
	}

	function getCursorStart(pos) {
		if (cursorStartStack.length === 0) return createCursor(input);
		while (pos < 0) {
			pos += cursorStartStack.length;
		}
		while (pos >= cursorStartStack.length) {
			pos -= cursorStartStack.length;
		}
		return cursorStartStack[pos];
	}

	function getCursorEnd(pos) {
		if (cursorEndStack.length === 0) return createCursor(input);
		while (pos < 0) {
			pos += cursorEndStack.length;
		}
		while (pos >= cursorEndStack.length) {
			pos -= cursorEndStack.length;
		}
		return cursorEndStack[pos];
	}

	function setStr(pos, str) {
		if (matchStack.length === 0) return input;
		while (pos < 0) {
			pos += matchStack.length;
		}
		while (pos >= matchStack.length) {
			pos -= matchStack.length;
		}
		matchStack[pos] = str;
	}

	function match(str, ...args) {
		cursor.skipIgnore();

		if (typeof str === 'string') {
			if (input.slice(cursor.pos, cursor.pos + str.length) === str) {
				matchStack.push(str);
				cursorStartStack.push({ ...cursor });
				cursor.walkTimes(str.length);
				cursorEndStack.push({ ...cursor });
				return true;
			}
		} else if (typeof str === 'function') {
			let tCursor = { ...cursor };
			let mPos = matchStack.length;
			if (str()) {
				if (args[0] === true) {
					matchStack.push(input.slice(tCursor.pos, cursor.pos));
				} else {
					matchStack.push(matchStack.slice(mPos).join(""));
				}
				cursorStartStack.push(tCursor);
				cursorEndStack.push({ ...cursor });
				return true;
			} else {
				matchStack = matchStack.slice(0, mPos);
				cursorStartStack = cursorStartStack.slice(0, mPos);
				cursorEndStack = cursorEndStack.slice(0, mPos);
				cursor.move(tCursor.pos);
			}
		} else if (str instanceof RegExp) {
			let m = str.exec(input.slice(cursor.pos));
			if (m && m.index === 0) {
				matchStack.push(m[0]);
				cursorStartStack.push({ ...cursor });
				cursor.walkTimes(m[0].length);
				cursorEndStack.push({ ...cursor });
				return true;
			}
		}

		return false;
	}

	function matchUntil(str) {
		while (!cursor.eof) {
			if (match(str)) {
				return true;
			} else cursor.walk();
		}

		return false;
	}

	function matchScope(strOpen, strClose) {
		if (!match(strOpen)) return;
		let lvl = 0;
		while (!cursor.eof) {
			if (match(strOpen)) lvl++;
			else if (match(strClose)) {
				lvl--;
				if (lvl < 0) {
					return true;
				}
			} else cursor.walk()
		}
		return false;
	}

	function expect(str, msg = "") {
		if (match(str)) {
			return true;
		}
		if (typeof msg === 'string') {
			throw new GDXError(msg, cursor);
		} else if (typeof msg === 'function') {
			throw new GDXError(msg(), cursor);
		}
	}

	// Lexer
	function gdxBlock() {
		let cStart;
		let cEnd;
		const foundBlock = match(() => {
			return match(T_GDX_BLOCK_START) && (cStart = getCursorStart(-1)) &&
				expect(() => matchUntil(() => {
					return match(T_GDX_BLOCK_END) && (cEnd = getCursorEnd(-1));
				}));
		});
		if (foundBlock) {
			cursor.move(cStart.pos + 1);

			const body = gdxBody(cEnd.pos - 1);

			cursor.move(cEnd.pos - 1);

			return body;
		}
	}

	function gdxBody(end) {
		let body = {};
		let tagStack = [];

		while (!cursor.eof && cursor.pos < end) {
			let thisTag = tag();
			switch (thisTag.type) {
				case "OPEN": {
					if (tagStack.length === 0) {
						if (Object.keys(body).length > 0) {
							throw new GDXError(`Can only return one node`, thisTag.cursor);
						}
					}
					thisTag.children = [];
					tagStack.push(thisTag);
					break;
				}
				case "SINGLE": {
					if (tagStack.length === 0) {
						if (Object.keys(body).length > 0) {
							throw new GDXError(`Can only return one node`, thisTag.cursor);
						}
						body = thisTag;
					} else {
						tagStack[tagStack.length - 1].children.push(thisTag);
					}
				}
				case "CLOSE": {
					if (tagStack.length === 0) {
						throw new GDXError(`Can only return one node`, thisTag.cursor);
					}
					let parentTag = tagStack.pop();
					if (parentTag.className === thisTag.className) {
						if (tagStack.length === 0) {
							body = parentTag;
						} else {
							tagStack[tagStack.length - 1].children.push(parentTag);
						}
					} else {
						throw new GDXError(`This tag is not matching opening tag "${parentTag.className}"`, thisTag.cursor);
					}
				}
			}

			cursor.skipIgnore();
		}

		if (tagStack.length > 0) {
			throw new GDXError(`Couldn't find closing tag`, tagStack[tagStack.length - 1].cursor);
		}

		function convertTag(tag) {
			let converted = {
				className: tag.className,
				properties: tag.properties,
				children: tag.children
			};

			converted.children = converted.children.map(t => convertTag(t));

			return converted;
		}

		return convertTag(body);
	}

	function tag() {
		expect(() => match("</") || match("<"), `Expected "<" or "</`);
		const tagStart = getStr(-1);
		const cursorTagStart = getCursorStart(-1);
		expect(T_SYMBOL, "Expected tag class name");
		const className = getStr(-1);
		const properties = tagProperties();
		const cursorPropertiesStart = getCursorStart(-1);
		expect(() => match("/>") || match(">"), `Expected ">" or "/>`);
		const tagEnd = getStr(-1);
		const cursorTagEnd = getCursorStart(-1);

		let type;
		if (tagStart === "<") {
			if (tagEnd === ">") {
				type = "OPEN";
			} else if (tagEnd === "/>") {
				type = "SINGLE";
			}
		} else if (tagStart === "</") {
			if (tagEnd === ">") {
				type = "CLOSE";
			} else if (tagStart === "/>") {
				throw new GDXError(`Can't close with "/>"`, cursorTagEnd);
			}
		}
		if (type === "CLOSE" && Object.keys(properties).length > 0) {
			throw new GDXError(`Can't assign properties to close tag`, cursorPropertiesStart);
		}

		return {
			type,
			className,
			properties,
			cursor: cursorTagStart
		};
	}

	function tagProperties() {
		const props = {};

		while (!cursor.eof) {
			let propName;
			let propValue;
			if (match(() => {
				return T_SYMBOL() && (propName = getStr(-1)) && match("=")
					&& T_VALUE() && (propValue = getStr(-1))
			})) {
				props[propName] = propValue;
			} else break;
		}

		return props;
	}

	// Tokens
	function T_GDX_BLOCK_START() {
		return match("(") && match("<");
	}

	function T_GDX_BLOCK_END() {
		return match(">") && match(")");
	}

	function T_VALUE() {
		return T_GDBLOCK() || T_FUNCTION() || T_LITERAL() || T_SYMBOL();
	}

	function T_SYMBOL() {
		return match(/(_|[a-z]|[A-Z])(_|[a-z]|[A-Z]|[0-9])*/g);
	}

	function T_LITERAL() {
		return T_STRING() || T_FLOAT() || T_INT();
	}

	function T_INT() {
		return match(/[+-]?0x([0-9]|[a-f]|[A-F])+/g)
			|| match(/[+-]?0b[01]+/g)
			|| match(/[+-]?[0-9]+/g);
	}

	function T_FLOAT() {
		return match(/[+-]?[0-9]+\.[0-9]*e[+-]?[0-9]+/g)
			|| match(/[+-]?[0-9]+\.[0-9]*[fF]?/g)
			|| match(/[+-]?[0-9]+/g);
	}

	function T_STRING() {
		return match(/\".*?\"|\'.*?\'/g);
	}

	function T_GDBLOCK() {
		let mPos = matchStack.length;
		const foundBlock = match(() => matchScope("{", "}"));
		if (foundBlock) {
			setStr(-1, input.slice(
				getCursorStart(mPos).pos + 1, getCursorEnd(-1).pos - 1
			));
			return true;
		}
	}

	function T_FUNCTION() {
		return match(() => {
			return T_SYMBOL() && match("(")
				&& T_FUNCTION_BODY()
				&& expect(")", `Expected ")"`)
		}, true);
	}

	function T_FUNCTION_BODY() {
		if (T_VALUE()) {
			while (!cursor.eof) {
				if (!match(() => match(",") && T_VALUE())) break;
			}
		}
		return true;
	}

	while (!cursor.eof) {
		const body = gdxBlock();
		if (body) yield body;
		else cursor.walk();
	}
}

function test(input) {
	// Convert possible line breaks into single line break
	input = input.replace(/\r?\n|\r/g, "\n");

	var start = Date.now();
	console.log("--start--");

	for (const token of parse(input)) {
		console.log(token);
	}

	console.log("--finish--");
	var elapsed = Date.now() - start;
	console.log(`Parsed in ${elapsed} ms`)
}

console.clear();
fs.readFile('input.txt', 'utf8', (err, data) => {
	if (err) {
		console.error(err)
		return
	}
	test(data);
})



