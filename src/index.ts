console.clear();

import { GDXLexer, GDXParser } from "./language/GDXLanguage";

const source = `extends ReactGDComponent
import ClickButton from "./clickButton.gdx"

func on_button_pressed() -> void:
    pass

func render():
    var btn1 = <ClickButton
        key=i
        on_pressed=on_button_pressed
        rect_size={get_button_size()}
    />
    var btn2 = <ClickButton children=children/>`;

const lexer = new GDXLexer();
const parser = new GDXParser(lexer, "scripts/clicker.gdx", "res://scripts/clicker", "res://scripts/");

const start = Date.now();
const parsed = parser.parse(source);
const elapsed = Date.now() - start;

console.log(parsed);
console.log(`${elapsed} ms elapsed`);
/*lexer.setSource(source);

for (const token of lexer.tokenize()) {
    if (token.tokenType === "GDXBLOCK") {
        const t = token as GDXBlockToken;
        console.log(t.tags[0].properties);
    }
}*/


