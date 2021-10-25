import glob from 'glob';
import fs from 'fs';
import path from 'path';

class GDXError extends Error {
	constructor(message, cursor = {}) {
		super(`Parse error at line ${cursor.line + 1} column ${cursor.column + 1}: ${message}`);
	}
}

function sfc32(a, b, c, d) {
	return function () {
		a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
		var t = (a + b) | 0;
		a = b ^ b >>> 9;
		b = c + (c << 3) | 0;
		c = (c << 21 | c >>> 11);
		d = d + 1 | 0;
		t = t + d | 0;
		c = c + t | 0;
		return (t >>> 0) / 4294967296;
	}
}

function randomId(length, seed0, seed1, seed2, seed3) {
	var result = '';
	var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	var charactersLength = characters.length;
	var rng = sfc32(seed0, seed1 || 1, seed2 || 2, seed3 || 3);
	for (var i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(rng() * charactersLength));
	}
	return result;
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
			let foundComment = false;

			while (this.char === ' '
				|| this.char === '\n'
				|| this.char === '\t') this.walk();

			if (this.char === '#') {
				while (!this.eof && this.char !== '\n') {
					this.walk();
				}
				foundComment = true;
			}

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
					matchStack.push(input.slice(tCursor.pos, cursorEndStack[cursorEndStack.length - 1].pos));
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

	function matchWhile(str) {
		while (!cursor.eof) {
			if (!match(str)) break;
		}

		return true;
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
		let tCursor = { ...cursor };
		if (match(str)) {
			return true;
		}
		if (typeof msg === 'string') {
			throw new GDXError(msg, tCursor);
		} else if (typeof msg === 'function') {
			throw new GDXError(msg(), tCursor);
		}
	}

	// Import Lexer
	function importStatement() {
		if (match("import")) {
			const start = getCursorStart(-1);
			expect(T_SYMBOL, "Expected name of the imported component");
			const className = getStr(-1);
			expect("from", `Expected token "from"`);
			expect(T_STRING, "Expected path string");
			const relativePath = getStr(-1);
			const end = getCursorEnd(-1);

			return {
				tokenType: "IMPORT",
				className,
				relativePath: relativePath.slice(1, relativePath.length - 1),
				range: [start.pos, end.pos]
			}
		}
		return false;
	}

	// GDX Lexer
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

			body.tokenType = "GDX";
			body.range = [cStart.pos, cEnd.pos];
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
					thisTag.children = [];
					if (tagStack.length === 0) {
						if (Object.keys(body).length > 0) {
							throw new GDXError(`Can only return one node`, thisTag.cursor);
						}
						body = thisTag;
					} else {
						tagStack[tagStack.length - 1].children.push(thisTag);
					}
					break;
				}
				case "CLOSE": {
					if (tagStack.length === 0) {
						throw new GDXError(`Can only return one node`, thisTag.cursor);
					}
					let parentTag = tagStack.pop();
					if (parentTag.className === thisTag.className) {
						parentTag.children = parentTag.children || [];
						if (tagStack.length === 0) {
							body = parentTag;
						} else {
							tagStack[tagStack.length - 1].children.push(parentTag);
						}
					} else {
						throw new GDXError(`This tag is not matching opening tag "${parentTag.className}"`, thisTag.cursor);
					}
					break;
				}
				case "TEXT": {
					if (tagStack.length === 0) {
						throw new GDXError(`Text can only be inside a tag`, thisTag.cursor);
					}

					let parentTag = tagStack[tagStack.length - 1];
					parentTag.properties.text = thisTag.text;
					break;
				}
			}

			cursor.skipIgnore();
		}

		if (tagStack.length > 0) {
			throw new GDXError(`Couldn't find closing tag`, tagStack[tagStack.length - 1].cursor);
		}

		function convertTag(tag) {
			const key = tag.properties.key;
			let id = randomId(
				4, tag.cursor.line, tag.cursor.column,
				tag.cursor.line, tag.cursor.column
			);
			id = `"${id}"`;
			if (key !== undefined) {
				id += `+str(${key})`;
			}

			let converted = {
				id,
				className: tag.className,
				properties: tag.properties,
				children: tag.children
			};

			converted.children = converted.children.map((t, idx) => convertTag(t));

			return converted;
		}

		return convertTag(body);
	}

	function tag() {
		if (T_STRING()) {
			return {
				type: "TEXT",
				text: getStr(-1),
				cursor: getCursorStart(-1)
			}
		}

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
		return T_GDBLOCK() || T_ACCESSOR() || T_FUNCTION() || T_LITERAL() || T_SYMBOL();
	}

	function T_SYMBOL() {
		return match(/(_|[a-z]|[A-Z])(_|:|[a-z]|[A-Z]|[0-9])*/g);
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
		if (match(/\"\"\"(.|\n)*\"\"\"/g)) {
			let str = getStr(-1);
			str = str.slice(2, str.length - 2).replace(/\t/g, "");
			str = str.replace(/\n/g, " ");
			str = str.replace(/ +/g, " ");
			setStr(-1, str);
			return true;
		}

		return match(/\".*?\"|\'.*?\'/g);
	}

	function T_ACCESSOR() {
		let any = () => {
			return T_GDBLOCK() || T_FUNCTION() || T_LITERAL() || T_SYMBOL();
		}

		return match(() => {
			return any() && match(".") && expect(any, `Expected value`) &&
				matchWhile(() => match(".") && expect(any, `Expected value`))
		}, true);
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
		const body = gdxBlock() || importStatement();
		if (body) yield body;
		else cursor.walk();
	}
}

function stringify(json) {
	let s = "";

	if (Array.isArray(json)) {
		const n = json.length;

		s += "[";

		for (let i = 0; i < n; i++) {
			let val = json[i];

			if (typeof val === 'object') val = stringify(val);

			s += `${val}`;

			if (i < n - 1) {
				s += ",";
			}
		}

		s += "]";
	} else {
		const keys = Object.keys(json);
		const n = keys.length;

		s += "{";

		for (let i = 0; i < n; i++) {
			const key = keys[i];
			let val = json[key];

			if (typeof val === 'object') val = stringify(val);

			s += `"${key}":${val}`;

			if (i < n - 1) {
				s += ",";
			}
		}

		s += "}";
	}

	return s;
}

function compile() {
	glob("**/*.gdx", function (err, files) {
		if (err) {
			console.error(err);
			return;
		}

		files.forEach(file => {
			const folder = path.dirname(file);
			const inputFileName = path.basename(file, '.gdx');
			const outputPath = path.join(folder, inputFileName + ".gd");
			let input = fs.readFileSync(file, 'utf8').replace(/\r?\n|\r/g, "\n");

			let off = 0;

			try {
				for (const token of parse(input)) {
					if (token.tokenType === "GDX") {
						let block = { ...token };
						const range = block.range;
						delete block.tokenType;
						delete block.range;

						let prefix = input.slice(0, off + range[0]);
						let parsedStr = stringify(block);
						let suffix = input.slice(off + range[1]);

						input = prefix + parsedStr + suffix;

						const prevLen = (range[1] - range[0]);
						const newLen = parsedStr.length;
						const diff = newLen - prevLen;

						off += diff;
					} else if (token.tokenType === "IMPORT") {
						const className = token.className;
						const p = path.join(folder, token.relativePath);
						const range = token.range;

						let prefix = input.slice(0, off + range[0]);
						let parsedStr = `var ${className} = ResourceLoader.load("${p}")`;
						let suffix = input.slice(off + range[1]);

						input = prefix + parsedStr + suffix;

						const prevLen = (range[1] - range[0]);
						const newLen = parsedStr.length;
						const diff = newLen - prevLen;

						off += diff;
					}
				}

				fs.writeFileSync(outputPath, input, "utf8");
			} catch (e) {
				console.error(e);
			}
		});
	});
}

function clear() {
	glob("**/*.gd", function (err, files) {
		if (err) {
			console.error(err);
			return;
		}

		files.forEach(file => {
			fs.rmSync(file);
		});
	});
}

console.clear();

clear();
compile();
