import { Lexer, Cursor, Token, ParseError } from "./parser";

export interface ImportToken extends Token {
    className: string;
    relativePath: string;
}

export interface VariableDeclarationToken extends Token {
    name: string;
    type: string;
    initialValue: string;
}

export interface FunctionDeclarationToken extends Token {
    name: string;
    args: VariableDeclarationToken[];
    returnType: string;
}

export interface TagToken extends Token {
    type: string;
    className: string;
    properties: TagProperty[];
}

export interface TagProperty extends Token {
    name: string;
    value: string;
}

export class GDXLexer extends Lexer {
    getToken(): Token {
        return (
            this.import() ||
            this.variableDeclaration() ||
            this.functionDeclaration() ||
            this.tag()
        );
    }

    // Import lexer
    import(): ImportToken {
        this.openMatch();

        let token: ImportToken = null;

        this.match("import");
        if (this.foundMatch()) {
            const start = { ...this.getRange(-1).start };

            this.expectNext(
                "Expected name of the imported component"
            ).T_SYMBOL();
            const className = this.getStr(-1);

            this.expectNext(`Expected token "from"`).match("from");

            this.expectNext(`Expected path string`).T_STRING();
            const path = this.getStr(-1);
            const end = { ...this.getRange(-1).end };

            token = {
                tokenType: "IMPORT",
                range: { start, end },
                className,
                relativePath: path.slice(1, path.length - 1),
            };
        }

        this.closeMatch();

        return token;
    }

    // Variable declaration lexer
    variableDeclaration(
        requirePrefix: boolean = true
    ): VariableDeclarationToken {
        this.openMatch();

        let token: VariableDeclarationToken = null;

        this.match("var");
        if (requirePrefix) {
            this.and();
        }
        this.T_SYMBOL();

        if (this.foundMatch()) {
            const varName = this.getStr(-1);
            const start = this.getRange(-2).start;
            let type = "any";
            let initialValue = "";
            this.openMatch(true);
            if (this.match(":").and().T_SYMBOL().foundMatch()) {
                type = this.getStr(-1);
            }
            this.closeMatch();
            this.openMatch(true);
            if (this.match("=").and().T_LITERAL().foundMatch()) {
                initialValue = this.getStr(-1);
            }
            this.closeMatch();
            const end = this.getRange(-1).end;

            token = {
                tokenType: "VARDECLARATION",
                range: { start, end },
                name: varName,
                type: type,
                initialValue,
            };
        }

        this.closeMatch();

        return token;
    }

    // Function declaration lexer
    functionDeclaration(): FunctionDeclarationToken {
        this.openMatch();

        let token: FunctionDeclarationToken = null;

        this.match("func").and().T_SYMBOL();

        if (this.foundMatch()) {
            const funcName = this.getStr(-1);
            const start = this.getRange(-2).start;
            const args: VariableDeclarationToken[] = [];

            this.match("(");

            let currArg: VariableDeclarationToken =
                this.variableDeclaration(false);

            while (true) {
                if (currArg) {
                    args.push(currArg);
                } else break;

                if (!this.match(",").foundMatch()) break;

                currArg = this.variableDeclaration(false);
            }

            this.match(")");

            let returnType = "any";

            this.openMatch(true);
            if (this.match("->").and().T_SYMBOL().foundMatch()) {
                returnType = this.getStr(-1);
            }
            this.closeMatch();

            const end = this.getRange(-1).end;

            token = {
                tokenType: "FUNCDECLARATION",
                range: { start, end },
                name: funcName,
                args,
                returnType: returnType,
            };
        }

        this.closeMatch();

        return token;
    }

    // GDX Lexer
    tag(): TagToken {
        this.openMatch();

        let token: TagToken = null;

        this.openMatch();
        this.match("</").or().match("<");
        this.closeMatch();

        if (this.foundMatch()) {
            const tagOpen = this.getStr(-1);
            const start = this.getRange(-1).start;

            this.expectNext(`Expected tag class name`).T_SYMBOL();
            const className = this.getStr(-1);

            const props = this.tagProperties();

            this.expectNext(`Expected tag close "/>" or ">"`);
            this.openMatch();
            this.match("/>").or().match(">");
            this.closeMatch();

            const tagClose = this.getStr(-1);
            const end = this.getRange(-1).end;
            const tagCloseStart = this.getRange(-1).start;

            let tagType = "";

            if (tagOpen === "<") {
                if (tagClose === ">") {
                    tagType = "OPEN";
                } else {
                    tagType = "SINGLE";
                }
            } else {
                if (tagClose === ">") {
                    tagType = "CLOSE";
                } else {
                    throw new ParseError(
                        `Can't end closing tag with "/>"`,
                        tagCloseStart
                    );
                }
            }

            token = {
                tokenType: "TAG",
                range: { start, end },
                type: tagType,
                className,
                properties: props,
            };
        }

        this.closeMatch();
        return token;
    }

    tagProperties(): TagProperty[] {
        this.openMatch(true);

        const props: TagProperty[] = [];

        while (!this.currentMatch.cursor.eof) {
            this.openMatch();
            this.T_SYMBOL(true).and().match("=");
            this.closeMatch();
            if (this.foundMatch()) {
                const propName = this.getStr(-3);
                const start = this.getRange(-3).start;

                this.openMatch();
                this.T_LITERAL()
                    .or()
                    .T_FUNCTION()
                    .or()
                    .T_SYMBOL()
                    .or()
                    .T_GDBLOCK()
                    .expectPrev(`Expected value`);
                this.closeMatch();

                const propValue = this.getStr(-2);
                const end = this.getRange(-2).end;
                props.push({
                    tokenType: "TAGPROPERTY",
                    range: { start, end },
                    name: propName,
                    value: propValue,
                });
            } else break;
        }

        this.closeMatch();

        return props;
    }

    // TOKENS
    T_SYMBOL(prop: boolean = false): this {
        if (prop) {
            this.match(/(_|[a-z]|[A-Z])(_|:|\.|[a-z]|[A-Z]|[0-9])*/g);
        } else {
            this.match(/(_|[a-z]|[A-Z])(_|\.|[a-z]|[A-Z]|[0-9])*/g);
        }

        return this;
    }

    T_LITERAL(): this {
        this.openMatch();

        this.T_STRING().or().T_FLOAT().or().T_INT();

        this.closeMatch();

        return this;
    }

    T_STRING(): this {
        this.openMatch();

        this.match(/\"\"\"(.|\n)*\"\"\"/g);
        if (this.foundMatch()) {
            let str: string = this.getStr(-1);
            str = str
                .slice(2, str.length - 2)
                .replace(/\t/g, "")
                .replace(/\n/g, " ")
                .replace(/ +/g, " ");
            this.setStr(-1, str);
        } else {
            this.match(/\".*?\"|\'.*?\'/g);
        }

        this.closeMatch();

        return this;
    }

    T_FLOAT(): this {
        this.openMatch();

        this.match(/[+-]?[0-9]+\.[0-9]*e[+-]?[0-9]+/g)
            .or()
            .match(/[+-]?[0-9]+\.[0-9]*[fF]?/g)
            .or()
            .match(/[+-]?[0-9]+/g);

        this.closeMatch();

        return this;
    }

    T_INT(): this {
        this.openMatch();

        this.match(/[+-]?0x([0-9]|[a-f]|[A-F])+/g)
            .or()
            .match(/[+-]?0b[01]+/g)
            .or()
            .match(/[+-]?[0-9]+/g);

        this.closeMatch();

        return this;
    }

    T_GDBLOCK(): this {
        this.openMatch();
        let found = false;

        this.match("{");

        if (this.foundMatch()) {
            let lvl = 0;

            while (!this.currentMatch.cursor.eof) {
                if (this.match("{").foundMatch()) lvl++;
                else if (this.match("}").foundMatch()) {
                    lvl--;
                    if (lvl < 0) break;
                } else this.currentMatch.cursor.walk();
            }

            if (lvl >= 0) {
                throw new ParseError(
                    `Couldn't find GD block end`,
                    this.currentMatch.cursor
                );
            }

            found = true;
        }

        this.closeMatch();

        if (found) {
            const s = this.getStr(-1);
            const r = this.getRange(-1);
            this.setStr(-1, s.slice(1, s.length - 1));
            this.setRange(-1, r.start.pos + 1, r.end.pos - 1);
        }

        return this;
    }

    T_FUNCTION(): this {
        this.openMatch();

        this.T_SYMBOL().and().match("(");
        if (this.foundMatch()) {
            let i = 0;
            while (!this.currentMatch.cursor.eof) {
                if (i % 2 === 0) {
                    this.openMatch();
                    this.T_LITERAL()
                        .or()
                        .T_FUNCTION()
                        .or()
                        .T_SYMBOL()
                        .or()
                        .T_GDBLOCK();
                    if (i > 0) {
                        this.expectPrev(`Expected value`);
                    }
                    this.closeMatch();
                    if (!this.foundMatch()) break;
                } else {
                    if (!this.match(",").foundMatch()) break;
                }
                i++;
            }
            this.expectNext(`Expected ")"`).match(")");
        }

        this.closeMatch();
        return this;
    }
}
